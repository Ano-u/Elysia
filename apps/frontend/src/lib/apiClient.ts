import { fetchApi } from './api';
import type {
  AuthMeResponse,
  CreateRecordResponse,
  DevSwitchUserRequest,
  DevSwitchUserResponse,
  AccessApplicationStatusResponse,
  AppealsStatusResponse,
  AutoLinkingPatchRequest,
  AutoLinkingPatchResponse,
  AutoLinkingPreference,
  CreateRecordRequest,
  HomeFeedResponse,
  MindMapResponse,
  NudgeFeedbackRequest,
  NudgeRecommendationsResponse,
  OnboardingCompleteDayResponse,
  OnboardingProgressResponse,
  PublicationStatus,
  PublishStatusResponse,
  RecordSummary,
  UpdateRecordRequest,
  UpdateRecordResponse,
  UniverseResponse
} from '../types/api';

type RawRecordSummary = {
  id: string;
  mood_phrase: string;
  quote?: string | null;
  extra_emotions?: string[] | null;
  tags?: string[] | null;
  description: string | null;
  image_ids?: string[] | null;
  drawing_id?: string | null;
  visibility_intent: 'private' | 'public';
  publication_status: PublicationStatus;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

type RawCreateRecordResponse = {
  record: RawRecordSummary;
  publishStatus: {
    status: PublicationStatus;
    label: string;
  };
};

type RawUpdateRecordResponse = RawCreateRecordResponse & {
  ok: boolean;
};

type RawHomeFeedResponse = {
  items: RawRecordSummary[];
  nextCursor: string | null;
};

type RawUniverseItem = {
  id: string;
  mood_phrase: string;
  quote?: string | null;
  description?: string | null;
  tags?: string[] | null;
  extra_emotions?: string[] | null;
  created_at: string;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  hearts?: string | number;
  hugs?: string | number;
  stars?: string | number;
  butterflies?: string | number;
  flowers?: string | number;
  coord: { x: number; y: number };
  personalScore?: number;
};

type RawUniverseViewportResponse = {
  viewport: { x: number; y: number; w: number; h: number };
  items: RawUniverseItem[];
  focus?: {
    primary?: { id: string } | null;
    secondary?: Array<{ id: string }>;
  };
  renderHint: { blurFirst: boolean; focusRefreshSeconds: number };
};

type RawMindMapResponse = {
  nodes: Array<{
    id: string;
    node_type: string;
    label: string;
    payload?: unknown;
  }>;
  edges: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    edge_type: string;
    weight: string | number;
  }>;
};

type RawAppealsStatus = {
  items: Array<{
    banEventId: string;
    banStatus: 'active' | 'lifted';
    violationType: string;
    reason: string;
    isPermanent: boolean;
    createdAt: string;
    appeal: {
      id: string;
      status: 'pending' | 'approved' | 'rejected';
      submittedAt: string;
      reviewedAt: string | null;
      resolutionNote: string | null;
    } | null;
  }>;
};

function mapRecordSummary(raw: RawRecordSummary): RecordSummary {
  return {
    id: raw.id,
    moodPhrase: raw.mood_phrase,
    quote: raw.quote,
    extraEmotions: raw.extra_emotions,
    tags: raw.tags,
    description: raw.description,
    imageIds: raw.image_ids,
    drawingId: raw.drawing_id,
    visibilityIntent: raw.visibility_intent,
    publicationStatus: raw.publication_status,
    isPublic: raw.is_public,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

// --- Auth ---
export const getAuthMe = () =>
  fetchApi<AuthMeResponse>('/api/auth/me');

export const switchUser = (payload: DevSwitchUserRequest) =>
  fetchApi<DevSwitchUserResponse>(`/api/auth/dev/switch-user`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const logout = () =>
  fetchApi<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
  });

// --- Records ---
export const createRecord = (data: CreateRecordRequest) =>
  fetchApi<RawCreateRecordResponse>('/api/records', {
    method: 'POST',
    body: JSON.stringify(data),
  }).then((raw): CreateRecordResponse => ({
    record: mapRecordSummary(raw.record),
    publishStatus: raw.publishStatus,
  }));

export const getRecordPublishStatus = (id: string) =>
  fetchApi<PublishStatusResponse>(`/api/records/${id}/publish-status`);

export const updateRecordVisibility = (id: string, isPublic: boolean) =>
  fetchApi<RawCreateRecordResponse>(`/api/records/${id}/visibility`, {
    method: 'PATCH',
    body: JSON.stringify({ isPublic }),
  }).then((raw): CreateRecordResponse => ({
    record: mapRecordSummary(raw.record),
    publishStatus: raw.publishStatus,
  }));

export const updateRecord = (id: string, data: UpdateRecordRequest) =>
  fetchApi<RawUpdateRecordResponse>(`/api/records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }).then((raw): UpdateRecordResponse => ({
    ok: raw.ok,
    record: mapRecordSummary(raw.record),
    publishStatus: raw.publishStatus,
  }));

export const getHomeFeed = (limit = 20, cursor?: string) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set('cursor', cursor);
  }
  return fetchApi<RawHomeFeedResponse>(`/api/home/feed?${params.toString()}`).then(
    (raw): HomeFeedResponse => ({
      items: raw.items.map(mapRecordSummary),
      nextCursor: raw.nextCursor,
    }),
  );
};

// --- Universe ---
export const getUniverseViewport = (x: number, y: number, w: number, h: number) =>
  fetchApi<RawUniverseViewportResponse>(`/api/universe/viewport?x=${x}&y=${y}&w=${w}&h=${h}`).then(
    (raw): UniverseResponse => ({
      viewport: raw.viewport,
      items: raw.items.map((item) => ({
        id: item.id,
        moodPhrase: item.mood_phrase,
        quote: item.quote ?? null,
        description: item.description ?? null,
        tags: item.tags ?? undefined,
        extraEmotions: item.extra_emotions ?? undefined,
        createdAt: item.created_at,
        authorId: item.user_id,
        authorName: item.display_name,
        authorAvatar: item.avatar_url ?? null,
        hearts: Number(item.hearts ?? 0),
        hugs: Number(item.hugs ?? 0),
        stars: Number(item.stars ?? 0),
        butterflies: Number(item.butterflies ?? 0),
        flowers: Number(item.flowers ?? 0),
        coord: item.coord,
        personalScore: item.personalScore,
      })),
      focus: {
        primary: raw.focus?.primary?.id ?? null,
        secondary: raw.focus?.secondary?.map((node) => node.id) ?? [],
      },
      renderHint: raw.renderHint,
    }),
  );

export const getUniverseFocus = () =>
  fetchApi('/api/universe/focus');

// --- Reactions ---
export const toggleReaction = (recordId: string, reactionType: string) =>
  fetchApi<{ ok: true }>('/api/reactions', {
    method: 'POST',
    body: JSON.stringify({ recordId, reactionType }),
  });

// --- MindMap ---
export const getMindMapMe = (mode: 'simple' | 'deep' = 'simple') =>
  fetchApi<RawMindMapResponse>(`/api/mindmap/me?mode=${mode}`).then(
    (raw): MindMapResponse => ({
      nodes: raw.nodes.map((node) => ({
        id: node.id,
        type: node.node_type,
        label: node.label,
      })),
      edges: raw.edges.map((edge) => ({
        id: edge.id,
        source: edge.source_node_id,
        target: edge.target_node_id,
        type: edge.edge_type,
        strength: Number(edge.weight),
      })),
    }),
  );

export const createManualLink = (sourceRecordId: string, targetRecordId: string) =>
  fetchApi('/api/mindmap/manual-link', {
    method: 'POST',
    body: JSON.stringify({ sourceRecordId, targetRecordId }),
  });

// --- Access Application ---
export const getAccessApplicationStatus = () =>
  fetchApi<AccessApplicationStatusResponse>('/api/access/application/status');

export const submitAccessApplication = (essay: string) =>
  fetchApi('/api/access/application', {
    method: 'POST',
    body: JSON.stringify({ essay }),
  });

// --- Appeals ---
export const getAppealsStatus = () =>
  fetchApi<RawAppealsStatus>('/api/appeals/status').then((raw): AppealsStatusResponse => {
    const items = raw.items ?? [];
    const active = items.find((item) => item.banStatus === 'active');
    const pending = items.find((item) => item.appeal?.status === 'pending');

    return {
      isBanned: Boolean(active),
      items,
      activeBanEvent: active
        ? {
            id: active.banEventId,
            appealUsed: Boolean(active.appeal && active.appeal.status !== 'pending'),
            reason: active.reason,
            violationType: active.violationType,
            createdAt: active.createdAt,
          }
        : undefined,
      pendingAppeal: pending?.appeal ? { id: pending.appeal.id } : undefined,
    };
  });

export const submitAppeal = (banEventId: string, appealText: string) =>
  fetchApi('/api/appeals', {
    method: 'POST',
    body: JSON.stringify({ banEventId, appealText }),
  });

// --- Auto Linking ---
export const getAutoLinkingSettings = () =>
  fetchApi<AutoLinkingPreference>('/api/me/auto-linking');

export const updateAutoLinkingSettings = (data: AutoLinkingPatchRequest) =>
  fetchApi<AutoLinkingPatchResponse>('/api/me/auto-linking', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// --- Onboarding ---
export const getOnboardingProgress = () =>
  fetchApi<OnboardingProgressResponse>('/api/onboarding/progress');

export const completeOnboardingDay = (day: number) =>
  fetchApi<OnboardingCompleteDayResponse>('/api/onboarding/complete-day', {
    method: 'POST',
    body: JSON.stringify({ day }),
  });

export const getNudgeRecommendations = () =>
  fetchApi<NudgeRecommendationsResponse>('/api/nudges/recommendations');

export const submitNudgeFeedback = (payload: NudgeFeedbackRequest) =>
  fetchApi<{ ok: true }>('/api/nudges/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
