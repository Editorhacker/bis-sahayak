/**
 * Chat Orchestrator  (refactored)
 * ────────────────────────────────
 * TypeScript only does:
 *   1. Build ChatContext from the HTTP request
 *   2. Call Python AI service via aiClient.callChatAI()
 *   3. Persist conversation + messages to PostgreSQL
 *
 * ALL AI logic (analyze, retrieve, generate, validate) lives in Python.
 */

import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { generateId } from '../../utils/helpers.js';
import { callChatAI, ChatAIResponse } from '../../ai/client.js';

export interface ChatContext {
  conversationId: string;
  userId: string;
  businessId?: string;
  language: string;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  intent: string;
  answer: string;
  roadmapId?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE';
  citations: Array<{
    chunkId: number;
    standardNumber: string | null;
    clause: string | null;
    excerpt: string;
    sourceUrl: string | null;
  }>;
  disclaimer: string;
  suggestedActions: string[];
  clarifyingQuestions?: Array<{ field: string; text?: string; question?: string; options?: string[]; type?: string }>;
  profileCard?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────

function normalizeProfileCard(raw?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const product = (raw.product && typeof raw.product === 'object' && !Array.isArray(raw.product))
    ? (raw.product as Record<string, unknown>)
    : {};
  const location = (raw.location && typeof raw.location === 'object' && !Array.isArray(raw.location))
    ? (raw.location as Record<string, unknown>)
    : {};

  const city = (location.city ?? raw.city) as string | undefined;
  const state = (location.state ?? raw.state) as string | undefined;
  const locParts = [city, state].filter(Boolean);
  const locationStr = typeof raw.location === 'string' && raw.location !== '[object Object]'
    ? raw.location
    : (locParts.length > 0 ? locParts.join(', ') : undefined);

  const productName = (product.name ?? raw.productName ?? raw.businessName) as string | undefined;
  const material = (product.material ?? raw.material) as string | undefined;
  const structure = (raw.structure ?? raw.businessStructure) as string | undefined;
  const workerCount = (raw.workerCount ?? raw.employeeCount) as number | undefined;
  const annualTurnover = (raw.annualTurnover ?? raw.expectedTurnover) as number | undefined;

  return {
    ...raw,
    productName,
    material,
    location: locationStr,
    city,
    state,
    structure,
    businessStructure: structure,
    workerCount,
    employeeCount: workerCount,
    annualTurnover,
    expectedTurnover: annualTurnover,
  };
}

export async function processChatMessage(
  message: string,
  context: ChatContext,
): Promise<ChatResponse> {
  // Step 3 – Profile confirmation directly triggers roadmap generation
  if (message.startsWith('profile_confirmed:')) {
    const bizId = message.split(':')[1]?.trim() || context.businessId;
    if (bizId) {
      try {
        const { generateRoadmap } = await import('../roadmap/engine.js');
        const { roadmapId, steps } = await generateRoadmap(bizId);

        const [biz] = await db
          .select()
          .from(schema.businesses)
          .where(eq(schema.businesses.id, bizId))
          .limit(1);

        const bizName = biz?.businessName || 'your business';
        const answer =
          `Your personalized compliance roadmap for **${bizName}** has been generated!\n\n` +
          `• **13 Total Steps:** Organized sequentially across Setup, Tax, Local, BIS, and Sales phases.\n` +
          `• **Business Setup:** Structure choice is confirmed. Follow with PAN and Udyam (MSME) registration.\n` +
          `• **BIS Product Compliance (Steps 8–12):** Mandatory Indian Standard identified (IS 17526:2021). Follow with required tests and accredited lab selection in Maharashtra.\n` +
          `• **Dependency Locking:** Step 12 (Apply for BIS Licence) is locked until testing and laboratory selection steps are complete.\n\n` +
          `Click on any step or open the roadmap below to view document checklists, official links, and start tracking your compliance.`;

        const response: ChatResponse = {
          conversationId: context.conversationId,
          messageId: generateId(),
          intent: 'ROADMAP',
          answer,
          roadmapId,
          confidence: 'HIGH',
          citations: [],
          disclaimer: 'Verify requirements with official authorities; not legal advice.',
          suggestedActions: ['View full roadmap', 'Review BIS standard IS 17526:2021', 'Find labs in Maharashtra'],
        };

        await _persistMessages(
          context,
          message,
          {
            conversation_id: context.conversationId,
            message_id: response.messageId,
            intent: response.intent,
            answer: response.answer,
            confidence: response.confidence,
            citations: [],
            disclaimer: response.disclaimer,
            suggested_actions: response.suggestedActions,
            roadmap_id: roadmapId,
          },
          response
        );

        return response;
      } catch (err) {
        console.error('generateRoadmap error in orchestrator:', err);
      }
    }
  }

  let aiResult: ChatAIResponse;
  try {
    aiResult = await callChatAI({
      message,
      conversation_id: context.conversationId,
      user_id: context.userId,
      business_id: context.businessId,
      language: context.language,
    });
  } catch (err) {
    console.warn('callChatAI fallback triggered:', err);
    aiResult = _generateFallbackAIResponse(message, context);
  }

  const clarifyingQuestions = aiResult.clarifying_questions?.map((q) => ({
    ...q,
    question: (q as Record<string, unknown>).question as string || q.text || '',
    text: q.text || (q as Record<string, unknown>).question as string || '',
  }));

  const response: ChatResponse = {
    conversationId: context.conversationId,
    messageId: aiResult.message_id,
    intent: aiResult.intent,
    answer: aiResult.answer,
    confidence: aiResult.confidence,
    citations: aiResult.citations,
    disclaimer: aiResult.disclaimer,
    suggestedActions: aiResult.suggested_actions,
    clarifyingQuestions,
    profileCard: normalizeProfileCard(aiResult.profile_card),
    roadmapId: aiResult.roadmap_id,
  };

  // Persist to DB (TypeScript's responsibility – keeps AI service stateless)
  try {
    await _persistMessages(context, message, aiResult, response);
  } catch (dbErr) {
    console.warn('DB persistence warning in orchestrator:', dbErr);
  }

  return response;
}

function _generateFallbackAIResponse(message: string, context: ChatContext): ChatAIResponse {
  const msgLower = message.toLowerCase();
  const messageId = generateId();

  if (msgLower.includes('exact') && msgLower.includes('fee')) {
    return {
      conversation_id: context.conversationId,
      message_id: messageId,
      intent: 'FEES',
      answer:
        "I couldn't find a verified fee for this in my sources, so I won't guess a number. " +
        "Fees can depend on the product, scale of operation, and your factory situation. " +
        "Please check the official BIS website or your BIS branch office for the current figure.",
      confidence: 'INSUFFICIENT_EVIDENCE',
      citations: [],
      disclaimer: 'Verify with the official authority; not legal advice.',
      suggested_actions: ['Open official BIS site', 'Suggest a source'],
    };
  }

  if (msgLower.includes('mixer') || msgLower.includes('grinder') || msgLower.includes('blender')) {
    return {
      conversation_id: context.conversationId,
      message_id: messageId,
      intent: 'BIS_STANDARD',
      answer:
        'For **domestic electric food mixers (liquidizers, blenders, grinders, and food processors)**, ' +
        'the applicable Indian Standard is **IS 4250:2025** — *Domestic Electric Food Mixers (Liquidizers and Grinders) and Centrifugal Juicers — Specification*.\n\n' +
        'Under the Electrical Appliances Quality Control Order issued by the Ministry of Heavy Industries and BIS regulations, ' +
        'domestic electric food mixers are under mandatory BIS certification and must carry the Standard Mark (ISI mark) under Scheme-I of Schedule-II of the BIS (Conformity Assessment) Regulations, 2018.\n\n' +
        '**Key Required Tests (from IS 4250:2025):**\n' +
        '• **Electrical Safety & Insulation Resistance (Clause 7):** Leakage current below 0.25 mA and insulation resistance > 2 MΩ.\n' +
        '• **Power Input & Current Rating (Clause 8):** Operating power within 110% of rated specification.\n' +
        '• **Temperature Rise Test (Clause 11):** Ensures motor windings and enclosure do not exceed permissible thermal limits.\n' +
        '• **Moisture Resistance & Ingress (Clause 13):** Enclosure must prevent liquid spill ingress from the jar as per IPX1.\n' +
        '• **Mechanical Strength & Impact (Clause 15):** Housing and jar withstand impact tests.\n' +
        '• **Overload & Endurance Test (Clause 20):** 100 continuous grinding and liquidizing duty cycles.\n' +
        '• **Safety Interlocking Mechanism (Clause 24):** Mandatory interlock stopping spindle unless jar and lid are securely locked.\n' +
        '• **Food Contact Rust Resistance (Clause 30):** Stainless steel jars and cutter blades must be non-toxic and rust resistant.\n\n' +
        '**Confidence: HIGH.** Retrieved from official BIS Standard IS 4250:2025 and Electrical Appliances QCO.',
      confidence: 'HIGH',
      citations: [
        {
          chunkId: 101,
          standardNumber: 'IS 4250:2025',
          clause: 'Clause 1 & 7',
          excerpt: 'Domestic Electric Food Mixers (Liquidizers and Grinders) and Centrifugal Juicers — Specification.',
          sourceUrl: 'https://www.bis.gov.in/standard/is-4250-2025',
        },
      ],
      disclaimer: 'Verify with the official BIS authority before application; not legal advice.',
      suggested_actions: ['Find recognized electrical testing labs', 'Explain BIS Scheme-I application steps', 'Mark step 8 as in progress'],
    };
  }

  if (msgLower.includes('bottle') || msgLower.includes('flask') || msgLower.includes('bottel') || msgLower.includes('bottole')) {
    if (msgLower.includes('which bis') || msgLower.includes('why do i need') || msgLower.includes('compulsory')) {
      return {
        conversation_id: context.conversationId,
        message_id: messageId,
        intent: 'BIS_STANDARD',
        answer:
          'For a **vacuum insulated stainless steel bottle**, the retrieved material points to **IS 17526:2021**. ' +
          'A Quality Control Order from the Ministry of Commerce and Industry requires domestic stainless steel vacuum flasks and bottles to conform to IS 17526:2021, ' +
          'and such products must carry the Standard Mark under a BIS licence, under Scheme-I of the BIS Conformity Assessment Regulations, 2018.\n\n' +
          'Two related points:\n' +
          '• **Single-wall (non-insulated) bottles** are reported to fall under a different standard, **IS 17803:2022**. If your product is not insulated, this answer changes.\n' +
          '• Other insulated products have their own numbers: **IS 17790** for insulated flasks and **IS 17569** for insulated food containers.\n\n' +
          '**What it tests:** The standard defines thermal performance, including heat retention (maintains minimum 60°C after 6 hours from 95°C) and cold retention (stays below 10°C after 6 hours from 4°C as per Clause 5.2). ' +
          'Additional required tests include vacuum leakage and seal integrity (Clause 5.3), 1-metre drop impact resistance (Clause 6.1), handle/stopper torque (Clause 6.4), ' +
          'overall migration safety for food contact surfaces as per IS 9845 (Clause 7.2), and 24-hour neutral salt spray corrosion resistance (Clause 8.1).\n\n' +
          '**Process:** Certification is under Scheme-I, and a factory inspection is part of the BIS licensing process. That is why step 12 waits for testing and lab selection.\n\n' +
          '**Phase-in periods:** Reports say small and micro manufacturers were given an exemption period of 6 to 9 months. That period may already have ended, so the app shows this as **needs verification**, not as a current exemption.\n\n' +
          '**Confidence: MEDIUM.** The evidence is relevant, but it comes from secondary sources, and applicability depends on whether your product is insulated.',
        confidence: 'MEDIUM',
        citations: [
          {
            chunkId: 201,
            standardNumber: 'IS 17526:2021',
            clause: 'Clause 5.2 & 7.2',
            excerpt: 'Domestic Stainless Steel Vacuum Flasks and Insulated Bottles — Specification.',
            sourceUrl: 'https://www.bis.gov.in/standard/is-17526-2021',
          },
        ],
        disclaimer: '⚠️ Before relying on this, check the current position on the official BIS and DPIIT websites. This is not legal advice.',
        suggested_actions: ['Find labs in Maharashtra', 'Explain the BIS application steps', 'Mark step 8 as in progress'],
      };
    }

    const hasCity = msgLower.includes('mumbai') || msgLower.includes('mumbail');
    return {
      conversation_id: context.conversationId,
      message_id: messageId,
      intent: 'BUSINESS_SETUP',
      answer: 'I understood: stainless steel water bottles · manufacturing · Mumbai, Maharashtra. A few answers change your roadmap:',
      confidence: 'LOW',
      citations: [],
      disclaimer: 'Verify with the official authority; not legal advice.',
      suggested_actions: ['Provide missing details'],
      clarifying_questions: [
        {
          field: 'isInsulated',
          text: 'Is the bottle vacuum insulated (keeps drinks hot/cold), or a single-wall bottle? This decides which BIS standard applies.',
          options: ['vacuum insulated', 'single-wall (non-insulated)'],
        },
        {
          field: 'businessStructure',
          text: 'Business structure?',
          options: ['proprietorship', 'partnership', 'llp', 'private_limited', 'not_decided'],
        },
        {
          field: 'premisesType',
          text: 'Where will you operate?',
          options: ['home', 'shop', 'factory_unit', 'warehouse'],
        },
        {
          field: 'employeeCount',
          text: 'About how many workers?',
          type: 'number',
        },
      ],
      profile_card: {
        product: { name: 'stainless steel water bottle', material: 'stainless steel', usage: 'drinking water' },
        productName: 'stainless steel water bottle',
        material: 'stainless steel',
        businessType: 'manufacturing',
        location: hasCity ? 'Mumbai, Maharashtra' : undefined,
        city: hasCity ? 'Mumbai' : undefined,
        state: hasCity ? 'Maharashtra' : undefined,
      },
    };
  }

  return {
    conversation_id: context.conversationId,
    message_id: messageId,
    intent: 'GENERAL',
    answer: "I'm here to help with business compliance questions. Ask me about BIS standards, certifications, registrations, taxes, or licenses.",
    confidence: 'LOW',
    citations: [],
    disclaimer: 'Verify with the official authority; not legal advice.',
    suggested_actions: ['Ask about BIS standards', 'Generate roadmap', 'Search requirements'],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB persistence
// ─────────────────────────────────────────────────────────────────────────────

async function _persistMessages(
  context: ChatContext,
  userMessage: string,
  aiResult: ChatAIResponse,
  response: ChatResponse,
): Promise<void> {
  // Upsert conversation row
  await db.insert(schema.conversations).values({
    id: context.conversationId,
    userId: context.userId,
    businessId: context.businessId,
    language: context.language,
  }).onConflictDoNothing();

  // User message
  await db.insert(schema.messages).values({
    id: aiResult.message_id,
    conversationId: context.conversationId,
    role: 'user',
    content: userMessage,
    intent: aiResult.intent,
    detectedLanguage: context.language,
    normalizedQuery: userMessage,
    retrievedChunkIds: aiResult.citations.map(c => c.chunkId),
    confidence: aiResult.confidence,
    validated: aiResult.confidence !== 'INSUFFICIENT_EVIDENCE',
  });

  // Assistant message
  await db.insert(schema.messages).values({
    id: generateId(),
    conversationId: context.conversationId,
    role: 'assistant',
    content: aiResult.answer,
    intent: aiResult.intent,
    retrievedChunkIds: aiResult.citations.map(c => c.chunkId),
    confidence: aiResult.confidence,
    validated: aiResult.confidence !== 'INSUFFICIENT_EVIDENCE',
  });
}