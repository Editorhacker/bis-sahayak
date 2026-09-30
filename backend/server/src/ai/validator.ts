import { RetrievalResult } from './retrieval.js';

export interface ValidatedClaim {
  claim: string;
  citationIds: number[];
  isValid: boolean;
  reason?: string;
}

export interface ValidationResult {
  claims: ValidatedClaim[];
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE';
  disclaimer: string;
}

const FEE_THRESHOLD_PATTERN = /(?:fee|cost|charge|amount|threshold|limit)\s*(?:of|is|=|:)?\s*[\d,]+(?:\.\d+)?/gi;
const STANDARD_NUMBER_PATTERN = /\bIS\s*\d{4,5}(?::\d{4})?(?:\s*\(Part\s*\d+\))?/gi;
const CLAUSE_PATTERN = /\bclause\s+\d+(?:\.\d+)*/gi;

function extractCitationIds(text: string): number[] {
  const matches = text.match(/\[c:(\d+)\]/g);
  if (!matches) return [];
  return matches.map(m => parseInt(m.match(/\[c:(\d+)\]/)![1], 10));
}

function extractRequirementIds(text: string): string[] {
  const matches = text.match(/\[r:([a-z_]+)\]/g);
  if (!matches) return [];
  return matches.map(m => m.match(/\[r:([a-z_]+)\]/)![1]);
}

export function validateAnswer(
  answer: string,
  retrievedChunks: RetrievalResult[],
  requirementIds: string[] = []
): ValidationResult {
  const chunkMap = new Map(retrievedChunks.map(c => [c.chunkId, c]));
  const citationIds = extractCitationIds(answer);
  const reqIds = extractRequirementIds(answer);
  const claims: ValidatedClaim[] = [];

  const sentences = splitIntoClaims(answer);

  for (const sentence of sentences) {
    const claimCitations = extractCitationIds(sentence);
    const claimReqIds = extractRequirementIds(sentence);
    
    if (claimCitations.length === 0 && claimReqIds.length === 0) {
      continue;
    }

    let isValid = true;
    const reasons: string[] = [];

    for (const cid of claimCitations) {
      const chunk = chunkMap.get(cid);
      if (!chunk) {
        isValid = false;
        reasons.push(`Citation ${cid} not in retrieved chunks`);
        continue;
      }

      const standardMatches = sentence.match(STANDARD_NUMBER_PATTERN);
      if (standardMatches) {
        for (const std of standardMatches) {
          const chunkText = `${chunk.standardNumber || ''} ${chunk.content}`.toLowerCase();
          if (!chunkText.includes(std.toLowerCase().replace(/\s+/g, ''))) {
            isValid = false;
            reasons.push(`Standard ${std} not found in cited chunk ${cid}`);
          }
        }
      }

      const clauseMatches = sentence.match(CLAUSE_PATTERN);
      if (clauseMatches) {
        for (const cl of clauseMatches) {
          const clauseNum = cl.replace('clause ', '').trim();
          const chunkClause = chunk.clause?.toLowerCase() || '';
          if (!chunkClause.includes(clauseNum.toLowerCase())) {
            isValid = false;
            reasons.push(`Clause ${clauseNum} not found in cited chunk ${cid}`);
          }
        }
      }

      const feeMatches = sentence.match(FEE_THRESHOLD_PATTERN);
      if (feeMatches) {
        isValid = false;
        reasons.push('Fee/threshold claims must come from requirements/fees tables, not retrieved text');
      }
    }

    for (const rid of claimReqIds) {
      if (!requirementIds.includes(rid)) {
        isValid = false;
        reasons.push(`Requirement ${rid} not in applicable requirements`);
      }
    }

    claims.push({
      claim: sentence,
      citationIds: claimCitations,
      isValid,
      reason: reasons.join('; ') || undefined,
    });
  }

  const validClaims = claims.filter(c => c.isValid);
  const totalClaims = claims.length;
  
  let overallConfidence: ValidationResult['overallConfidence'] = 'INSUFFICIENT_EVIDENCE';
  
  if (totalClaims === 0) {
    overallConfidence = 'INSUFFICIENT_EVIDENCE';
  } else if (validClaims.length >= 2 && validClaims.length / totalClaims >= 0.8) {
    const hasOfficialSource = validClaims.some(c => 
      c.citationIds.some(id => {
        const chunk = chunkMap.get(id);
        return chunk?.authority?.toLowerCase().includes('bis') || 
               chunk?.authority?.toLowerCase().includes('government') ||
               chunk?.sourceUrl?.includes('gov.in');
      })
    );
    if (hasOfficialSource) {
      overallConfidence = 'HIGH';
    } else {
      overallConfidence = 'MEDIUM';
    }
  } else if (validClaims.length >= 1) {
    overallConfidence = 'MEDIUM';
  } else {
    overallConfidence = 'LOW';
  }

  return {
    claims,
    overallConfidence,
    disclaimer: 'Verify with the official authority; not legal advice.',
  };
}

function splitIntoClaims(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

export function computeRoadmapConfidence(
  step: { requirementId: string; citations: RetrievalResult[]; hasOfficialSource: boolean }
): 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE' {
  if (step.citations.length === 0) {
    return 'INSUFFICIENT_EVIDENCE';
  }

  const hasMultipleValid = step.citations.length >= 2;
  const hasOfficial = step.hasOfficialSource;
  const recentVerification = step.citations.some(c => {
    // This would check lastVerifiedAt in real implementation
    return true; // placeholder
  });

  if (hasMultipleValid && hasOfficial && recentVerification) {
    return 'HIGH';
  }
  if (hasMultipleValid || hasOfficial) {
    return 'MEDIUM';
  }
  return 'LOW';
}