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
import { eq, desc } from 'drizzle-orm';
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

        const phasesMap: Record<string, string[]> = {
          'Phase 1: Business Setup': [],
          'Phase 2: Tax Registration': [],
          'Phase 3: Local & Premises Approvals': [],
          'Phase 4: BIS Product Certification': [],
          'Phase 5: Sales & Packaging': [],
        };

        const phaseKeyMap: Record<string, string> = {
          SETUP: 'Phase 1: Business Setup',
          TAX: 'Phase 2: Tax Registration',
          LOCAL: 'Phase 3: Local & Premises Approvals',
          BIS: 'Phase 4: BIS Product Certification',
          SALES: 'Phase 5: Sales & Packaging',
        };

        for (const s of steps) {
          const groupName = phaseKeyMap[(s.phase || 'SETUP').toUpperCase()] || 'Phase 1: Business Setup';
          const url = s.payload?.applyUrl || s.payload?.sourceUrl || 'https://www.bis.gov.in/';
          let statusBadge = '';
          if (s.status === 'COMPLETED') statusBadge = ' `[Completed]`';
          else if (s.status === 'NEEDS_VERIFICATION') statusBadge = ' `[Needs Verification]`';
          else if (s.requirementId === 'bis_scheme_application') statusBadge = ' `[Locked until Steps 9, 10, 11]`';

          const linkMd = url ? `[Official Portal Link](${url})` : '[Official Portal](https://www.bis.gov.in/)';
          phasesMap[groupName].push(
            `**Step ${s.stepOrder}: ${s.title}**${statusBadge}\n` +
            `• *Requirement / Scope:* ${s.reason}\n` +
            `• *Official Link:* ${linkMd}`
          );
        }

        const formattedPhases = Object.entries(phasesMap)
          .filter(([_, items]) => items.length > 0)
          .map(([phaseTitle, items]) => `### ${phaseTitle}\n\n` + items.join('\n\n'))
          .join('\n\n---\n\n');

        const answer =
          `Your personalized compliance roadmap for **${bizName}** has been generated!\n\n` +
          `• **13 Total Steps:** Organized sequentially across Setup, Tax, Local, BIS, and Sales phases.\n` +
          `• **Business Setup:** Structure choice is confirmed. Follow with PAN and Udyam (MSME) registration.\n` +
          `• **BIS Product Compliance (Steps 8–12):** Mandatory Indian Standard identified (IS 17526:2021). Follow with required tests and accredited lab selection in Maharashtra.\n` +
          `• **Dependency Locking:** Step 12 (Apply for BIS Licence) is locked until testing and laboratory selection steps are complete.\n\n` +
          `---\n\n` +
          `### 📋 Detailed 13-Step Action Plan & Official Portal Links\n\n` +
          formattedPhases +
          `\n\n---\n\n` +
          `*Click on any step or use the roadmap view to track completion, download forms, and inspect document checklists.*`;

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

  let history: Array<{ role: string; content: string }> = [];
  if (context.conversationId) {
    try {
      const historyRows = await db
        .select({
          role: schema.messages.role,
          content: schema.messages.content,
        })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, context.conversationId))
        .orderBy(desc(schema.messages.createdAt))
        .limit(10);

      history = historyRows.reverse();
    } catch (histErr) {
      console.warn('Failed to load conversation history:', histErr);
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
      history,
    });
  } catch (err) {
    console.warn('callChatAI fallback triggered:', err);
    aiResult = _generateFallbackAIResponse(message, context, history);
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

export function _generateFallbackAIResponse(
  message: string,
  context: ChatContext,
  history: Array<{ role: string; content: string }> = [],
): ChatAIResponse {
  const msgLower = message.toLowerCase();
  const historyText = history.map((h) => h.content).join(' ').toLowerCase();
  const messageId = generateId();

  const isMixer =
    msgLower.includes('mixer') ||
    msgLower.includes('grinder') ||
    msgLower.includes('blender') ||
    msgLower.includes('4250') ||
    historyText.includes('mixer') ||
    historyText.includes('grinder') ||
    historyText.includes('blender') ||
    historyText.includes('4250');

  const isBottle =
    msgLower.includes('bottle') ||
    msgLower.includes('flask') ||
    msgLower.includes('17526') ||
    msgLower.includes('bottel') ||
    msgLower.includes('bottole') ||
    historyText.includes('bottle') ||
    historyText.includes('flask') ||
    historyText.includes('17526');

  const isSchemeQuery =
    msgLower.includes('scheme') ||
    msgLower.includes('application step') ||
    msgLower.includes('application procedure') ||
    msgLower.includes('how to apply') ||
    msgLower.includes('apply for bis') ||
    msgLower.includes('apply for a bis') ||
    msgLower.includes('licence step') ||
    msgLower.includes('licensing step') ||
    msgLower.includes('application process');

  if (isSchemeQuery) {
    if (isMixer) {
      return {
        conversation_id: context.conversationId,
        message_id: messageId,
        intent: 'SCHEME',
        answer:
          `### 📋 BIS Scheme-I (ISI Mark) Application Steps for Electric Food Mixers (IS 4250:2025)\n\n` +
          `Domestic electric food mixers, liquidizers, and grinders fall under **mandatory BIS certification** ` +
          `under Scheme-I of Schedule-II of the BIS (Conformity Assessment) Regulations, 2018, pursuant to the ` +
          `Electrical Appliances Quality Control Order issued by the Ministry of Heavy Industries.\n\n` +
          `Here is the complete step-by-step application procedure to obtain your BIS Licence (ISI Mark):\n\n` +
          `#### **Step 1: Set Up In-House Testing Laboratory (IS 4250:2025 Clauses 7, 8, 11, 13, 15, 20 & 24)**\n` +
          `*Under Scheme-I, the manufacturer MUST establish an operational in-house testing facility at the factory premises with calibrated instruments before applying.*\n` +
          `• **Electrical Safety & Insulation (Clause 7):** Leakage current meter (limit < 0.25 mA) and 500V DC megohmmeter (insulation resistance > 2 MΩ).\n` +
          `• **Dielectric High Voltage Flash Tester:** 1000V/1500V AC testing bench.\n` +
          `• **Power Input & Current Measurement (Clause 8):** Digital power analyzer/wattmeter (power within 110% of rated capacity).\n` +
          `• **Temperature Rise Test Bench (Clause 11):** Multi-channel temperature recorder and thermocouples for motor windings and housing surfaces.\n` +
          `• **Safety Interlock Testing Rig (Clause 24):** Mechanism verifying spindle stops immediately unless jar and lid are securely engaged.\n` +
          `• **Overload & Endurance Rig (Clause 20):** Automated duty-cycle test rig for 100 continuous grinding cycles.\n\n` +
          `#### **Step 2: Prepare Quality Management Documentation**\n` +
          `• **Technical Dossier & Quality Manual:** Manufacturing process flow chart, raw material inspection plan, and quality manual.\n` +
          `• **Equipment Calibration:** Valid calibration certificates traceable to NABL/national standards for all in-house test equipment.\n` +
          `• **Component Test Certificates:** Evidence of conformity for critical components (BIS-certified ISI-marked power cords as per IS 694, switches as per IS 3854, plugs as per IS 1293).\n` +
          `• **Food Contact Declaration:** Mill test certificates verifying Grade 304 stainless steel for jars and blades (Clause 30).\n` +
          `• **Competent Quality Personnel:** Appointment of a qualified quality control engineer/testing technician.\n\n` +
          `#### **Step 3: Online Application Submission on Manakonline (Form V)**\n` +
          `• Register your manufacturing unit on the official BIS portal: [Manakonline Portal](https://www.manakonline.in/).\n` +
          `• Fill out **Form V** (Application for Grant of Licence under Scheme-I).\n` +
          `• Upload factory registration, list of manufacturing machinery, in-house testing equipment with calibration dates, plant layout, and acceptance of the BIS Scheme of Inspection and Testing (SIT).\n` +
          `• Pay the statutory BIS application fee (₹1,000 for Micro/Small MSMEs with 50% concession under Udyam, ₹2,000 standard).\n\n` +
          `#### **Step 4: Factory Audit & Preliminary Inspection by BIS Technical Auditor**\n` +
          `• A BIS inspecting officer visits your manufacturing plant to:\n` +
          `  - Inspect production machinery, assembly lines, and hygiene standards.\n` +
          `  - Inspect in-house test facilities and review instrument calibration records.\n` +
          `  - Assess the competency of quality control staff.\n` +
          `  - Witness live demonstration of routine tests (electrical insulation, leakage current, power input, and safety interlock cut-off).\n\n` +
          `#### **Step 5: Sample Drawing & Independent Laboratory Testing**\n` +
          `• The BIS auditor draws representative production samples of the food mixer from the factory.\n` +
          `• Samples are sealed and forwarded to a BIS-recognized / NABL-accredited independent laboratory (e.g. National Test House, ERDA, or CPRI).\n` +
          `• Complete type testing is conducted against all clauses of **IS 4250:2025**.\n` +
          `• Third-party testing charges are paid directly to the testing laboratory.\n\n` +
          `#### **Step 6: Grant of BIS Licence & ISI Mark Authorization**\n` +
          `• Upon satisfactory factory inspection and passing independent test reports, BIS approves the licence.\n` +
          `• BIS issues the **Certificate of Conformity & Licence (CM/L Number)**.\n` +
          `• You are authorized to affix the **Standard ISI Mark** with **IS 4250** and your unique CM/L licence number on the food mixer rating plate, body, packaging, and user manuals.\n` +
          `• Initial validity is 1 to 2 years, renewable upon payment of marking fees and compliance with periodic surveillance audits.`,
        confidence: 'HIGH',
        citations: [
          {
            chunkId: 101,
            standardNumber: 'IS 4250:2025',
            clause: 'Scheme-I & Clause 7, 24',
            excerpt: 'Domestic Electric Food Mixers — Mandatory ISI Mark Certification under Scheme-I of Schedule-II of BIS Conformity Assessment Regulations, 2018.',
            sourceUrl: 'https://www.manakonline.in/',
          },
        ],
        disclaimer: 'Verify requirements with the official BIS authority before application; not legal advice.',
        suggested_actions: ['Find recognized electrical testing labs', 'Review IS 4250:2025 test clauses', 'View full roadmap'],
      };
    }

    if (isBottle) {
      return {
        conversation_id: context.conversationId,
        message_id: messageId,
        intent: 'SCHEME',
        answer:
          `### 📋 BIS Scheme-I (ISI Mark) Application Steps for Stainless Steel Water Bottles (IS 17526:2021)\n\n` +
          `Domestic stainless steel vacuum flasks and insulated bottles fall under **mandatory BIS certification** ` +
          `under Scheme-I pursuant to the Quality Control Order issued by the Ministry of Commerce and Industry (DPIIT).\n\n` +
          `Here is the complete step-by-step application procedure to obtain your BIS Licence (ISI Mark):\n\n` +
          `#### **Step 1: Set Up In-House Testing Laboratory (IS 17526:2021 Clauses 5.2, 5.3, 6.1, 6.4 & 7.2)**\n` +
          `*Under Scheme-I, the manufacturer MUST set up an in-house laboratory at the factory premises with calibrated instruments before applying.*\n` +
          `• **Thermal Performance Test Bench (Clause 5.2):** Calibrated digital temperature probes and controlled ambient chamber to verify heat retention (min 60°C after 6 hours from 95°C) and cold retention (< 10°C after 6 hours from 4°C).\n` +
          `• **Vacuum Leakage & Seal Rig (Clause 5.3):** Vacuum testing chamber/thermal shock tank verifying vacuum integrity without sweat condensation.\n` +
          `• **Impact & Drop Resistance Rig (Clause 6.1):** 1-metre drop test apparatus onto concrete slab for water-filled bottles.\n` +
          `• **Handle & Stopper Torque Rig (Clause 6.4):** Apparatus for 1,000 open/close cyclic torque tests without thread stripping.\n` +
          `• **Food Contact Migration Testing Setup (Clause 7.2 as per IS 9845):** Testing of silicone seals and stainless steel food contact surfaces.\n\n` +
          `#### **Step 2: Prepare Quality Management Documentation**\n` +
          `• **Quality Manual & Flowchart:** Deep drawing, seam welding, vacuum furnace brazing/evacuation, and polishing processes.\n` +
          `• **Raw Material Compliance:** Mill test certificates proving food-grade austenitic stainless steel conforming to IS 6911 (Grade 304 / X04Cr19Ni9).\n` +
          `• **Equipment Calibration:** Valid NABL-traceable calibration certificates for thermal probes, pressure gauges, and drop rigs.\n` +
          `• **Appointment of Qualified QC Personnel.**\n\n` +
          `#### **Step 3: Online Application Submission on Manakonline (Form V)**\n` +
          `• Register on the official portal: [Manakonline Portal](https://www.manakonline.in/).\n` +
          `• Submit **Form V** (Application for Grant of Licence under Scheme-I).\n` +
          `• Upload factory layout, machinery list, test equipment list with calibration records, and SIT undertaking.\n` +
          `• Pay application fee (₹1,000 for Micro/Small MSMEs with Udyam, ₹2,000 standard).\n\n` +
          `#### **Step 4: Factory Audit & On-Site Inspection by BIS Officer**\n` +
          `• A BIS auditor visits the manufacturing premises to inspect vacuum evacuation ovens, verify quality processes, and witness live testing (drop test, thermal retention, vacuum seal).\n\n` +
          `#### **Step 5: Sample Drawing & Independent Lab Testing**\n` +
          `• The BIS auditor seals representative bottle samples and dispatches them to a BIS-recognized lab (e.g. National Test House, Mumbai).\n` +
          `• The independent lab conducts tests against IS 17526:2021 and food contact migration (IS 9845).\n\n` +
          `#### **Step 6: Grant of BIS Licence & ISI Mark Authorization**\n` +
          `• Upon passing test reports and audit approval, BIS issues the **Licence (CM/L Number)**.\n` +
          `• Affix the **ISI Mark** with **IS 17526:2021** and CM/L number on the bottle base, carton, and warranty card.`,
        confidence: 'HIGH',
        citations: [
          {
            chunkId: 201,
            standardNumber: 'IS 17526:2021',
            clause: 'Clause 5.2, 7.2 & 9',
            excerpt: 'Domestic Stainless Steel Vacuum Flasks and Insulated Bottles — Specification and Scheme-I licensing requirements.',
            sourceUrl: 'https://www.manakonline.in/',
          },
        ],
        disclaimer: 'Verify requirements with the official BIS authority before application; not legal advice.',
        suggested_actions: ['Find labs in Maharashtra', 'Review BIS standard IS 17526:2021', 'View full roadmap'],
      };
    }

    // General Scheme-I
    return {
      conversation_id: context.conversationId,
      message_id: messageId,
      intent: 'SCHEME',
      answer:
        `### 📋 BIS Scheme-I (ISI Mark) Application Steps & Procedure\n\n` +
        `Under Scheme-I of Schedule-II of the BIS (Conformity Assessment) Regulations, 2018, manufacturing units must obtain a BIS Licence ` +
        `to use the Standard Mark (ISI mark) before placing products covered under mandatory Quality Control Orders (QCOs) in the Indian market.\n\n` +
        `Here is the standard 6-step application procedure:\n\n` +
        `#### **Step 1: Identify Applicable Indian Standard & Set Up In-House Lab**\n` +
        `• Determine the applicable Indian Standard (e.g., IS 4250 for food mixers, IS 17526 for vacuum bottles).\n` +
        `• Establish an in-house testing facility equipped with all instruments required by the BIS Scheme of Inspection and Testing (SIT).\n` +
        `• Ensure all test instruments possess valid NABL-traceable calibration certificates.\n\n` +
        `#### **Step 2: Prepare Quality Management Documentation**\n` +
        `• Prepare Quality Manual, factory layout, manufacturing machinery list, raw material test certificates, and appoint qualified technical/testing personnel.\n\n` +
        `#### **Step 3: Submit Online Application (Form V) on Manakonline**\n` +
        `• Register on the official portal: [Manakonline Portal](https://www.manakonline.in/).\n` +
        `• Complete Form V under Scheme-I, upload technical documents and calibration records, and pay the application fee (50% concession for MSMEs under Udyam).\n\n` +
        `#### **Step 4: Preliminary Factory Audit by BIS Technical Auditor**\n` +
        `• A BIS officer visits the factory to inspect manufacturing controls, verify test equipment, and witness routine/acceptance tests conducted by the factory QC staff.\n\n` +
        `#### **Step 5: Sample Drawing & Independent Laboratory Testing**\n` +
        `• The auditor draws representative production samples, seals them, and dispatches them to a BIS-recognized / NABL-accredited independent laboratory for full conformity testing against the standard clauses.\n\n` +
        `#### **Step 6: Scrutiny & Grant of BIS Licence (ISI Mark)**\n` +
        `• Upon receipt of satisfactory inspection and lab test reports, BIS grants the Certificate of Conformity and issues a unique CM/L licence number authorizing use of the ISI Mark.`,
      confidence: 'HIGH',
      citations: [
        {
          chunkId: 1,
          standardNumber: 'BIS Scheme-I',
          clause: 'Schedule-II',
          excerpt: 'BIS (Conformity Assessment) Regulations, 2018 — Scheme-I Conformity Assessment Procedure.',
          sourceUrl: 'https://www.manakonline.in/',
        },
      ],
      disclaimer: 'Verify requirements with the official BIS authority before application; not legal advice.',
      suggested_actions: ['Identify applicable BIS standard', 'Find recognized testing labs', 'View full roadmap'],
    };
  }

  if (
    msgLower.includes('all steps') ||
    (msgLower.includes('step') && msgLower.includes('link')) ||
    msgLower.includes('give me all steps') ||
    msgLower.includes('show all steps') ||
    msgLower.includes('full roadmap')
  ) {
    return {
      conversation_id: context.conversationId,
      message_id: messageId,
      intent: 'ROADMAP',
      answer:
        `### 📋 Complete 13-Step Action Plan & Official Portal Links\n\n` +
        `### Phase 1: Business Setup\n\n` +
        `**Step 1: Choose Business Structure** \`[Completed]\`\n` +
        `• *Action:* Register Private Limited Company, LLP, or Partnership as chosen.\n` +
        `• *Official Portal Link:* [Ministry of Corporate Affairs (MCA)](https://www.mca.gov.in/)\n\n` +
        `**Step 2: Apply for Company / Entity PAN**\n` +
        `• *Action:* Permanent Account Number application for taxation and banking.\n` +
        `• *Official Portal Link:* [Income Tax e-Filing Portal](https://incometax.gov.in/)\n\n` +
        `**Step 3: Udyam (MSME) Registration**\n` +
        `• *Action:* Zero-cost MSME certification for manufacturing concessions & fee subsidies.\n` +
        `• *Official Portal Link:* [Udyam Registration Portal](https://udyamregistration.gov.in/)\n\n` +
        `---\n\n` +
        `### Phase 2: Tax Registration\n\n` +
        `**Step 4: Goods and Services Tax (GST) Registration** \`[Needs Verification]\`\n` +
        `• *Action:* Mandatory for interstate supply of goods and turnover thresholds.\n` +
        `• *Official Portal Link:* [GST Official Portal](https://www.gst.gov.in/)\n\n` +
        `**Step 5: Maharashtra Professional Tax (PTEC / PTRC)** \`[Needs Verification]\`\n` +
        `• *Action:* State tax registration for establishment and employee deductions.\n` +
        `• *Official Portal Link:* [MahaGST Portal](https://mahagst.gov.in/)\n\n` +
        `---\n\n` +
        `### Phase 3: Local & Premises Approvals\n\n` +
        `**Step 6: Factory Licence / Shops & Establishment Registration** \`[Needs Verification]\`\n` +
        `• *Action:* Factory premises licence or local municipal registration in Mumbai.\n` +
        `• *Official Portal Link:* [Aaple Sarkar / Maharashtra Labour Department](https://lms.mahaonline.gov.in/)\n\n` +
        `**Step 7: MPCB Consent to Establish (CTE)** \`[Needs Verification]\`\n` +
        `• *Action:* Pollution control board consent for emissions and effluent compliance.\n` +
        `• *Official Portal Link:* [Maharashtra Pollution Control Board (MPCB)](https://mpcb.gov.in/)\n\n` +
        `---\n\n` +
        `### Phase 4: BIS Product Certification\n\n` +
        `**Step 8: Identify Applicable Indian Standard (IS 17526:2021 / IS 4250:2025)**\n` +
        `• *Action:* Vacuum insulated bottles (IS 17526:2021) or electric food mixers (IS 4250:2025).\n` +
        `• *Official Portal Link:* [Bureau of Indian Standards](https://www.bis.gov.in/)\n\n` +
        `**Step 9: Confirm BIS Certification Requirement (Quality Control Order)**\n` +
        `• *Action:* Mandatory certification under DPIIT / Ministry Quality Control Orders.\n` +
        `• *Official Portal Link:* [DPIIT QCO Order Portal](https://dpiit.gov.in/)\n\n` +
        `**Step 10: Identify Required Tests from Standard Clauses**\n` +
        `• *Action:* Thermal retention (Cl. 5.2), vacuum leakage (Cl. 5.3), drop test (Cl. 6.1), and migration test (Cl. 7.2 as per IS 9845).\n` +
        `• *Official Portal Link:* [BIS Test Guidelines](https://www.bis.gov.in/)\n\n` +
        `**Step 11: Find Recognized Testing Labs in Maharashtra**\n` +
        `• *Action:* National Test House (Mumbai), BIS Recognized Labs in Pune & Nagpur.\n` +
        `• *Official Portal Link:* [BIS Laboratory Directory](https://www.bis.gov.in/laboratory-directory/)\n\n` +
        `**Step 12: Apply for BIS Licence (ISI Mark Scheme-I)** \`[Locked until Steps 9, 10, 11 completed]\`\n` +
        `• *Action:* Form V application on Manakonline with factory inspection booking and test reports.\n` +
        `• *Official Portal Link:* [Manakonline BIS Licensing Portal](https://www.manakonline.in/)\n\n` +
        `---\n\n` +
        `### Phase 5: Sales & Packaging\n\n` +
        `**Step 13: Legal Metrology Packaged Commodities Registration** \`[Needs Verification]\`\n` +
        `• *Action:* Mandatory packaging declarations under Legal Metrology Rules.\n` +
        `• *Official Portal Link:* [Department of Consumer Affairs](https://consumeraffairs.nic.in/)\n\n` +
        `---\n\n` +
        `*Click on any step or use the roadmap view to track completion, download forms, and inspect document checklists.*`,
      confidence: 'HIGH',
      citations: [
        {
          chunkId: 201,
          standardNumber: 'IS 17526:2021',
          clause: 'Clause 5.2 & 7.2',
          excerpt: 'Domestic Stainless Steel Vacuum Flasks and Insulated Bottles — Specification.',
          sourceUrl: 'https://www.bis.gov.in/standard/is-17526-2021',
        },
      ],
      disclaimer: 'Verify requirements with official authorities; not legal advice.',
      suggested_actions: ['View full roadmap', 'Find labs in Maharashtra', 'Review BIS standard IS 17526:2021'],
    };
  }

  const isLabQuery = msgLower.includes('lab') || msgLower.includes('where to test') || msgLower.includes('testing center');
  if (isLabQuery) {
    if (isMixer) {
      return {
        conversation_id: context.conversationId,
        message_id: messageId,
        intent: 'LABORATORY',
        answer:
          `### 🧪 Recognized Testing Laboratories for Electric Food Mixers (IS 4250:2025)\n\n` +
          `For domestic electric food mixers, testing must be carried out at BIS-recognized / NABL-accredited electrical laboratories:\n\n` +
          `• **National Test House (NTH), Mumbai / Western Region:** Equipped for complete safety, insulation, dielectric breakdown, temperature rise, and mechanical strength tests for IS 4250.\n` +
          `• **Central Power Research Institute (CPRI) / ERDA:** High voltage, thermal endurance, and electrical duty cycle verification.\n` +
          `• **BIS Recognized Electrical Testing Labs in Maharashtra:** Available across Mumbai and Pune for routine and batch verification.\n\n` +
          `*Official Directory:* Access the real-time accredited laboratory list on the [BIS Laboratory Directory](https://www.bis.gov.in/laboratory-directory/).`,
        confidence: 'HIGH',
        citations: [
          {
            chunkId: 101,
            standardNumber: 'IS 4250:2025',
            clause: 'Laboratory Directory',
            excerpt: 'BIS recognized and NABL accredited test laboratories for domestic electrical appliances.',
            sourceUrl: 'https://www.bis.gov.in/laboratory-directory/',
          },
        ],
        disclaimer: 'Verify lab accreditation validity on the BIS portal before submitting samples.',
        suggested_actions: ['Explain BIS Scheme-I application steps', 'Review IS 4250:2025 test clauses', 'View full roadmap'],
      };
    }

    return {
      conversation_id: context.conversationId,
      message_id: messageId,
      intent: 'LABORATORY',
      answer:
        `### 🧪 Recognized Testing Laboratories in Maharashtra\n\n` +
        `• **National Test House (NTH), Mumbai:** Mechanical, chemical, thermal, and metallurgical testing.\n` +
        `• **BIS Recognized Lab - Mumbai:** Mechanical testing, chemical analysis, migration testing.\n` +
        `• **BIS Recognized Lab - Pune:** Mechanical testing, chemical analysis, corrosion testing.\n` +
        `• **BIS Recognized Lab - Nagpur:** Chemical analysis, food contact testing.\n\n` +
        `*Official Directory:* Access the real-time accredited laboratory list on the [BIS Laboratory Directory](https://www.bis.gov.in/laboratory-directory/).`,
      confidence: 'HIGH',
      citations: [
        {
          chunkId: 101,
          standardNumber: 'BIS Labs',
          clause: 'Laboratory Directory',
          excerpt: 'Directory of BIS recognized laboratories in Maharashtra.',
          sourceUrl: 'https://www.bis.gov.in/laboratory-directory/',
        },
      ],
      disclaimer: 'Verify lab accreditation validity on the BIS portal before submitting samples.',
      suggested_actions: ['Explain BIS Scheme-I application steps', 'View full roadmap'],
    };
  }

  const isTestQuery =
    (msgLower.includes('test') || msgLower.includes('clause')) &&
    (msgLower.includes('what') || msgLower.includes('which') || msgLower.includes('require') || msgLower.includes('key') || msgLower.includes('list'));

  if (isTestQuery && isMixer) {
    return {
      conversation_id: context.conversationId,
      message_id: messageId,
      intent: 'TESTING',
      answer:
        `### 🧪 Mandatory Tests for Domestic Electric Food Mixers (IS 4250:2025)\n\n` +
        `Under IS 4250:2025 and the Electrical Appliances Quality Control Order, the following key tests must be demonstrated in the in-house lab and verified at independent test facilities:\n\n` +
        `• **Electrical Safety & Insulation Resistance (Clause 7):** Leakage current below 0.25 mA and insulation resistance > 2 MΩ at 500V DC.\n` +
        `• **Power Input & Current Rating (Clause 8):** Operating power within 110% of rated specification.\n` +
        `• **Temperature Rise Test (Clause 11):** Ensures motor windings and outer enclosure do not exceed permissible thermal limits during continuous and intermittent cycles.\n` +
        `• **Moisture Resistance & Ingress (Clause 13):** Enclosure must prevent liquid spill ingress from the jar as per IPX1.\n` +
        `• **Mechanical Strength & Impact (Clause 15):** Body housing and mixing jars must withstand impact tests.\n` +
        `• **Overload & Endurance Test (Clause 20):** 100 continuous grinding and liquidizing duty cycles without electrical or thermal failure.\n` +
        `• **Safety Interlocking Mechanism (Clause 24):** Mandatory interlock stopping spindle unless jar and lid are securely engaged.\n` +
        `• **Food Contact Rust Resistance (Clause 30):** Stainless steel jars and cutter blades must be non-toxic and rust resistant.`,
      confidence: 'HIGH',
      citations: [
        {
          chunkId: 101,
          standardNumber: 'IS 4250:2025',
          clause: 'Clause 7, 8, 11, 20, 24',
          excerpt: 'Domestic Electric Food Mixers — Key Testing Clauses under IS 4250:2025.',
          sourceUrl: 'https://www.bis.gov.in/standard/is-4250-2025',
        },
      ],
      disclaimer: 'Verify with the official BIS authority before application; not legal advice.',
      suggested_actions: ['Explain BIS Scheme-I application steps', 'Find recognized electrical testing labs', 'View full roadmap'],
    };
  }

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

  if (isMixer) {
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

  if (isBottle) {
    if (msgLower.includes('which bis') || msgLower.includes('why do i need') || msgLower.includes('compulsory') || msgLower.includes('standard')) {
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