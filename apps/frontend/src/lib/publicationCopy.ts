import type { PublicationStatus, RecordModerationMeta } from "../types/api";

export type PublicationTone = "private" | "pending" | "review" | "caution" | "published" | "revise";

export type PublicationStatusMeta = {
  label: string;
  detail: string;
  tone: PublicationTone;
};

const PUBLICATION_STATUS_META: Record<PublicationStatus, PublicationStatusMeta> = {
  private: {
    label: "爱莉的私密珍藏♪",
    detail: "这份心情会作为小秘密留在往世乐土，只属于你和我两个人哦。",
    tone: "private",
  },
  pending_auto: {
    label: "等待爱莉确认中♪",
    detail: "爱莉已经替你收好啦，正在为它挑选最闪耀的去处呢。",
    tone: "pending",
  },
  pending_manual: {
    label: "等待爱莉确认中♪",
    detail: "你的心意已经收到啦，正在等待爱莉为它指明方向哦。",
    tone: "pending",
  },
  pending_second_review: {
    label: "让爱莉再看一眼嘛♪",
    detail: "请再给一点点时间，让爱莉仔细地记录下来吧。",
    tone: "review",
  },
  risk_control_24h: {
    label: "暂且停下脚步吧♪",
    detail: "先在风里休息片刻，等到内心安宁，再继续前行吧。",
    tone: "caution",
  },
  published: {
    label: "已经送进星海♪",
    detail: "这份心意已经化作星光啦，很快就会在星海里亮起独属于它的奇迹呢。",
    tone: "published",
  },
  rejected: {
    label: "少了一点点色彩♪",
    detail: "再为它添上些绚丽的色彩吧，爱莉会在这里等你满载而归。",
    tone: "revise",
  },
  needs_changes: {
    label: "少了一点点色彩♪",
    detail: "再为它修剪一下吧，爱莉会等你把更好的它送来。",
    tone: "revise",
  },
};

const CREATE_SUCCESS_MESSAGES: Record<PublicationStatus, string> = {
  private: "爱莉已经把这个秘密珍藏在心底啦，等你回头再看看它♪",
  pending_auto: "爱莉已经记录下你的期待啦，正在确认它的下一次登场♪",
  pending_manual: "这份心意已经交到爱莉手里啦，接下来就等我为你点亮前行的灯火吧♪",
  pending_second_review: "爱莉正在注视着它哦，马上就有新的消息♪",
  risk_control_24h: "先在风里休息片刻吧，爱莉会陪伴着你到再次启程♪",
  published: "这份心情已经在星海中绽放啦，去看看它唤来了怎样的奇迹吧♪",
  rejected: "被退回来了呢，爱莉期待着下一次邂逅哦♪",
  needs_changes: "再描绘一些细节吧，爱莉会帮你送它再一次登场♪",
};

export function getPublicationStatusMeta(status: PublicationStatus): PublicationStatusMeta {
  return PUBLICATION_STATUS_META[status];
}

export function getCreateSuccessMessage(status: PublicationStatus, moderation?: RecordModerationMeta): string {
  let msg = CREATE_SUCCESS_MESSAGES[status];
  if (moderation) {
    if (moderation.customMood) {
      msg += " (自定义心情需等待审核后公开)";
    } else if (moderation.strictReviewRequired) {
      msg += " (公开内容需要进一步审核)";
    }
    if (moderation.publicSanitizationApplied) {
      msg += " (为了保护你的隐私，公开版本已自动处理敏感信息)";
    }
  }
  return msg;
}
