import { fetchApi } from './api';
import type {
  AccessApplicationStatusResponse,
  AppealsStatusResponse,
  AutoLinkingPatchRequest,
  AutoLinkingPatchResponse,
  AutoLinkingPreference,
  CreateRecordRequest,
  MindMapResponse,
  RecordResponse,
  UniverseResponse
} from '../types/api';

// --- Auth ---
export const switchUser = (userId: string) =>
  fetchApi(`/api/auth/dev/switch-user`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });

// --- Records ---
export const createRecord = (data: CreateRecordRequest) =>
  fetchApi<RecordResponse>('/api/records', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getRecordPublishStatus = (id: string) =>
  fetchApi(`/api/records/${id}/publish-status`);

// --- Universe ---
export const getUniverseViewport = (x: number, y: number, w: number, h: number) =>
  fetchApi<UniverseResponse>(`/api/universe/viewport?x=${x}&y=${y}&w=${w}&h=${h}`);

export const getUniverseFocus = () =>
  fetchApi<UniverseResponse>('/api/universe/focus');

// --- MindMap ---
export const getMindMapMe = (mode: 'simple' | 'deep' = 'simple') =>
  fetchApi<MindMapResponse>(`/api/mindmap/me?mode=${mode}`);

export const createManualLink = (sourceId: string, targetId: string) =>
  fetchApi('/api/mindmap/manual-link', {
    method: 'POST',
    body: JSON.stringify({ sourceId, targetId }),
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
  fetchApi<AppealsStatusResponse>('/api/appeals/status');

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
  fetchApi('/api/onboarding/progress');

export const completeOnboardingDay = (day: number) =>
  fetchApi('/api/onboarding/complete-day', {
    method: 'POST',
    body: JSON.stringify({ day }),
  });
