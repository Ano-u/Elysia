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

export interface AuthorSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ReplyTarget {
  id: string;
  moodPhrase: string;
  quote: string | null;
  createdAt: string;
  isPublic: boolean;
  publicationStatus: PublicationStatus;
  author: AuthorSummary;
}

export interface ModerationPreview {
  displayMoodPhrase: string;
  description: string | null;
  quote: string | null;
}

export interface RecordModerationMeta {
  customMood: boolean;
  strictReviewRequired: boolean;
  publicSanitizationApplied: boolean;
  publicSanitizationPreview?: ModerationPreview;
}

export interface ReplyContext {
  content: string;
  parentRecordId: string;
  rootRecordId: string;
  parentTarget: ReplyTarget | null;
  rootTarget: ReplyTarget | null;
}

export interface UniverseReplyContext {
  isReply: boolean;
  parentRecordId: string | null;
  rootRecordId: string | null;
  showParentArrow: boolean;
  showRootArrow: boolean;
}

// Universe Types
export interface UniverseItem {
  id: string;
  moodPhrase: string;
  quote?: string | null;
  description?: string | null;
  tags?: string[] | null;
  extraEmotions?: string[] | null;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  hearts: number;
  hugs: number;
  stars: number;
  butterflies: number;
  flowers: number;
  coord: { x: number; y: number };
  personalScore?: number;
  replyContext?: UniverseReplyContext | null;
  sanitized?: boolean;
  publicLocationLabel?: string | null;
  publicOccurredAt?: string | null;
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
  recordId?: string;
  type: string;
  label: string;
  isFocus?: boolean;
  createdAt?: string; // Newly added for Spiral chronological layout
  isSelfReply?: boolean; // Newly added for self-reply clusters
  replyContext?: ReplyContext | null; // Newly added for Star Sea blur-to-clear
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
  replyContext?: ReplyContext | null;
}

export interface RecordDetail {
  id: string;
  userId: string;
  moodPhrase: string;
  description: string | null;
  isPublic: boolean;
  visibilityIntent: VisibilityIntent;
  publicationStatus: PublicationStatus;
  publishRequestedAt: string | null;
  publishedAt: string | null;
  riskSummary: Record<string, unknown>;
  reviewNotes: string | null;
  occurredAt: string | null;
  locationId: string | null;
  publicLocationLabel?: string | null;
  sourceRecordId: string | null;
  sourceCommentId: string | null;
  editDeadlineAt: string;
  createdAt: string;
  updatedAt: string;
  sanitized?: boolean;
}

export interface CreateRecordResponse {
  record: RecordSummary;
  publishStatus: {
    status: PublicationStatus;
    label: string;
  };
  moderation?: RecordModerationMeta;
}

export interface UpdateRecordResponse extends CreateRecordResponse {
  ok: boolean;
}

export interface RecordDetailResponse {
  record: RecordDetail;
  quote: string | null;
  extraEmotions: string[];
  tags: string[];
  author: AuthorSummary;
  replyContext: ReplyContext | null;
  rawContent?: {
    moodPhrase: string;
    description: string | null;
    quote: string | null;
    occurredAt: string | null;
    locationId: string | null;
  } | null;
}

export interface CreateReplyRequest {
  content: string;
  moodPhrase: string;
  quote?: string;
  description?: string;
  extraEmotions?: string[];
  isPublic?: boolean;
}

export interface CreateReplyResponse {
  comment: {
    id: string;
    content: string;
    parentRecordId: string;
    rootRecordId: string;
    createdAt: string;
  };
  record: RecordSummary;
  publishStatus: {
    status: PublicationStatus;
    label: string;
  };
  moderation?: RecordModerationMeta;
}

export interface HomeFeedResponse {
  items: RecordSummary[];
  nextCursor: string | null;
}

export interface OnboardingGuideStep {
  id: string;
  title: string;
  description: string;
  target: string;
  ctaText: string;
}

export interface OnboardingGuideSafetyCard {
  title: string;
  bullets: string[];
  confirmText: string;
}

export interface OnboardingGuideState {
  completedAt: string | null;
  skippedAt: string | null;
  lastSeenStep: number;
  version: string;
  canReplay: boolean;
}

export interface OnboardingGuide {
  version: string;
  welcomeTitle: string;
  welcomeDescription: string;
  welcomePrimaryAction: string;
  welcomeSecondaryAction: string;
  steps: OnboardingGuideStep[];
  safetyCard: OnboardingGuideSafetyCard;
  state: OnboardingGuideState;
}

export interface OnboardingTask {
  day: number;
  title: string;
  code: string;
  description: string;
  ctaText: string;
  ctaTarget: string;
  rewardText: string;
}

export interface OnboardingEntryContext {
  needsAccessApplication: boolean;
  accessStatus: AccessStatus;
  estimatedReviewText: string | null;
  applicationHint: string | null;
}

export interface OnboardingRestartSuggestion {
  shouldShow: boolean;
  headline: string | null;
  body: string | null;
}

export interface OnboardingProgressData {
  current_day: number;
  completed_days: number[];
  last_completed_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface OnboardingProgressResponse {
  progress: OnboardingProgressData;
  guide: OnboardingGuide;
  tasks: OnboardingTask[];
  targetTimeSeconds: number;
  entryContext: OnboardingEntryContext;
  restartSuggestion: OnboardingRestartSuggestion;
}

export interface OnboardingGuideStatePatchRequest {
  completedAt?: string | null;
  skippedAt?: string | null;
  lastSeenStep?: number;
  version?: string;
}

export interface OnboardingGuideStatePatchResponse {
  ok: boolean;
  state: OnboardingGuideState;
}

export interface OnboardingCompleteDayResponse {
  ok: boolean;
}

export type NudgeFeedbackAction = "liked" | "dismissed" | "clicked" | "manual_trigger";
export type NudgeScene = "home_idle" | "first_publish_error" | "first_publish_success" | "guide_complete" | "mindmap_locked";

export interface NudgeItem {
  id: string;
  text: string;
  actionLabel: string;
  actionTarget: string;
}

export interface NudgeRecommendationsResponse {
  scene: NudgeScene;
  items: NudgeItem[];
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
