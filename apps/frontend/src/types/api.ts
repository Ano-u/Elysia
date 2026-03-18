// Auto-linking Types
export type AutoLinkingMode = "suggestion";
export type AutoLinkingScope = "private_only" | "public_recommendation";

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
export type AccessStatus = "not_submitted" | "pending" | "approved" | "rejected";

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
export type VisibilityIntent = "private" | "public";
export type PublicationStatus = "private" | "pending_auto" | "pending_manual" | "pending_second_review" | "risk_control_24h" | "published" | "rejected" | "needs_changes";

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
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  coord: { x: number; y: number };
  reactions?: { hearts: number; hugs: number };
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
  description?: string;
  visibilityIntent?: VisibilityIntent;
}

export interface RecordResponse {
  id: string;
  moodPhrase: string;
  publicationStatus: PublicationStatus;
  visibilityIntent: VisibilityIntent;
}

export interface AppealsStatusResponse {
  isBanned: boolean;
  activeBanEvent?: {
    id: string;
    appealUsed: boolean;
  };
  pendingAppeal?: {
    id: string;
  };
}
