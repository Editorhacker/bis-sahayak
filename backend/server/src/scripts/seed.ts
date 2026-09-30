import { sql } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../utils/helpers.js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

type CsvRecord = Record<string, string>;

const SEED_DIR = path.join(process.cwd(), 'data', 'seed');
const FALLBACK_DATE = new Date().toISOString().slice(0, 10);

function readCsv(fileName: string): CsvRecord[] {
  const filePath = path.join(SEED_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`Skipping ${fileName}: file not found at ${filePath}`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true }) as CsvRecord[];
}

function matchEnum<T extends string>(allowed: readonly T[], raw: string | undefined): T | undefined {
  const value = (raw ?? '').trim().toLowerCase();
  return allowed.find((candidate) => candidate.toLowerCase() === value);
}

function toEnum<T extends string>(allowed: readonly T[], raw: string | undefined, fallback: T): T {
  const match = matchEnum(allowed, raw);
  if (!match && (raw ?? '').trim()) {
    console.warn(`Unknown value "${raw}", falling back to "${fallback}"`);
  }
  return match ?? fallback;
}

function toDate(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : FALLBACK_DATE;
}

function parseJson(raw: string | undefined): unknown {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function toList(raw: string | undefined): string[] {
  const value = (raw ?? '').trim();
  if (!value) return [];
  if (value.startsWith('[')) {
    const parsed = parseJson(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item));
  }
  return value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toAmount(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (Number.isNaN(Number(value))) {
    console.warn(`Invalid amount "${value}", storing NULL`);
    return null;
  }
  return value;
}

function toBoolean(raw: string | undefined): boolean {
  return ['true', '1', 'yes'].includes((raw ?? '').trim().toLowerCase());
}

async function tableIsEmpty(table: AnyPgTable): Promise<boolean> {
  const rows = await db.select({ one: sql`1` }).from(table).limit(1);
  return rows.length === 0;
}

async function seedCsv(
  fileName: string,
  table: AnyPgTable,
  label: string,
  insertRow: (record: CsvRecord) => Promise<boolean>
): Promise<void> {
  const rows = readCsv(fileName);
  if (!rows.length) return;

  if (!(await tableIsEmpty(table))) {
    console.log(`${label} already present, skipping`);
    return;
  }

  let seeded = 0;
  for (const record of rows) {
    try {
      if (await insertRow(record)) seeded += 1;
    } catch (error) {
      console.error(`Failed to seed ${label.toLowerCase()} row:`, record, error);
    }
  }
  console.log(`Seeded ${seeded}/${rows.length} ${label.toLowerCase()}`);
}

async function seed() {
  console.log('Starting seed...');

  const adminPassword = await hashPassword('admin123');
  const [admin] = await db
    .insert(schema.users)
    .values({
      name: 'Admin User',
      email: 'admin@business-saarthi.in',
      passwordHash: adminPassword,
      role: 'ADMIN',
      preferredLanguage: 'en',
    })
    .onConflictDoNothing()
    .returning();

  if (admin) {
    console.log('Created admin user:', admin.email);
  }

  await seedCsv('requirements.csv', schema.requirements, 'Requirements', async (record) => {
    const sourceUrl = record.source_url.trim();
    if (!record.id || !record.title || !sourceUrl) {
      console.warn(`Skipping requirement "${record.id}": missing id, title or source_url`);
      return false;
    }
    await db
      .insert(schema.requirements)
      .values({
        id: record.id,
        title: record.title,
        category: record.category,
        phase: record.phase,
        authority: record.authority,
        description: record.description || null,
        procedureSteps: parseJson(record.procedure_steps) ?? null,
        documentsRequired: toList(record.documents_required),
        applyUrl: record.apply_url || null,
        statusUrl: record.status_url || null,
        sourceUrl,
        sourceQuote: record.source_quote || null,
        lastVerifiedAt: toDate(record.last_verified_at),
        priority: toEnum(schema.priorityEnum.enumValues, record.priority, 'MEDIUM'),
      })
      .onConflictDoNothing();
    return true;
  });

  await seedCsv('applicability_rules.csv', schema.applicabilityRules, 'Applicability rules', async (record) => {
    const conditions = parseJson(record.conditions);
    if (!record.requirement_id || conditions === undefined) {
      console.warn(`Skipping applicability rule for "${record.requirement_id}": missing requirement_id or conditions`);
      return false;
    }
    await db
      .insert(schema.applicabilityRules)
      .values({
        requirementId: record.requirement_id,
        conditions,
        applicability: toEnum(schema.applicabilityEnum.enumValues, record.applicability, 'REQUIRED'),
      })
      .onConflictDoNothing();
    return true;
  });

  await seedCsv('fees.csv', schema.fees, 'Fees', async (record) => {
    const sourceUrl = record.source_url.trim();
    if (!record.requirement_id || !sourceUrl) {
      console.warn(`Skipping fee for "${record.requirement_id}": missing requirement_id or source_url`);
      return false;
    }
    await db.insert(schema.fees).values({
      requirementId: record.requirement_id,
      amount: toAmount(record.amount),
      currency: record.currency || 'INR',
      condition: parseJson(record.condition) ?? null,
      note: record.note || null,
      sourceUrl,
      lastVerifiedAt: toDate(record.last_verified_at),
    });
    return true;
  });

  await seedCsv('requirement_deps.csv', schema.requirementDeps, 'Requirement dependencies', async (record) => {
    if (!record.requirement_id || !record.depends_on) {
      console.warn(`Skipping dependency "${record.requirement_id}" -> "${record.depends_on}": missing columns`);
      return false;
    }
    await db
      .insert(schema.requirementDeps)
      .values({
        requirementId: record.requirement_id,
        dependsOn: record.depends_on,
      })
      .onConflictDoNothing();
    return true;
  });

  await seedCsv('scheme_rules.csv', schema.schemeRules, 'Scheme rules', async (record) => {
    const scheme = matchEnum(schema.schemeEnum.enumValues, record.scheme);
    const sourceUrl = record.source_url.trim();
    if (!record.product_category || !scheme || !sourceUrl) {
      console.warn(`Skipping scheme rule for "${record.product_category}": invalid scheme "${record.scheme}" or missing source_url`);
      return false;
    }
    await db.insert(schema.schemeRules).values({
      productCategory: record.product_category,
      scheme,
      mandatory: toBoolean(record.mandatory),
      basis: record.basis || null,
      sourceUrl,
      lastVerifiedAt: toDate(record.last_verified_at),
    });
    return true;
  });

  await seedCsv('labs.csv', schema.labs, 'Labs', async (record) => {
    const sourceUrl = record.source_url.trim();
    if (!record.name || !sourceUrl) {
      console.warn(`Skipping lab "${record.name}": missing name or source_url`);
      return false;
    }
    await db.insert(schema.labs).values({
      name: record.name,
      state: record.state || null,
      city: record.city || null,
      capabilities: toList(record.capabilities),
      contact: parseJson(record.contact) ?? null,
      sourceUrl,
      lastVerifiedAt: toDate(record.last_verified_at),
    });
    return true;
  });

  await seedCsv('tax_rules.csv', schema.taxRules, 'Tax rules', async (record) => {
    const appliesWhen = parseJson(record.applies_when);
    const sourceUrl = record.source_url.trim();
    if (!record.level || !record.tax_name || !record.rate_or_note || appliesWhen === undefined || !sourceUrl) {
      console.warn(`Skipping tax rule "${record.tax_name}": missing required columns or invalid applies_when`);
      return false;
    }
    await db.insert(schema.taxRules).values({
      level: record.level,
      state: record.state || null,
      taxName: record.tax_name,
      appliesWhen,
      rateOrNote: record.rate_or_note,
      threshold: parseJson(record.threshold) ?? null,
      sourceUrl,
      lastVerifiedAt: toDate(record.last_verified_at),
    });
    return true;
  });

  console.log('Seed completed!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
