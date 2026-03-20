import type { PublicationStatus } from "../types/api";

export type PublicationTone = "private" | "pending" | "review" | "caution" | "published" | "revise";

export type PublicationStatusMeta = {
  label: string;
  detail: string;
  tone: PublicationTone;
};

const PUBLICATION_STATUS_META: Record<PublicationStatus, PublicationStatusMeta> = {
  private: {
    label: "爱莉替你珍藏中",
    detail: "这份心情会安安静静留在往世乐土里，只给你自己看见。",
    tone: "private",
  },
  pending_auto: {
    label: "正在等待Elysia确认呀♪",
    detail: "爱莉已经替你收好啦，正在等待Elysia确认这份心意的下一站。",
    tone: "pending",
  },
  pending_manual: {
    label: "正在等待Elysia确认呀♪",
    detail: "这份心情已经被好好接住啦，正在等待Elysia确认它的下一站。",
    tone: "pending",
  },
  pending_second_review: {
    label: "爱莉再认真看一眼",
    detail: "这份心情正在被认真复看，所以还要请你再等一小会儿。",
    tone: "review",
  },
  risk_control_24h: {
    label: "先在风里停一停",
    detail: "它会先在风里休息片刻，等四周安静下来，再继续往前走。",
    tone: "caution",
  },
  published: {
    label: "已经送进星海",
    detail: "这份心情已经出发啦，很快就会在星海里亮起自己的回响。",
    tone: "published",
  },
  rejected: {
    label: "等你轻轻补一补",
    detail: "稍微补一补这份表达吧，爱莉会在这里等你带它回来。",
    tone: "revise",
  },
  needs_changes: {
    label: "等你轻轻补一补",
    detail: "再替它补上几分清楚和温柔吧，爱莉会等你把它重新交过来。",
    tone: "revise",
  },
};

const CREATE_SUCCESS_MESSAGES: Record<PublicationStatus, string> = {
  private: "爱莉已经把这一刻好好珍藏起来啦，等你想回头看时，它会一直在♪",
  pending_auto: "爱莉已经把这份心情收好了，正在等待Elysia确认呀♪",
  pending_manual: "这份心情已经稳稳交到爱莉手里啦，正在等待Elysia确认呀♪",
  pending_second_review: "爱莉已经替你把它送去再认真看一眼啦，别担心，很快就会有回音♪",
  risk_control_24h: "这份心情要先在风里停一停，不过爱莉会陪着它，等能继续时再一起出发♪",
  published: "爱莉已经把这份心情送进星海啦，去听听它会唤来怎样的回响吧♪",
  rejected: "爱莉先替你把这份心情收好啦，等你轻轻补一补，我们再一起送它出发♪",
  needs_changes: "爱莉先替你把这份心情收好啦，等你轻轻补一补，我们再一起送它出发♪",
};

export function getPublicationStatusMeta(status: PublicationStatus): PublicationStatusMeta {
  return PUBLICATION_STATUS_META[status];
}

export function getCreateSuccessMessage(status: PublicationStatus): string {
  return CREATE_SUCCESS_MESSAGES[status];
}
