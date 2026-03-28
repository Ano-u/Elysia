import { fetchApi } from './api';
import type {
  AuthMeResponse,
  AuthorSummary,
  CreateReplyRequest,
  CreateReplyResponse,
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
  NudgeScene,
  NudgeFeedbackRequest,
  NudgeRecommendationsResponse,
  OnboardingCompleteDayResponse,
  OnboardingGuideStatePatchRequest,
  OnboardingGuideStatePatchResponse,
  OnboardingProgressResponse,
  PublicationStatus,
  PublishStatusResponse,
  RecordDetailResponse,
  RecordSummary,
  ReplyContext,
  ReplyTarget,
  UpdateRecordRequest,
  UpdateRecordResponse,
  UniverseResponse
} from '../types/api';

type RawRecordSummary = {
  id: string;
  mood_mode?: "preset" | "other_random" | "custom";
  custom_mood_phrase?: string | null;
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
  replyContext?: RawReplyContext | null;
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
  replyContext?: {
    isReply: boolean;
    parentRecordId: string | null;
    rootRecordId: string | null;
    showParentArrow: boolean;
    showRootArrow: boolean;
  } | null;
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
    recordId: string;
    type: string;
    label: string;
    createdAt: string;
    isSelfReply: boolean;
    replyContext?: RawReplyContext | null;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    strength: string | number;
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

type RawAuthorSummary = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

type RawReplyTarget = {
  id: string;
  moodPhrase: string;
  quote: string | null;
  createdAt: string;
  isPublic: boolean;
  publicationStatus: PublicationStatus;
  author: RawAuthorSummary;
};

type RawReplyContext = {
  content: string;
  parentRecordId: string;
  rootRecordId: string;
  parentTarget: RawReplyTarget | null;
  rootTarget: RawReplyTarget | null;
};

type RawRecordDetailResponse = {
  record: {
    id: string;
    user_id: string;
    mood_mode?: "preset" | "other_random" | "custom";
    custom_mood_phrase?: string | null;
    mood_phrase: string;
    description: string | null;
    is_public: boolean;
    visibility_intent: 'private' | 'public';
    publication_status: PublicationStatus;
    publish_requested_at: string | null;
    published_at: string | null;
    risk_summary: Record<string, unknown>;
    review_notes: string | null;
    occurred_at: string | null;
    location_id: string | null;
    source_record_id: string | null;
    source_comment_id: string | null;
    edit_deadline_at: string;
    created_at: string;
    updated_at: string;
  };
  quote: string | null;
  extraEmotions: string[];
  tags: string[];
  author: RawAuthorSummary;
  replyContext: RawReplyContext | null;
};

type RawCreateReplyResponse = {
  comment: {
    id: string;
    content: string;
    parentRecordId: string;
    rootRecordId: string;
    createdAt: string;
  };
  record: RawRecordSummary;
  publishStatus: {
    status: PublicationStatus;
    label: string;
  };
};

function mapAuthorSummary(raw: RawAuthorSummary): AuthorSummary {
  return {
    id: raw.id,
    displayName: raw.displayName,
    avatarUrl: raw.avatarUrl,
  };
}

function mapReplyTarget(raw: RawReplyTarget): ReplyTarget {
  return {
    id: raw.id,
    moodPhrase: raw.moodPhrase,
    quote: raw.quote,
    createdAt: raw.createdAt,
    isPublic: raw.isPublic,
    publicationStatus: raw.publicationStatus,
    author: mapAuthorSummary(raw.author),
  };
}

function mapReplyContext(raw?: RawReplyContext | null): ReplyContext | null {
  if (!raw) {
    return null;
  }

  return {
    content: raw.content,
    parentRecordId: raw.parentRecordId,
    rootRecordId: raw.rootRecordId,
    parentTarget: raw.parentTarget ? mapReplyTarget(raw.parentTarget) : null,
    rootTarget: raw.rootTarget ? mapReplyTarget(raw.rootTarget) : null,
  };
}

function mapRecordSummary(raw: RawRecordSummary): RecordSummary {
  return {
    id: raw.id,
    moodMode: raw.mood_mode,
    customMoodPhrase: raw.custom_mood_phrase,
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
    replyContext: mapReplyContext(raw.replyContext),
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

export const getMoodOptions = () =>
  fetchApi<{
    primary: string[];
    rotating: string[];
    extra: string[];
    custom: {
      enabled: boolean;
      maxChineseChars: number;
      maxEnglishWords: number;
      reviewPipeline: string[];
    };
  }>('/api/records/mood-options');

export const updateRecord = (id: string, data: UpdateRecordRequest) =>
  fetchApi<RawUpdateRecordResponse>(`/api/records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }).then((raw): UpdateRecordResponse => ({
    ok: raw.ok,
    record: mapRecordSummary(raw.record),
    publishStatus: raw.publishStatus,
  }));

export const getRecord = (id: string) =>
  fetchApi<RawRecordDetailResponse>(`/api/records/${id}`).then(
    (raw): RecordDetailResponse => ({
      record: {
        id: raw.record.id,
        userId: raw.record.user_id,
        moodMode: raw.record.mood_mode,
        customMoodPhrase: raw.record.custom_mood_phrase,
        moodPhrase: raw.record.mood_phrase,
        description: raw.record.description,
        isPublic: raw.record.is_public,
        visibilityIntent: raw.record.visibility_intent,
        publicationStatus: raw.record.publication_status,
        publishRequestedAt: raw.record.publish_requested_at,
        publishedAt: raw.record.published_at,
        riskSummary: raw.record.risk_summary,
        reviewNotes: raw.record.review_notes,
        occurredAt: raw.record.occurred_at,
        locationId: raw.record.location_id,
        sourceRecordId: raw.record.source_record_id,
        sourceCommentId: raw.record.source_comment_id,
        editDeadlineAt: raw.record.edit_deadline_at,
        createdAt: raw.record.created_at,
        updatedAt: raw.record.updated_at,
      },
      quote: raw.quote,
      extraEmotions: raw.extraEmotions,
      tags: raw.tags,
      author: mapAuthorSummary(raw.author),
      replyContext: mapReplyContext(raw.replyContext),
    }),
  );

export const createReply = (recordId: string, data: CreateReplyRequest) =>
  fetchApi<RawCreateReplyResponse>(`/api/records/${recordId}/comments`, {
    method: 'POST',
    body: JSON.stringify(data),
  }).then((raw): CreateReplyResponse => ({
    comment: raw.comment,
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
        replyContext: item.replyContext ?? null,
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
        recordId: node.recordId,
        type: node.type,
        label: node.label,
        createdAt: node.createdAt,
        isSelfReply: node.isSelfReply,
        replyContext: mapReplyContext(node.replyContext),
      })),
      edges: raw.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        strength: Number(edge.strength),
      })),
    }),
  );

export const getMindMapRecord = (recordId: string, mode: 'simple' | 'deep' = 'simple') =>
  fetchApi<RawMindMapResponse>(`/api/mindmap/${recordId}?mode=${mode}`).then(
    (raw): MindMapResponse => ({
      nodes: raw.nodes.map((node) => ({
        id: node.id,
        recordId: node.recordId,
        type: node.type,
        label: node.label,
        createdAt: node.createdAt,
        isSelfReply: node.isSelfReply,
        replyContext: mapReplyContext(node.replyContext),
      })),
      edges: raw.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        strength: Number(edge.strength),
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

export const updateOnboardingGuideState = (payload: OnboardingGuideStatePatchRequest) =>
  fetchApi<OnboardingGuideStatePatchResponse>('/api/onboarding/guide-state', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const getNudgeRecommendations = (scene?: NudgeScene) => {
  const params = new URLSearchParams();
  if (scene) {
    params.set('scene', scene);
  }
  const query = params.toString();
  const url = query ? `/api/nudges/recommendations?${query}` : '/api/nudges/recommendations';
  return fetchApi<NudgeRecommendationsResponse>(url);
};

export const submitNudgeFeedback = (payload: NudgeFeedbackRequest) =>
  fetchApi<{ ok: true }>('/api/nudges/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
