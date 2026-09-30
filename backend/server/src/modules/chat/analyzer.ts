/**
 * analyzer.ts  (refactored)
 * --------------------------
 * Thin wrapper – delegates to Python ai_service /analyze endpoint.
 * The AnalyzedProfile type is kept for backwards compatibility with
 * any TypeScript code that still imports from this file.
 */

import { analyzeMessage as aiAnalyze, AnalyzeResponse } from '../../ai/client.js';

// Re-export the type under the old name so other TS modules don't break
export type AnalyzedProfile = AnalyzeResponse;

export { aiAnalyze as analyzeMessage };

// ── Static helpers (no AI needed, stay in TypeScript) ───────────────────────

export function generateClarifyingQuestions(
  missingFields: string[],
): Array<{ field: string; text: string; options?: string[]; type?: string }> {
  const fieldQuestions: Record<string, { text: string; options?: string[]; type?: string }> = {
    businessType:      { text: 'Will you manufacture, trade/resell, or sell online?', options: ['manufacturing', 'trading', 'online_seller', 'service'] },
    businessStructure: { text: 'Business structure?', options: ['proprietorship', 'partnership', 'llp', 'private_limited', 'not_decided'] },
    premisesType:      { text: 'Where will you operate?', options: ['home', 'shop', 'factory_unit', 'warehouse'] },
    employeeCount:     { text: 'About how many workers?', type: 'number' },
    expectedTurnover:  { text: 'Expected annual turnover (INR)?', type: 'number' },
    state:             { text: 'Which state?', type: 'text' },
    city:              { text: 'Which city?', type: 'text' },
  };

  return missingFields.map(field => ({ field, ...fieldQuestions[field] })).filter(q => q.text);
}

export function buildProfileCard(profile: AnalyzedProfile['profile']): Record<string, unknown> {
  return {
    product:           profile.product,
    location:          profile.location,
    businessType:      profile.businessType,
    businessStructure: profile.businessStructure,
    premisesType:      profile.premisesType,
    employeeCount:     profile.employeeCount,
    expectedTurnover:  profile.expectedTurnover,
  };
}