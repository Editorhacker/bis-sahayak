import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  preferredLanguage: z.enum(['en', 'hi', 'mr']).default('en'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({});

export const logoutSchema = z.object({});

export const businessCreateSchema = z.object({
  businessName: z.string().min(1).max(200).nullish(),
  businessType: z.enum(['manufacturing', 'trading', 'online_seller', 'service']).nullish(),
  structure: z.preprocess((val) => {
    if (val === 'public_limited') return 'private_limited';
    return val;
  }, z.enum(['proprietorship', 'partnership', 'llp', 'private_limited', 'not_decided'])).nullish(),
  state: z.string().min(1).max(100).nullish(),
  city: z.string().min(1).max(100).nullish(),
  premisesType: z.preprocess((val) => {
    if (val === 'factory') return 'factory_unit';
    if (val === 'commercial') return 'shop';
    return val;
  }, z.enum(['home', 'shop', 'factory_unit', 'warehouse'])).nullish(),
  employeeCount: z.number().int().min(0).max(10000).nullish(),
  expectedTurnover: z.number().int().min(0).nullish(),
});

export const businessUpdateSchema = businessCreateSchema.partial();

export const businessConfirmSchema = z.object({});

export const productCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: z.string().max(100).optional(),
  material: z.string().max(100).optional(),
  usage: z.string().max(500).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export const productUpdateSchema = productCreateSchema.partial();

export const chatMessageSchema = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().min(1).max(10000),
  language: z.enum(['auto', 'en', 'hi', 'mr']).default('auto'),
});

export const conversationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const roadmapGenerateSchema = z.object({});

export const roadmapStepUpdateSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE', 'NEEDS_VERIFICATION']),
});

export const applicationCreateSchema = z.object({
  businessId: z.string().uuid(),
  requirementId: z.string().min(1),
  referenceNumber: z.string().max(100).optional(),
  submittedOn: z.string().date().optional(),
  status: z.string().max(50).optional(),
  notes: z.string().max(5000).optional(),
  reminderDate: z.string().date().optional(),
});

export const applicationUpdateSchema = applicationCreateSchema.partial();

export const feedbackSchema = z.object({
  messageId: z.string().uuid(),
  rating: z.number().int().min(-1).max(1),
  reason: z.string().max(500).optional(),
  comment: z.string().max(5000).optional(),
});

export const standardSearchSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const standardRecommendSchema = z.object({
  productDescription: z.string().min(1).max(5000),
  productCategory: z.string().max(100).optional(),
  material: z.string().max(100).optional(),
  usage: z.string().max(500).optional(),
});

export const certificationAnalyzeSchema = z.object({
  productCategory: z.string().min(1).max(100),
  productName: z.string().min(1).max(200),
  material: z.string().max(100).optional(),
  usage: z.string().max(500).optional(),
});

export const labSearchSchema = z.object({
  state: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  test: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const requirementDetailSchema = z.object({
  id: z.string().min(1),
});

export const adminSourceUploadSchema = z.object({
  title: z.string().min(1).max(500),
  docType: z.enum(['standard', 'scheme', 'faq', 'guideline', 'notice']),
  authority: z.string().max(200).optional(),
  standardNumber: z.string().max(50).optional(),
  sourceUrl: z.string().url(),
  version: z.string().max(50).optional(),
  publishedDate: z.string().date().optional(),
  licenceNote: z.string().max(1000).optional(),
  content: z.string().min(1),
});

export const adminIngestSchema = z.object({
  documentIds: z.array(z.number().int()).optional(),
  reembed: z.boolean().default(false),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const businessIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const productIdParamSchema = z.object({
  pid: z.string().uuid(),
});

export const roadmapIdParamSchema = z.object({
  roadmapId: z.string().uuid(),
});

export const stepIdParamSchema = z.object({
  stepId: z.string().uuid(),
});

export const applicationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const messageIdParamSchema = z.object({
  id: z.string().uuid(),
});