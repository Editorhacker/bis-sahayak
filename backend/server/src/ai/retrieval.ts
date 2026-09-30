import { db, schema } from '../db/index.js';
import { sql, and, eq, or, ilike, desc, inArray, type SQL } from 'drizzle-orm';
import { embeddingProvider, sanitizeForLLM, createPromptInjectionDefense } from './llm.js';

export interface RetrievalResult {
  chunkId: number;
  documentId: number;
  content: string;
  section: string | null;
  clause: string | null;
  page: number | null;
  standardNumber: string | null;
  sourceUrl: string | null;
  docType: string | null;
  authority: string | null;
  score: number;
  rank: number;
}

export interface RetrievalFilters {
  docTypes?: string[];
  standardNumbers?: string[];
  standardStatus?: string[];
  authorities?: string[];
}

const FTS_WEIGHT = 1.0;
const VECTOR_WEIGHT = 1.0;
const RRF_K = 60;
const MAX_RESULTS = 8;

export async function hybridSearch(
  query: string,
  filters: RetrievalFilters = {},
  limit = MAX_RESULTS
): Promise<RetrievalResult[]> {
  let ftsResults: RetrievalResult[] = [];
  let vectorResults: RetrievalResult[] = [];

  try {
    ftsResults = await ftsSearch(query, filters, 30);
  } catch (error) {
    console.error('FTS search failed:', error);
  }

  try {
    const queryEmbedding = await embeddingProvider.embed(query);
    const queryVector = `[${queryEmbedding.join(',')}]`;
    vectorResults = await vectorSearch(queryVector, filters, 30);
  } catch (error) {
    console.error('Vector search skipped:', error);
  }

  const merged = reciprocalRankFusion(ftsResults, vectorResults);
  
  return merged.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

async function ftsSearch(
  query: string,
  filters: RetrievalFilters,
  limit: number
): Promise<RetrievalResult[]> {
  const conditions = [sql`chunks.tsv @@ plainto_tsquery('simple', ${query})`];
  
  if (filters.docTypes?.length) {
    conditions.push(inArray(schema.documents.docType, filters.docTypes as never));
  }
  if (filters.standardNumbers?.length) {
    conditions.push(inArray(schema.documents.standardNumber, filters.standardNumbers));
  }
  if (filters.authorities?.length) {
    conditions.push(inArray(schema.documents.authority, filters.authorities));
  }

  const whereClause = and(...conditions);

  const results = await db
    .select({
      chunkId: schema.chunks.id,
      documentId: schema.chunks.documentId,
      content: schema.chunks.content,
      section: schema.chunks.section,
      clause: schema.chunks.clause,
      page: schema.chunks.page,
      standardNumber: schema.documents.standardNumber,
      sourceUrl: schema.documents.sourceUrl,
      docType: schema.documents.docType,
      authority: schema.documents.authority,
      rank: sql<number>`row_number() over (order by ts_rank_cd(chunks.tsv, plainto_tsquery('simple', ${query})) desc)`.as('rank'),
    })
    .from(schema.chunks)
    .innerJoin(schema.documents, eq(schema.chunks.documentId, schema.documents.id))
    .where(whereClause)
    .orderBy(desc(sql`ts_rank_cd(chunks.tsv, plainto_tsquery('simple', ${query}))`))
    .limit(limit);

  return results.map(r => ({
    ...r,
    score: 1 / (RRF_K + r.rank),
  }));
}

async function vectorSearch(
  queryVector: string,
  filters: RetrievalFilters,
  limit: number
): Promise<RetrievalResult[]> {
  const conditions: SQL[] = [];

  if (filters.docTypes?.length) {
    conditions.push(inArray(schema.documents.docType, filters.docTypes as never));
  }
  if (filters.standardNumbers?.length) {
    conditions.push(inArray(schema.documents.standardNumber, filters.standardNumbers));
  }
  if (filters.authorities?.length) {
    conditions.push(inArray(schema.documents.authority, filters.authorities));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const results = await db
    .select({
      chunkId: schema.chunks.id,
      documentId: schema.chunks.documentId,
      content: schema.chunks.content,
      section: schema.chunks.section,
      clause: schema.chunks.clause,
      page: schema.chunks.page,
      standardNumber: schema.documents.standardNumber,
      sourceUrl: schema.documents.sourceUrl,
      docType: schema.documents.docType,
      authority: schema.documents.authority,
      rank: sql<number>`row_number() over (order by chunks.embedding <=> ${queryVector}::vector)`.as('rank'),
    })
    .from(schema.chunks)
    .innerJoin(schema.documents, eq(schema.chunks.documentId, schema.documents.id))
    .where(whereClause)
    .orderBy(sql`chunks.embedding <=> ${queryVector}::vector`)
    .limit(limit);

  return results.map(r => ({
    ...r,
    score: 1 / (RRF_K + r.rank),
  }));
}

function reciprocalRankFusion(
  ftsResults: RetrievalResult[],
  vectorResults: RetrievalResult[]
): RetrievalResult[] {
  const scoreMap = new Map<number, RetrievalResult>();

  for (const result of ftsResults) {
    const existing = scoreMap.get(result.chunkId);
    const ftsScore = FTS_WEIGHT / (RRF_K + result.rank);
    if (existing) {
      existing.score += ftsScore;
    } else {
      scoreMap.set(result.chunkId, { ...result, score: ftsScore });
    }
  }

  for (const result of vectorResults) {
    const existing = scoreMap.get(result.chunkId);
    const vectorScore = VECTOR_WEIGHT / (RRF_K + result.rank);
    if (existing) {
      existing.score += vectorScore;
    } else {
      scoreMap.set(result.chunkId, { ...result, score: vectorScore });
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score);
}

export function formatContextForLLM(results: RetrievalResult[]): string {
  const blocks = results.map((r, i) => {
    const meta = [
      r.standardNumber ? `Standard: ${r.standardNumber}` : null,
      r.section ? `Section: ${r.section}` : null,
      r.clause ? `Clause: ${r.clause}` : null,
      r.page ? `Page: ${r.page}` : null,
      r.authority ? `Authority: ${r.authority}` : null,
      r.sourceUrl ? `Source: ${r.sourceUrl}` : null,
    ].filter(Boolean).join(' | ');

    return `[Chunk ${i + 1} (ID: ${r.chunkId})] ${meta}\n${sanitizeForLLM(r.content)}`;
  });

  return createPromptInjectionDefense(blocks.join('\n\n---\n\n'));
}

export async function searchStandards(query: string, limit = 10) {
  const conditions = [
    or(
      ilike(schema.standards.standardNumber, `%${query}%`),
      ilike(schema.standards.title, `%${query}%`),
      ilike(schema.standards.scope, `%${query}%`)
    ),
    eq(schema.standards.status, 'active'),
  ];

  return db
    .select()
    .from(schema.standards)
    .where(and(...conditions))
    .limit(limit);
}

export async function getStandardByNumber(standardNumber: string) {
  return db
    .select()
    .from(schema.standards)
    .where(eq(schema.standards.standardNumber, standardNumber))
    .limit(1);
}

export async function getChunksByStandard(standardNumber: string) {
  return db
    .select({
      chunkId: schema.chunks.id,
      content: schema.chunks.content,
      section: schema.chunks.section,
      clause: schema.chunks.clause,
      page: schema.chunks.page,
      standardNumber: schema.documents.standardNumber,
      sourceUrl: schema.documents.sourceUrl,
    })
    .from(schema.chunks)
    .innerJoin(schema.documents, eq(schema.chunks.documentId, schema.documents.id))
    .where(eq(schema.documents.standardNumber, standardNumber))
    .orderBy(schema.chunks.page, schema.chunks.section);
}