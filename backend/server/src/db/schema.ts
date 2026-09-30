import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  serial,
  date,
  numeric,
  primaryKey,
  index,
  vector,
  pgEnum,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const tsVector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

export const userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN']);
export const statusEnum = pgEnum('status', ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE', 'NEEDS_VERIFICATION']);
export const priorityEnum = pgEnum('priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const confidenceEnum = pgEnum('confidence', ['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_EVIDENCE']);
export const businessTypeEnum = pgEnum('business_type', ['manufacturing', 'trading', 'online_seller', 'service']);
export const businessStructureEnum = pgEnum('business_structure', ['proprietorship', 'partnership', 'llp', 'private_limited', 'not_decided']);
export const premisesTypeEnum = pgEnum('premises_type', ['home', 'shop', 'factory_unit', 'warehouse']);
export const applicabilityEnum = pgEnum('applicability', ['REQUIRED', 'CONDITIONAL', 'VERIFY']);
export const docTypeEnum = pgEnum('doc_type', ['standard', 'scheme', 'faq', 'guideline', 'notice']);
export const standardStatusEnum = pgEnum('standard_status', ['active', 'withdrawn', 'superseded']);
export const schemeEnum = pgEnum('scheme', ['ISI', 'CRS', 'HALLMARKING']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').default('USER').notNull(),
  preferredLanguage: text('preferred_language').default('en').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  businessName: text('business_name'),
  businessType: businessTypeEnum('business_type'),
  structure: businessStructureEnum('structure'),
  state: text('state'),
  city: text('city'),
  premisesType: premisesTypeEnum('premises_type'),
  employeeCount: integer('employee_count'),
  expectedTurnover: numeric('expected_turnover'),
  profileConfirmed: boolean('profile_confirmed').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('businesses_user_idx').on(table.userId),
}));

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  material: text('material'),
  usage: text('usage'),
  attributes: jsonb('attributes'),
}, (table) => ({
  businessIdx: index('products_business_idx').on(table.businessId),
}));

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  docType: docTypeEnum('doc_type').notNull(),
  authority: text('authority'),
  standardNumber: text('standard_number'),
  sourceUrl: text('source_url'),
  storagePath: text('storage_path'),
  version: text('version'),
  publishedDate: date('published_date'),
  lastVerifiedAt: date('last_verified_at'),
  checksum: text('checksum'),
  licenceNote: text('licence_note'),
}, (table) => ({
  standardIdx: index('documents_standard_idx').on(table.standardNumber),
  typeIdx: index('documents_type_idx').on(table.docType),
}));

export const chunks = pgTable('chunks', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id').references(() => documents.id).notNull(),
  section: text('section'),
  clause: text('clause'),
  page: integer('page'),
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  tsv: tsVector('tsv').generatedAlwaysAs(sql`to_tsvector('simple', content)`),
  embedding: vector('embedding', { dimensions: 768 }),
}, (table) => ({
  docIdx: index('chunks_document_idx').on(table.documentId),
  tsvIdx: index('chunks_tsv_idx').using('gin', table.tsv),
  vecIdx: index('chunks_vec_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const standards = pgTable('standards', {
  id: serial('id').primaryKey(),
  standardNumber: text('standard_number').unique().notNull(),
  title: text('title'),
  scope: text('scope'),
  status: standardStatusEnum('status'),
  icsCode: text('ics_code'),
  productTags: text('product_tags').array(),
  sourceUrl: text('source_url'),
  lastVerifiedAt: date('last_verified_at'),
}, (table) => ({
  numberIdx: index('standards_number_idx').on(table.standardNumber),
  tagsIdx: index('standards_tags_idx').using('gin', table.productTags),
}));

export const requirements = pgTable('requirements', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  phase: text('phase').notNull(),
  authority: text('authority').notNull(),
  description: text('description'),
  procedureSteps: jsonb('procedure_steps'),
  documentsRequired: text('documents_required').array(),
  applyUrl: text('apply_url'),
  statusUrl: text('status_url'),
  sourceUrl: text('source_url').notNull(),
  sourceQuote: text('source_quote'),
  lastVerifiedAt: date('last_verified_at').notNull(),
  priority: priorityEnum('priority').default('MEDIUM').notNull(),
});

export const applicabilityRules = pgTable('applicability_rules', {
  requirementId: text('requirement_id').references(() => requirements.id).notNull(),
  conditions: jsonb('conditions').notNull(),
  applicability: applicabilityEnum('applicability').default('REQUIRED').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.requirementId] }),
}));

export const requirementDeps = pgTable('requirement_deps', {
  requirementId: text('requirement_id').references(() => requirements.id).notNull(),
  dependsOn: text('depends_on').references(() => requirements.id).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.requirementId, table.dependsOn] }),
}));

export const fees = pgTable('fees', {
  id: serial('id').primaryKey(),
  requirementId: text('requirement_id').references(() => requirements.id).notNull(),
  amount: numeric('amount'),
  currency: text('currency').default('INR').notNull(),
  condition: jsonb('condition'),
  note: text('note'),
  sourceUrl: text('source_url').notNull(),
  lastVerifiedAt: date('last_verified_at').notNull(),
}, (table) => ({
  reqIdx: index('fees_requirement_idx').on(table.requirementId),
}));

export const taxRules = pgTable('tax_rules', {
  id: serial('id').primaryKey(),
  level: text('level').notNull(),
  state: text('state'),
  taxName: text('tax_name').notNull(),
  appliesWhen: jsonb('applies_when').notNull(),
  rateOrNote: text('rate_or_note').notNull(),
  threshold: jsonb('threshold'),
  sourceUrl: text('source_url').notNull(),
  lastVerifiedAt: date('last_verified_at').notNull(),
});

export const labs = pgTable('labs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  state: text('state'),
  city: text('city'),
  capabilities: text('capabilities').array(),
  contact: jsonb('contact'),
  sourceUrl: text('source_url'),
  lastVerifiedAt: date('last_verified_at'),
}, (table) => ({
  stateIdx: index('labs_state_idx').on(table.state),
  cityIdx: index('labs_city_idx').on(table.city),
}));

export const schemeRules = pgTable('scheme_rules', {
  id: serial('id').primaryKey(),
  productCategory: text('product_category').notNull(),
  scheme: schemeEnum('scheme').notNull(),
  mandatory: boolean('mandatory').notNull(),
  basis: text('basis'),
  sourceUrl: text('source_url').notNull(),
  lastVerifiedAt: date('last_verified_at').notNull(),
}, (table) => ({
  categoryIdx: index('scheme_rules_category_idx').on(table.productCategory),
}));

export const roadmaps = pgTable('roadmaps', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id).notNull(),
  version: integer('version').default(1).notNull(),
  progress: numeric('progress').default('0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  businessIdx: index('roadmaps_business_idx').on(table.businessId),
}));

export const roadmapSteps = pgTable('roadmap_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  roadmapId: uuid('roadmap_id').references(() => roadmaps.id).notNull(),
  requirementId: text('requirement_id').references(() => requirements.id),
  stepOrder: integer('step_order').notNull(),
  phase: text('phase').notNull(),
  title: text('title').notNull(),
  reason: text('reason'),
  status: statusEnum('status').default('NOT_STARTED').notNull(),
  priority: priorityEnum('priority').default('MEDIUM').notNull(),
  confidence: confidenceEnum('confidence').default('LOW').notNull(),
  dependsOn: uuid('depends_on').array(),
  payload: jsonb('payload'),
}, (table) => ({
  roadmapIdx: index('roadmap_steps_roadmap_idx').on(table.roadmapId),
  orderIdx: index('roadmap_steps_order_idx').on(table.stepOrder),
}));

export const citations = pgTable('citations', {
  id: serial('id').primaryKey(),
  roadmapStepId: uuid('roadmap_step_id').references(() => roadmapSteps.id),
  messageId: uuid('message_id').references(() => messages.id),
  chunkId: integer('chunk_id').references(() => chunks.id),
  requirementId: text('requirement_id').references(() => requirements.id),
  excerpt: text('excerpt'),
  sourceUrl: text('source_url'),
});

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id).notNull(),
  requirementId: text('requirement_id').references(() => requirements.id),
  referenceNumber: text('reference_number'),
  submittedOn: date('submitted_on'),
  status: text('status'),
  notes: text('notes'),
  reminderDate: date('reminder_date'),
}, (table) => ({
  businessIdx: index('applications_business_idx').on(table.businessId),
  requirementIdx: index('applications_requirement_idx').on(table.requirementId),
}));

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  businessId: uuid('business_id').references(() => businesses.id),
  language: text('language').default('en').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('conversations_user_idx').on(table.userId),
  businessIdx: index('conversations_business_idx').on(table.businessId),
}));

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  intent: text('intent'),
  detectedLanguage: text('detected_language'),
  normalizedQuery: text('normalized_query'),
  retrievedChunkIds: integer('retrieved_chunk_ids').array(),
  confidence: confidenceEnum('confidence').default('LOW').notNull(),
  validated: boolean('validated').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  convIdx: index('messages_conversation_idx').on(table.conversationId),
}));

export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  messageId: uuid('message_id').references(() => messages.id).notNull(),
  rating: integer('rating').notNull(),
  reason: text('reason'),
  comment: text('comment'),
}, (table) => ({
  userIdx: index('feedback_user_idx').on(table.userId),
  messageIdx: index('feedback_message_idx').on(table.messageId),
}));