export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface BusinessProfile {
  id: string;
  userId: string;
  productName: string;
  productDescription?: string;
  material?: string;
  location: string;
  businessType?: 'manufacturing' | 'trading' | 'service' | 'import';
  structure?: 'proprietorship' | 'partnership' | 'llp' | 'private_limited' | 'public_limited';
  premisesType?: 'factory' | 'workshop' | 'home' | 'commercial';
  workerCount?: number;
  annualTurnover?: number;
  profileConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileField {
  key: string;
  label: string;
  value: string | number | undefined;
  required: boolean;
  placeholder?: string;
}

export interface ProfileQuestion {
  field: string;
  question: string;
  options?: string[];
  type: 'text' | 'select' | 'number';
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  messageType: 'text' | 'profile' | 'roadmap' | 'citations' | 'insufficient_evidence' | 'suggested_actions' | 'error';
  metadata?: Record<string, unknown>;
  createdAt: string;
  streamingContent?: string;
  isStreaming?: boolean;
  citations?: Citation[];
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE';
  verifiedOn?: string;
  suggestedActions?: string[];
  profile?: Record<string, unknown>;
  profileQuestions?: ProfileQuestion[];
  roadmap?: { id: string; phases: Array<{ name: string; count: number }> };
  intent?: string;
}

export interface Conversation {
  id: string;
  userId?: string;
  title: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface Citation {
  id: string;
  documentTitle: string;
  standardNumber?: string;
  section?: string;
  clause?: string;
  page?: number;
  excerpt: string;
  sourceUrl?: string;
  version?: string;
  verifiedOn: string;
  authority?: string;
}


export interface ConfidenceBadge {
  level: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE';
  label: string;
}

export interface Roadmap {
  id: string;
  businessId: string;
  version: number;
  generatedAt: string;
  phases: RoadmapPhase[];
  totalSteps: number;
  completedSteps: number;
}

export interface RoadmapPhase {
  name: string;
  order: number;
  steps: RoadmapStep[];
}

export interface RoadmapStep {
  id: string;
  roadmapId: string;
  phase: string;
  order: number;
  title: string;
  description?: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_APPLICABLE' | 'NEEDS_VERIFICATION';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  authority?: string;
  confidence: ConfidenceBadge;
  dependsOn?: string[];
  reason?: string;
  fee?: FeeInfo;
  taxNote?: string;
  documents?: DocumentChecklistItem[];
  sources: Citation[];
  applyUrl?: string;
  statusUrl?: string;
  prefillData?: Record<string, unknown>;
}

export interface FeeInfo {
  amount: number;
  condition?: string;
  source: string;
  verifiedOn: string;
  currency: string;
}

export interface DocumentChecklistItem {
  id: string;
  name: string;
  required: boolean;
  completed: boolean;
  notes?: string;
}

export interface WhyResponse {
  stepId: string;
  reason: string;
  citations: Citation[];
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  authority: string;
  category: string;
  tags: string[];
  sources: Citation[];
}

export interface Standard {
  id: string;
  standardNumber: string;
  title: string;
  scope?: string;
  status: 'current' | 'withdrawn' | 'draft';
  category: string;
  testClauses?: string[];
  relatedStandards?: string[];
  confidence: ConfidenceBadge;
  sources: Citation[];
  verifiedOn: string;
}

export interface Lab {
  id: string;
  name: string;
  city: string;
  state: string;
  capabilities: string[];
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  coordinates?: {
    lat: number;
    lng: number;
  };
  sourceUrl?: string;
  verifiedOn: string;
}

export interface Application {
  id: string;
  businessId: string;
  requirementId: string;
  requirementTitle: string;
  referenceNumber?: string;
  submittedDate?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  reminderDate?: string;
  notes?: string;
  statusUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrefillData {
  applicationId: string;
  fields: Record<string, string>;
  downloadUrl?: string;
}

export interface Feedback {
  id: string;
  conversationId: string;
  messageId: string;
  rating: 'up' | 'down';
  reason?: string;
  createdAt: string;
}

export interface AdminMetrics {
  retrievalHitAt3: number;
  citationCorrectness: number;
  unsupportedAnswerRate: number;
  roadmapRecall: number;
  refusalCorrectness: number;
  trendData: MetricTrendPoint[];
  failedQuestions: FailedQuestion[];
}

export interface MetricTrendPoint {
  date: string;
  retrievalHitAt3: number;
  citationCorrectness: number;
  unsupportedAnswerRate: number;
  roadmapRecall: number;
  refusalCorrectness: number;
}

export interface FailedQuestion {
  id: string;
  question: string;
  expectedAnswer: string;
  actualAnswer: string;
  category: string;
  timestamp: string;
}

export interface SourceDocument {
  id: string;
  title: string;
  type: 'BIS' | 'GOVERNMENT' | 'OTHER';
  lastVerifiedAt: string;
  ingestionStatus: 'PENDING' | 'COMPLETED' | 'FAILED';
  stale: boolean;
  documentCount: number;
}

export type Language = 'en' | 'hi' | 'mr';

export interface VoiceInputState {
  isListening: boolean;
  transcript: string;
  error?: string;
}