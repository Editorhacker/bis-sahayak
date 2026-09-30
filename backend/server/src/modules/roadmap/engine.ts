import { db, schema } from '../../db/index.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { generateId } from '../../utils/helpers.js';
import { formatDate } from '../../utils/typeGuards.js';
import { llmProvider } from '../../ai/llm.js';
import { ROADMAP_REASON_PROMPT } from '../../ai/prompts.js';
import { hybridSearch, RetrievalResult } from '../../ai/retrieval.js';
import { validateAnswer } from '../../ai/validator.js';

export interface BusinessProfile {
  id: string;
  businessType: string | null;
  structure: string | null;
  state: string | null;
  city: string | null;
  premisesType: string | null;
  employeeCount: number | null;
  expectedTurnover: string | null;
  products: Array<{
    category: string | null;
    material: string | null;
    usage: string | null;
  }>;
}

export interface RequirementWithRules {
  requirement: typeof schema.requirements.$inferSelect;
  applicability: typeof schema.applicabilityRules.$inferSelect | null;
  fees: typeof schema.fees.$inferSelect[];
  deps: string[];
}

export interface RoadmapStep {
  requirementId: string;
  stepOrder: number;
  phase: string;
  title: string;
  reason: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_APPLICABLE' | 'NEEDS_VERIFICATION';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE';
  dependsOn: string[];
  payload: {
    documents: string[];
    applyUrl: string | null;
    statusUrl: string | null;
    fee: string | null;
    feeNote: string | null;
    taxNote: string | null;
    sourceUrl: string;
    sourceQuote: string | null;
    lastVerifiedAt: string | null;
    citations: RetrievalResult[];
  };
}

export async function generateRoadmap(businessId: string): Promise<{ roadmapId: string; steps: RoadmapStep[] }> {
  const profile = await getBusinessProfile(businessId);
  if (!profile) {
    throw new Error('Business not found');
  }

  const requirements = await getRequirementsWithRules();
  const applicable = evaluateApplicability(requirements, profile);
  
  const bisSteps = await generateBISSteps(profile);
  
  const allSteps = [...applicable, ...bisSteps];
  const sortedSteps = topologicalSort(allSteps);
  
  const roadmapId = generateId();
  const version = await getNextRoadmapVersion(businessId);
  
  await db.insert(schema.roadmaps).values({
    id: roadmapId,
    businessId,
    version,
    progress: '0',
  });

  for (const step of sortedSteps) {
    await db.insert(schema.roadmapSteps).values({
      roadmapId,
      requirementId: step.requirementId,
      stepOrder: step.stepOrder,
      phase: step.phase,
      title: step.title,
      reason: step.reason,
      status: step.status,
      priority: step.priority,
      confidence: step.confidence,
      dependsOn: step.dependsOn,
      payload: step.payload,
    });
  }

  return { roadmapId, steps: sortedSteps };
}

export async function regenerateRoadmapPreservingCompleted(businessId: string, existingRoadmapId: string): Promise<{ roadmapId: string; steps: RoadmapStep[] }> {
  const existingSteps = await db
    .select()
    .from(schema.roadmapSteps)
    .where(eq(schema.roadmapSteps.roadmapId, existingRoadmapId));

  const completedStepReqIds = existingSteps
    .filter(s => s.status === 'COMPLETED' || s.status === 'NOT_APPLICABLE')
    .map(s => s.requirementId)
    .filter(Boolean);

  const { roadmapId, steps } = await generateRoadmap(businessId);

  for (const step of steps) {
    if (step.requirementId && completedStepReqIds.includes(step.requirementId)) {
      await db
        .update(schema.roadmapSteps)
        .set({ status: 'COMPLETED' })
        .where(and(
          eq(schema.roadmapSteps.roadmapId, roadmapId),
          eq(schema.roadmapSteps.requirementId, step.requirementId)
        ));
    }
  }

  return { roadmapId, steps };
}

async function getBusinessProfile(businessId: string): Promise<BusinessProfile | null> {
  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);

  if (!business) return null;

  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.businessId, businessId));

  return {
    id: business.id,
    businessType: business.businessType,
    structure: business.structure,
    state: business.state,
    city: business.city,
    premisesType: business.premisesType,
    employeeCount: business.employeeCount,
    expectedTurnover: business.expectedTurnover?.toString() || null,
    products: products.map(p => ({
      category: p.category,
      material: p.material,
      usage: p.usage,
    })),
  };
}

async function getRequirementsWithRules(): Promise<RequirementWithRules[]> {
  const requirements = await db.select().from(schema.requirements);
  const applicabilityRules = await db.select().from(schema.applicabilityRules);
  const allFees = await db.select().from(schema.fees);
  const allDeps = await db.select().from(schema.requirementDeps);

  const applicabilityMap = new Map(applicabilityRules.map(r => [r.requirementId, r]));
  const feesMap = new Map<string, typeof schema.fees.$inferSelect[]>();
  for (const fee of allFees) {
    if (!feesMap.has(fee.requirementId)) feesMap.set(fee.requirementId, []);
    feesMap.get(fee.requirementId)!.push(fee);
  }
  const depsMap = new Map<string, string[]>();
  for (const dep of allDeps) {
    if (!depsMap.has(dep.requirementId)) depsMap.set(dep.requirementId, []);
    depsMap.get(dep.requirementId)!.push(dep.dependsOn);
  }

  return requirements.map(req => ({
    requirement: req,
    applicability: applicabilityMap.get(req.id) || null,
    fees: feesMap.get(req.id) || [],
    deps: depsMap.get(req.id) || [],
  }));
}

function evaluateApplicability(
  requirements: RequirementWithRules[],
  profile: BusinessProfile
): RoadmapStep[] {
  const steps: RoadmapStep[] = [];
  let stepOrder = 1;

  for (const req of requirements) {
    const applicable = checkApplicability(req, profile);
    if (!applicable) continue;

    const { status, confidence } = determineStatusAndConfidence(req, profile);

    const fee = req.fees[0];
    const feeStr = fee?.amount ? `₹${fee.amount} ${fee.currency}` : 'Fee not in verified data';

    const reason = generateReason(req, profile);

    steps.push({
      requirementId: req.requirement.id,
      stepOrder: stepOrder++,
      phase: req.requirement.phase,
      title: req.requirement.title,
      reason,
      status,
      priority: req.requirement.priority as any,
      confidence,
      dependsOn: req.deps,
      payload: {
        documents: req.requirement.documentsRequired || [],
        applyUrl: req.requirement.applyUrl,
        statusUrl: req.requirement.statusUrl,
        fee: feeStr,
        feeNote: fee?.note || null,
        taxNote: null,
        sourceUrl: req.requirement.sourceUrl,
        sourceQuote: req.requirement.sourceQuote,
        lastVerifiedAt: formatDate(req.requirement.lastVerifiedAt),
        citations: [],
      },
    });
  }

  return steps;
}

function checkApplicability(req: RequirementWithRules, profile: BusinessProfile): boolean {
  if (!req.applicability) return true;

  const conditions = req.applicability.conditions as any;
  if (!conditions) return true;

  return evaluateConditions(conditions, profile);
}

function evaluateConditions(conditions: any, profile: BusinessProfile): boolean {
  if (conditions.all) {
    return conditions.all.every((c: any) => evaluateCondition(c, profile));
  }
  if (conditions.any) {
    return conditions.any.some((c: any) => evaluateCondition(c, profile));
  }
  if (conditions.field) {
    return evaluateCondition(conditions, profile);
  }
  return true;
}

function evaluateCondition(condition: any, profile: BusinessProfile): boolean {
  const fieldValue = getProfileField(profile, condition.field);
  if (fieldValue === null || fieldValue === undefined) return false;

  switch (condition.op) {
    case 'eq': return fieldValue === condition.value;
    case 'neq': return fieldValue !== condition.value;
    case 'in': return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case 'nin': return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
    case 'gte': return Number(fieldValue) >= Number(condition.value);
    case 'lte': return Number(fieldValue) <= Number(condition.value);
    case 'gt': return Number(fieldValue) > Number(condition.value);
    case 'lt': return Number(fieldValue) < Number(condition.value);
    case 'contains': return String(fieldValue).toLowerCase().includes(String(condition.value).toLowerCase());
    default: return false;
  }
}

function getProfileField(profile: BusinessProfile, field: string): any {
  const fieldMap: Record<string, any> = {
    businessType: profile.businessType,
    structure: profile.structure,
    state: profile.state,
    city: profile.city,
    premisesType: profile.premisesType,
    employeeCount: profile.employeeCount,
    expectedTurnover: profile.expectedTurnover,
  };

  if (field.startsWith('product.')) {
    const productField = field.replace('product.', '');
    return profile.products.some(p => p[productField as keyof typeof p]?.toLowerCase().includes('food'));
  }

  return fieldMap[field];
}

function determineStatusAndConfidence(req: RequirementWithRules, profile: BusinessProfile): { status: RoadmapStep['status']; confidence: RoadmapStep['confidence'] } {
  if (!req.applicability) {
    return { status: 'NOT_STARTED', confidence: 'MEDIUM' };
  }

  switch (req.applicability.applicability) {
    case 'REQUIRED':
      return { status: 'NOT_STARTED', confidence: 'HIGH' };
    case 'CONDITIONAL':
      return { status: 'NEEDS_VERIFICATION', confidence: 'MEDIUM' };
    case 'VERIFY':
      return { status: 'NEEDS_VERIFICATION', confidence: 'LOW' };
    default:
      return { status: 'NOT_STARTED', confidence: 'MEDIUM' };
  }
}

function generateReason(req: RequirementWithRules, profile: BusinessProfile): string {
  const profileFacts = [
    profile.businessType && `business type is ${profile.businessType}`,
    profile.state && `located in ${profile.state}`,
    profile.employeeCount !== null && `has ${profile.employeeCount} employees`,
    profile.premisesType && `operates from ${profile.premisesType}`,
  ].filter(Boolean).join(', ');

  const sourceQuote = req.requirement.sourceQuote || 'the regulation requires this';
  
  return `This applies because your profile indicates ${profileFacts}, and the source states: "${sourceQuote}".`;
}

async function generateBISSteps(profile: BusinessProfile): Promise<RoadmapStep[]> {
  const steps: RoadmapStep[] = [];
  let stepOrder = 100;

  if (!profile.products.length) return steps;

  const product = profile.products[0];
  const searchQuery = `${product.category || ''} ${product.material || ''} ${product.usage || ''}`.trim();
  
  if (!searchQuery) return steps;

  const results = await hybridSearch(searchQuery, { docTypes: ['standard'] }, 5);
  
  if (results.length === 0) {
    steps.push({
      requirementId: 'bis_standard_identification',
      stepOrder: stepOrder++,
      phase: 'BIS',
      title: 'Identify applicable BIS standard',
      reason: `No BIS standard found for ${searchQuery}. Manual verification required.`,
      status: 'NEEDS_VERIFICATION',
      priority: 'HIGH',
      confidence: 'INSUFFICIENT_EVIDENCE',
      dependsOn: [],
      payload: {
        documents: [],
        applyUrl: null,
        statusUrl: null,
        fee: null,
        feeNote: null,
        taxNote: null,
        sourceUrl: 'https://bis.gov.in',
        sourceQuote: null,
        lastVerifiedAt: null,
        citations: results,
      },
    });
    return steps;
  }

  const standardNumber = results[0].standardNumber;
  const scheme = await getSchemeForProduct(product.category || '');

  steps.push({
    requirementId: 'bis_standard_identification',
    stepOrder: stepOrder++,
    phase: 'BIS',
    title: `Identify applicable standard: ${standardNumber}`,
    reason: `Based on product category ${product.category}, the applicable standard is ${standardNumber}.`,
    status: 'NOT_STARTED',
    priority: 'HIGH',
    confidence: 'MEDIUM',
    dependsOn: [],
    payload: {
      documents: [],
      applyUrl: null,
      statusUrl: null,
      fee: null,
      feeNote: null,
      taxNote: null,
      sourceUrl: results[0].sourceUrl || 'https://bis.gov.in',
      sourceQuote: results[0].content.substring(0, 200),
      lastVerifiedAt: null,
      citations: results,
    },
  });

  if (scheme) {
    steps.push({
      requirementId: 'bis_certification_check',
      stepOrder: stepOrder++,
      phase: 'BIS',
      title: `Check ${scheme.scheme} certification requirement`,
      reason: `${scheme.scheme} certification is ${scheme.mandatory ? 'mandatory' : 'voluntary'} for ${product.category} based on ${scheme.basis}.`,
      status: 'NOT_STARTED',
      priority: scheme.mandatory ? 'CRITICAL' : 'HIGH',
      confidence: 'MEDIUM',
      dependsOn: ['bis_standard_identification'],
      payload: {
        documents: [],
        applyUrl: null,
        statusUrl: null,
        fee: null,
        feeNote: null,
        taxNote: null,
        sourceUrl: scheme.sourceUrl,
        sourceQuote: scheme.basis,
        lastVerifiedAt: formatDate(scheme.lastVerifiedAt),
        citations: [],
      },
    });
  }

  const testChunks = results.filter(r => r.content.toLowerCase().includes('test') || r.clause?.toLowerCase().includes('test'));
  if (testChunks.length > 0) {
    steps.push({
      requirementId: 'bis_testing',
      stepOrder: stepOrder++,
      phase: 'BIS',
      title: 'Required tests from standard clauses',
      reason: `The standard ${standardNumber} specifies tests in clauses: ${testChunks.map(c => c.clause).filter(Boolean).join(', ')}.`,
      status: 'NOT_STARTED',
      priority: 'HIGH',
      confidence: 'MEDIUM',
      dependsOn: ['bis_standard_identification'],
      payload: {
        documents: [],
        applyUrl: null,
        statusUrl: null,
        fee: null,
        feeNote: null,
        taxNote: null,
        sourceUrl: testChunks[0].sourceUrl || '',
        sourceQuote: testChunks.map(c => c.content).join(' ').substring(0, 500),
        lastVerifiedAt: null,
        citations: testChunks,
      },
    });
  }

  const state = profile.state || 'Maharashtra';
  const labs = await db
    .select()
    .from(schema.labs)
    .where(eq(schema.labs.state, state))
    .limit(5);

  if (labs.length > 0) {
    steps.push({
      requirementId: 'bis_lab_search',
      stepOrder: stepOrder++,
      phase: 'BIS',
      title: `Find recognized testing labs in ${state}`,
      reason: `${labs.length} BIS-recognized labs found in ${state}.`,
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      confidence: 'HIGH',
      dependsOn: ['bis_testing'],
      payload: {
        documents: [],
        applyUrl: null,
        statusUrl: null,
        fee: null,
        feeNote: null,
        taxNote: null,
        sourceUrl: labs[0].sourceUrl || '',
        sourceQuote: labs.map(l => l.name).join(', '),
        lastVerifiedAt: formatDate(labs[0].lastVerifiedAt),
        citations: [],
      },
    });
  }

  return steps;
}

async function getSchemeForProduct(category: string): Promise<typeof schema.schemeRules.$inferSelect | null> {
  const [scheme] = await db
    .select()
    .from(schema.schemeRules)
    .where(eq(schema.schemeRules.productCategory, category))
    .limit(1);
  return scheme || null;
}

function topologicalSort(steps: RoadmapStep[]): RoadmapStep[] {
  const map = new Map(steps.map(s => [s.requirementId, s]));
  const visited = new Set<string>();
  const temp = new Set<string>();
  const result: RoadmapStep[] = [];

  function visit(reqId: string) {
    if (temp.has(reqId)) {
      throw new Error(`Circular dependency detected: ${reqId}`);
    }
    if (visited.has(reqId)) return;

    temp.add(reqId);
    const step = map.get(reqId);
    if (step) {
      for (const dep of step.dependsOn) {
        visit(dep);
      }
      result.push(step);
    }
    temp.delete(reqId);
    visited.add(reqId);
  }

  for (const step of steps) {
    visit(step.requirementId);
  }

  return result.reverse().map((s, i) => ({ ...s, stepOrder: i + 1 }));
}

async function getNextRoadmapVersion(businessId: string): Promise<number> {
  const [latest] = await db
    .select({ version: schema.roadmaps.version })
    .from(schema.roadmaps)
    .where(eq(schema.roadmaps.businessId, businessId))
    .orderBy(desc(schema.roadmaps.version))
    .limit(1);
  return (latest?.version || 0) + 1;
}