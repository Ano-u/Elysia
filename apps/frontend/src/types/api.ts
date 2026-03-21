// Auto-linking Types
export type AutoLinkingMode = "suggestion";
export type AutoLinkingScope = "private_only" | "public_recommendation";
export type UserRole = "user" | "admin";
export type VisibilityIntent = "private" | "public";
export type AccessStatus = "not_submitted" | "pending" | "approved" | "rejected";
export type PublicationStatus =
  | "private"
  | "pending_auto"
  | "pending_manual"
  | "pending_second_review"
  | "risk_control_24h"
  | "published"
  | "rejected"
  | "needs_changes";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  isBanned: boolean;
  banUntil: string | null;
  accessStatus: AccessStatus;
  riskControlUntil: string | null;
  riskControlReason: string | null;
}

export interface AuthMeResponse {
  user: AuthUser | null;
}

export interface DevSwitchUserRequest {
  userId?: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role?: UserRole;
}

export interface DevSwitchUserResponse {
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    role: UserRole;
  };
}

export interface AutoLinkingPreference {
  enabled: boolean;
  scope: AutoLinkingScope;
  mode: AutoLinkingMode;
  consentedAt: string | null;
}

export interface AutoLinkingPatchRequest {
  enabled: boolean;
  scope?: AutoLinkingScope;
  mode?: AutoLinkingMode;
}

export interface AutoLinkingPatchResponse {
  ok: boolean;
  autoLinking: AutoLinkingPreference;
  hint?: string;
}

// Access Application Types
export interface AccessApplication {
  id: string;
  essay: string;
  status: AccessStatus;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface AccessApplicationStatusResponse {
  accessStatus: AccessStatus;
  canSubmit: boolean;
  application: AccessApplication | null;
}

// Record Publish Status Types
export interface PublishStatusResponse {
  recordId: string;
  visibilityIntent: VisibilityIntent;
  status: PublicationStatus;
  label: string;
  isPublic: boolean;
  publishRequestedAt: string | null;
  publishedAt: string | null;
  reviewNotes: string | null;
  riskSummary?: Record<string, unknown>;
}

// Universe Types
export interface UniverseItem {
  id: string;
  moodPhrase: string;
  quote?: string | null;
  description?: string | null;
  tags?: string[] | null;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  hearts: number;
  hugs: number;
  coord: { x: number; y: number };
  personalScore?: number;
}

export interface UniverseResponse {
  viewport: { x: number; y: number; w: number; h: number };
  items: UniverseItem[];
  focus: { primary: string | null; secondary: string[] };
  renderHint: { blurFirst: boolean; focusRefreshSeconds: number };
}

// MindMap Types
export interface MindMapNode {
  id: string;
  type: string;
  label: string;
  isFocus?: boolean;
}

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
}

export interface MindMapResponse {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

// Record Types
export interface CreateRecordRequest {
  moodPhrase: string;
  quote?: string;
  extraEmotions?: string[];
  description?: string;
  isPublic?: boolean;
  imageIds?: string[];
  drawingId?: string;
  occurredAt?: string;
  locationId?: string;
  tags?: string[];
}

export interface UpdateRecordRequest {
  moodPhrase?: string;
  quote?: string | null;
  extraEmotions?: string[];
  description?: string;
  occurredAt?: string | null;
  locationId?: string | null;
  tags?: string[];
}

export interface RecordSummary {
  id: string;
  moodPhrase: string;
  quote?: string | null;
  extraEmotions?: string[] | null;
  tags?: string[] | null;
  description: string | null;
  imageIds?: string[] | null;
  drawingId?: string | null;
  visibilityIntent: VisibilityIntent;
  publicationStatus: PublicationStatus;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecordResponse {
  record: RecordSummary;
  publishStatus: {
    status: PublicationStatus;
    label: string;
  };
}

export interface UpdateRecordResponse extends CreateRecordResponse {
  ok: boolean;
}

export interface HomeFeedResponse {
  items: RecordSummary[];
  nextCursor: string | null;
}

export interface OnboardingTask {
  day: number;
  title: string;
  code: string;
}

export interface OnboardingProgressData {
  current_day: number;
  completed_days: number[];
  last_completed_at: string | null;
  metadata: Record<string, unknown>;
}

export interface OnboardingProgressResponse {
  progress: OnboardingProgressData;
  tasks: OnboardingTask[];
  targetTimeSeconds: number;
}

export interface OnboardingCompleteDayResponse {
  ok: boolean;
}

export type NudgeFeedbackAction = "liked" | "dismissed" | "clicked" | "manual_trigger";

export interface NudgeRecommendationsResponse {
  items: string[];
}

export interface NudgeFeedbackRequest {
  action: NudgeFeedbackAction;
  context?: Record<string, unknown>;
}

export interface AppealRecord {
  banEventId: string;
  banStatus: "active" | "lifted";
  violationType: string;
  reason: string;
  isPermanent: boolean;
  createdAt: string;
  appeal: {
    id: string;
    status: "pending" | "approved" | "rejected";
    submittedAt: string;
    reviewedAt: string | null;
    resolutionNote: string | null;
  } | null;
}

export interface AppealsStatusResponse {
  isBanned: boolean;
  items: AppealRecord[];
  activeBanEvent?: {
    id: string;
    appealUsed: boolean;
    reason?: string;
    violationType?: string;
    createdAt?: string;
  };
  pendingAppeal?: {
    id: string;
  };
}
