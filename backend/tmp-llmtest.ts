import { llmProvider, createLLMProvider, embeddingProvider } from './server/src/ai/llm.js';
import { analyzeMessage } from './server/src/modules/chat/analyzer.js';
import { getEnv } from './server/src/config/env.js';

async function main() {
  const env = getEnv();
  console.log('PROVIDER:', env.LLM_PROVIDER, '| LLM_MODEL:', env.LLM_MODEL, '| KEY:', env.OPENROUTER_API_KEY?.slice(0, 10));
  console.log('RESOLVED:', createLLMProvider().getName());

  try {
    const out = await llmProvider.generateText('Reply with exactly: OK');
    console.log('GENERATE_OK:', JSON.stringify(out).slice(0, 200));
  } catch (e) {
    console.log('GENERATE_ERR:', e instanceof Error ? e.message.slice(0, 500) : String(e));
  }

  try {
    const a = await analyzeMessage('Which BIS recognized labs are in Maharashtra?');
    console.log('INTENT:', a.intent, '| category:', a.category, '| normalized:', a.normalizedQuery);
    console.log('JSON:', JSON.stringify(a).slice(0, 400));
  } catch (e) {
    console.log('ANALYZE_ERR:', e instanceof Error ? e.message.slice(0, 500) : String(e));
  }
  process.exit(0);
}

main();
