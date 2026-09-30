import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { hybridSearch, formatContextForLLM, RetrievalResult } from '../ai/retrieval.js';
import { validateAnswer } from '../ai/validator.js';
import { llmProvider } from '../ai/llm.js';
import { ANSWER_GENERATOR_PROMPT } from '../ai/prompts.js';
import fs from 'fs';
import path from 'path';

interface BenchmarkQuestion {
  id: string;
  question: string;
  expectedIntent: string;
  expectedStandard?: string;
  expectedChunks?: number[];
  shouldRefuse: boolean;
  category: string;
}

const BENCHMARK_QUESTIONS: BenchmarkQuestion[] = [
  {
    id: 'bm-001',
    question: 'Which BIS standard applies to stainless steel water bottles?',
    expectedIntent: 'STANDARD_DISCOVERY',
    expectedStandard: 'IS 14625',
    category: 'standard_discovery',
    shouldRefuse: false,
  },
  {
    id: 'bm-002',
    question: 'What tests are required for IS 14625?',
    expectedIntent: 'TESTING',
    expectedStandard: 'IS 14625',
    category: 'testing',
    shouldRefuse: false,
  },
  {
    id: 'bm-003',
    question: 'Is BIS certification mandatory for stainless steel vacuum flasks?',
    expectedIntent: 'CERTIFICATION',
    expectedStandard: 'IS 14625',
    category: 'certification',
    shouldRefuse: false,
  },
  {
    id: 'bm-004',
    question: 'Find BIS recognized labs in Maharashtra for mechanical testing',
    expectedIntent: 'LABORATORY',
    category: 'labs',
    shouldRefuse: false,
  },
  {
    id: 'bm-005',
    question: 'What is the GST registration threshold for manufacturers?',
    expectedIntent: 'TAX_REQUIREMENT',
    category: 'business_setup',
    shouldRefuse: false,
  },
  {
    id: 'bm-006',
    question: 'What is the standard for plastic water bottles?',
    expectedIntent: 'STANDARD_DISCOVERY',
    category: 'standard_discovery',
    shouldRefuse: false,
  },
  {
    id: 'bm-007',
    question: 'What is the fee for BIS licence application?',
    expectedIntent: 'FEES',
    category: 'business_setup',
    shouldRefuse: false,
  },
  {
    id: 'bm-008',
    question: 'Which standard applies to copper water bottles?',
    expectedIntent: 'STANDARD_DISCOVERY',
    category: 'standard_discovery',
    shouldRefuse: true,
  },
  {
    id: 'bm-009',
    question: 'What is the standard number for gold hallmarking?',
    expectedIntent: 'HALLMARKING',
    category: 'hallmarking',
    shouldRefuse: false,
  },
  {
    id: 'bm-010',
    question: 'Tell me the exact clause for leak test in IS 14625',
    expectedIntent: 'TESTING',
    expectedStandard: 'IS 14625',
    category: 'testing',
    shouldRefuse: false,
  },
  {
    id: 'bm-011',
    question: 'What are the documents required for Udyam registration?',
    expectedIntent: 'BUSINESS_REGISTRATION',
    category: 'business_setup',
    shouldRefuse: false,
  },
  {
    id: 'bm-012',
    question: 'Is there a BIS standard for wooden water bottles?',
    expectedIntent: 'STANDARD_DISCOVERY',
    category: 'standard_discovery',
    shouldRefuse: true,
  },
  {
    id: 'bm-013',
    question: 'What is the scheme for stainless steel bottles - ISI or CRS?',
    expectedIntent: 'SCHEME',
    expectedStandard: 'IS 14625',
    category: 'certification',
    shouldRefuse: false,
  },
  {
    id: 'bm-014',
    question: 'What are the migration test requirements for food contact stainless steel?',
    expectedIntent: 'TESTING',
    category: 'testing',
    shouldRefuse: false,
  },
  {
    id: 'bm-015',
    question: 'How to apply for Maharashtra professional tax registration?',
    expectedIntent: 'TAX_REQUIREMENT',
    category: 'business_setup',
    shouldRefuse: false,
  },
];

async function runBenchmark() {
  console.log('Starting benchmark...');
  const results: any[] = [];

  for (const bm of BENCHMARK_QUESTIONS) {
    console.log(`\nRunning: ${bm.id} - ${bm.question}`);
    
    try {
      const searchResults = await hybridSearch(bm.question, {}, 8);
      const contextText = formatContextForLLM(searchResults);
      
      const prompt = `${ANSWER_GENERATOR_PROMPT}\n\nCONTEXT:\n${contextText}\n\nQUESTION: ${bm.question}\n\nLANGUAGE: en`;
      
      const answer = await llmProvider.generateText(prompt);
      const validation = validateAnswer(answer, searchResults, []);
      
      let retrievalHit = false;
      if (bm.expectedStandard) {
        retrievalHit = searchResults.some(r => r.standardNumber?.includes(bm.expectedStandard!));
      }
      
      let citationCorrect = true;
      if (bm.expectedChunks) {
        const citedIds = searchResults.filter(r => answer.includes(`[c:${r.chunkId}]`)).map(r => r.chunkId);
        citationCorrect = bm.expectedChunks.every(id => citedIds.includes(id));
      }
      
      const refused = validation.overallConfidence === 'INSUFFICIENT_EVIDENCE';
      const refusalCorrect = bm.shouldRefuse === refused;
      
      results.push({
        id: bm.id,
        question: bm.question,
        category: bm.category,
        answer: answer.substring(0, 200),
        confidence: validation.overallConfidence,
        retrievalHit,
        citationCorrect,
        refused,
        refusalCorrect,
        expectedRefusal: bm.shouldRefuse,
        passed: retrievalHit && citationCorrect && refusalCorrect,
      });
      
      console.log(`  Confidence: ${validation.overallConfidence}`);
      console.log(`  Retrieval Hit: ${retrievalHit}`);
      console.log(`  Citation Correct: ${citationCorrect}`);
      console.log(`  Refused: ${refused} (expected: ${bm.shouldRefuse})`);
      console.log(`  PASSED: ${retrievalHit && citationCorrect && refusalCorrect}`);
    } catch (error) {
      console.error(`  ERROR: ${error}`);
      results.push({
        id: bm.id,
        question: bm.question,
        category: bm.category,
        error: String(error),
        passed: false,
      });
    }
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const retrievalHits = results.filter(r => r.retrievalHit).length;
  const citationCorrect = results.filter(r => r.citationCorrect).length;
  const unsupportedRate = results.filter(r => r.confidence === 'INSUFFICIENT_EVIDENCE' && !r.expectedRefusal).length / total * 100;
  const refusalCorrect = results.filter(r => r.refusalCorrect).length;

  console.log('\n========== BENCHMARK RESULTS ==========');
  console.log(`Total Questions: ${total}`);
  console.log(`Passed: ${passed}/${total} (${(passed/total*100).toFixed(1)}%)`);
  console.log(`Retrieval Hit@3: ${(retrievalHits/total*100).toFixed(1)}%`);
  console.log(`Citation Correctness: ${(citationCorrect/total*100).toFixed(1)}%`);
  console.log(`Unsupported Answer Rate: ${unsupportedRate.toFixed(1)}%`);
  console.log(`Refusal Correctness: ${(refusalCorrect/total*100).toFixed(1)}%`);

  const outputPath = path.join(process.cwd(), 'benchmark-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total,
      passed,
      passRate: passed / total,
      retrievalHitRate: retrievalHits / total,
      citationCorrectness: citationCorrect / total,
      unsupportedRate,
      refusalCorrectness: refusalCorrect / total,
    },
    results,
  }, null, 2));

  console.log(`\nResults saved to ${outputPath}`);
}

runBenchmark().catch(console.error);