# Elysia 前端联调契约（用户侧）

本文档覆盖用户侧联调必需接口、状态机、错误码与示例。

## 1. 认证与基础

- 开发切换用户：`POST /api/auth/dev/switch-user`
- 当前登录态：`GET /api/auth/me`
- 登出：`POST /api/auth/logout`
- 公共配置：`GET /api/public/config`
- OIDC：
  - `GET /api/auth/oidc/login`
  - `GET /api/auth/oidc/callback`

本地联调门禁开关：

- 环境变量 `ACCESS_GATE_BYPASS`：
  - `true`：本地直接跳过“加入申请”门禁
  - `false`：严格执行门禁
  - `auto`（默认）：`NODE_ENV=development` 时跳过，其他环境不跳过

## 2. 首次准入申请（加入申请小作文）

- 查询状态：`GET /api/access/application/status`
- 提交申请：`POST /api/access/application`

### 2.1 提交请求示例

```json
{
  "essay": "我希望在这里记录情绪变化与思考，也愿意遵守社区规则。"
}
```

### 2.2 查询响应示例

```json
{
  "accessStatus": "pending",
  "canSubmit": false,
  "application": {
    "id": "f7f6a32a-07a1-4e9f-bfd4-238fc01d7692",
    "status": "pending",
    "essay": "我希望在这里记录情绪变化与思考，也愿意遵守社区规则。",
    "reviewNote": null,
    "submittedAt": "2026-03-18T12:00:00.000Z",
    "reviewedAt": null
  }
}
```

### 2.3 状态机

- `not_submitted -> pending -> approved | rejected`
- `pending` 下重复提交返回 `409 + ACCESS_APPLICATION_PENDING`
- `approved` 下重复提交返回 `409 + ACCESS_ALREADY_APPROVED`

### 2.4 门禁规则

- `pending/rejected/not_submitted`：禁止发布、评论、互动（管理员不受限）
- 典型错误：

```json
{
  "message": "加入申请尚未通过，暂不可执行该操作",
  "code": "ACCESS_GATE_BLOCKED",
  "accessStatus": "pending"
}
```

## 2.5 新人引导与温柔提示

- 查询引导与 7 天进度：`GET /api/onboarding/progress?entryId=...`
- 完成某一天任务：`POST /api/onboarding/complete-day`
- 记录首访导览状态：`PATCH /api/onboarding/guide-state`
- 查询场景化轻提示：`GET /api/nudges/recommendations?scene=...`
- 更新提示设置：`PATCH /api/nudges/settings`
- 提交提示反馈：`POST /api/nudges/feedback`

行为规则：

- 只要用户还没有发送过任何内容，进入 Home 时就应该请求一次 `GET /api/onboarding/progress?entryId=...`。
- 首次进入且尚未发送内容：
  - `guide.display.shouldShow=true`
  - `guide.display.forceBlocking=true`
  - `guide.display.allowSkip=false`
- 第二次及之后进入、但仍未发送内容：
  - 仍然 `shouldShow=true`
  - 但 `allowSkip=true`
- 只要还没发送过内容，即使用户上次点过跳过，本次进入仍然会再次提示。
- 用户一旦成功发送过任意内容，生产环境下引导将自动收起。
- 本地联调可通过环境变量 `ONBOARDING_FORCE_SHOW=auto|true|false` 控制：
  - `auto`：`NODE_ENV=development` 时每次进入都显示，但允许跳过
  - `true`：总是显示且允许跳过
  - `false`：严格按“是否发送过内容 + 进入次数”判断

### 2.5.1 `GET /api/onboarding/progress` 响应示例

```json
{
  "progress": {
    "current_day": 1,
    "completed_days": [],
    "last_completed_at": null,
    "metadata": {
      "guide": {
        "completedAt": null,
        "skippedAt": null,
        "lastSeenStep": 0,
        "version": "home-guide-v3",
        "entryCount": 1,
        "lastPresentedAt": "2026-03-28T08:00:00.000Z",
        "lastEntryId": "home-entry-1"
      }
    }
  },
  "guide": {
    "version": "home-guide-v3",
    "welcomeTitle": "让爱莉陪你把第一张卡片写完吧",
    "welcomeDescription": "第一次来到这里时，不用急着一下子懂完所有事。先照着引导完成欢迎卡片，再认识往世乐土与星海，就足够顺利地开始了。",
    "welcomePrimaryAction": "跟着爱莉完成一遍",
    "welcomeSecondaryAction": "这次先跳过",
    "steps": [
      {
        "id": "compose-welcome-card",
        "title": "先跟着爱莉完成一张欢迎卡片",
        "description": "这次会一步一步带你选心情、填标题、写誓言，再展开描述。只要照着系统给出的内容完成，就已经很好了。",
        "target": "home.composer",
        "ctaText": "开始填写"
      }
    ],
    "safetyCard": {
      "title": "开始前，记住这几件事就好",
      "bullets": [
        "只要还没有真正发送过内容，每次进入都会再次提示这份引导。",
        "第一次进入且尚未发送内容时，这个入口引导不能跳过。",
        "按系统模板完成欢迎卡片时，会走轻量通过路径，公开后可直接看到“已发送到星海”。"
      ],
      "confirmText": "我知道啦"
    },
    "display": {
      "shouldShow": true,
      "allowSkip": false,
      "forceBlocking": true,
      "reason": "first_entry_without_content",
      "localDebugForceShow": false,
      "showEveryEntryUntilFirstContent": true
    },
    "draftTemplate": {
      "visibilityIntent": "public",
      "expectedPublishStatus": "published",
      "approvalHint": "欢迎卡片按系统给出的内容完成时，会走轻量自动通过路径。",
      "moodExercise": {
        "target": "composer.mood-strip",
        "maxSelections": 2,
        "presetOnly": true,
        "sequence": [
          {
            "id": "pick-one-mood",
            "instruction": "先任选一个已有的心情。",
            "requiredSelectedCount": 1,
            "allowCancel": false
          },
          {
            "id": "clear-mood",
            "instruction": "再取消刚刚的选择，感受一下它是可以撤回的。",
            "requiredSelectedCount": 0,
            "allowCancel": true
          },
          {
            "id": "pick-two-moods",
            "instruction": "最后从已有心情里选满两个，完成这一步。",
            "requiredSelectedCount": 2,
            "allowCancel": true
          }
        ]
      },
      "fields": [
        {
          "key": "moodPhrase",
          "label": "标题",
          "value": "Hello Elysia！",
          "target": "composer.title",
          "helperText": "请直接按这个标题填写。"
        },
        {
          "key": "quote",
          "label": "誓言",
          "value": "欢迎来到往世乐土！",
          "target": "composer.quote",
          "helperText": "请直接按这个誓言填写。"
        },
        {
          "key": "description",
          "label": "描述",
          "value": "嗨，既然你来了，就把第一缕心情放心交给我吧，往后的回声，我会陪你一起听。",
          "target": "composer.description",
          "helperText": "先展开描述，再把系统提供的欢迎语填写进去。"
        }
      ]
    },
    "featureTour": [
      {
        "id": "home-bottom-elysian-realm",
        "title": "主界面下方的往世乐土",
        "description": "这里会留着你的记录与脉络入口，方便你继续回看和延展。",
        "target": "home.bottom.elysian-realm",
        "interaction": "observe"
      },
      {
        "id": "nav-universe-entry",
        "title": "从左上角前往星海",
        "description": "左上角的入口要能把用户带去星海视图。",
        "target": "nav.universe",
        "interaction": "tap"
      }
    ],
    "statusGlossary": [
      {
        "status": "published",
        "label": "已发送到星海",
        "description": "公开内容已经进入星海，可以被他人看见。"
      },
      {
        "status": "pending_manual",
        "label": "等待温柔审核",
        "description": "内容正在排队审核，结果会很快回来。"
      },
      {
        "status": "private",
        "label": "只留给自己",
        "description": "这条记录只会留在你的往世乐土里，不会进入星海。"
      }
    ],
    "contentState": {
      "hasSentAnyContent": false,
      "sentContentCount": 0
    },
    "state": {
      "completedAt": null,
      "skippedAt": null,
      "lastSeenStep": 0,
      "version": "home-guide-v3",
      "canReplay": true,
      "entryCount": 1,
      "lastPresentedAt": "2026-03-28T08:00:00.000Z",
      "lastEntryId": "home-entry-1"
    }
  },
  "tasks": [
    {
      "day": 1,
      "title": "写下一句心情",
      "code": "first_post",
      "description": "先留下今天最想说的一句，让这里开始记住你的节奏。",
      "ctaText": "现在去写",
      "ctaTarget": "home.composer",
      "rewardText": "完成第一步后，你会更快看懂后面的提示。"
    }
  ],
  "targetTimeSeconds": 60,
  "entryContext": {
    "needsAccessApplication": true,
    "accessStatus": "not_submitted",
    "estimatedReviewText": "通常会在 1-3 天内完成审核。",
    "applicationHint": "在正式开放更多互动前，会先通过一段简短申请确认你的使用意图与安全边界。"
  },
  "restartSuggestion": {
    "shouldShow": false,
    "headline": null,
    "body": null
  },
  "contentState": {
    "hasSentAnyContent": false,
    "sentContentCount": 0
  }
}
```

### 2.5.2 `PATCH /api/onboarding/guide-state` 请求示例

```json
{
  "completedAt": "2026-03-27T09:00:00.000Z",
  "lastSeenStep": 2,
  "version": "home-guide-v3"
}
```

补充约定：

- 若当前响应里 `guide.display.forceBlocking=true`，前端不应展示跳过按钮。
- 此时如果仍调用 `PATCH /api/onboarding/guide-state` 并传 `skippedAt`，服务端会返回 `409 + ONBOARDING_SKIP_DISABLED`。
- `entryId` 应由前端在每次真正“进入 Home 页面”时生成一次，并在该次页面生命周期内复用，避免一次进入重复累计 `entryCount`。

### 2.5.3 `GET /api/nudges/recommendations` 说明

支持场景：

- `home_idle`
- `first_publish_error`
- `first_publish_success`
- `guide_complete`
- `mindmap_locked`

响应示例：

```json
{
  "scene": "home_idle",
  "items": [
    {
      "id": "home_idle_1",
      "text": "慢慢来，先写下一句也很好。若还没想清楚，就把最先浮出来的那个词留下吧。",
      "actionLabel": "我来试试",
      "actionTarget": "home.composer"
    }
  ]
}
```

说明：

- `actionTarget` 为前端内部跳转/聚焦标识，不是绝对 URL。
- 若达到当日提示上限或已关闭提示，返回 `{ "scene": "...", "items": [] }`。


相关接口：

- 心情 tag 配置：`GET /api/records/mood-options`
- 创建记录：`POST /api/records`
- 编辑记录：`PATCH /api/records/:id`
- 切换公开：`PATCH /api/records/:id/visibility`
- 查询发布状态：`GET /api/records/:id/publish-status`
- 查询记录详情：`GET /api/records/:id`

### 3.0 心情 tag 配置

`GET /api/records/mood-options`

响应示例：

```json
{
  "primary": ["平静", "温柔", "希望", "想念", "释然", "迷茫", "疲惫", "开心"],
  "rotating": ["雀跃", "安心", "委屈", "笃定", "空茫", "轻盈"],
  "extra": ["被理解", "想拥抱", "想休息"],
  "homepageDisplay": ["希望", "轻盈", "平静", "想休息", "笃定", "开心", "被理解", "悬着", "温柔", "空茫", "委屈", "释然", "想再试试", "低落"],
  "custom": {
    "enabled": true,
    "maxChineseChars": 5,
    "maxEnglishWords": 2,
    "reviewPipeline": ["rules", "lexicon", "ai", "admin"]
  }
}
```

说明：

- `primary`：高频心情 tag，主界面优先固定展示。
- `rotating`：低频预设 tag，接口每次请求都会给出一组新的随机结果；前端应作为“其他情绪”备选池展示，而不是点击后即时随机生成一个词。
- `homepageDisplay`：主页创建态/编辑态专用的随机展示列表；每次进入主页请求都会返回一组新的 14 个预设 tag，其中默认 4 个为高频 tag，前端应直接展示这组结果，并把 `custom` 追加在最后。
- `custom`：自定义情绪规则；点击后应展开输入框，前端做即时校验。

补充约定：

- `moodPhrase` 始终表示标题，不承载情绪 tag。
- `extraEmotions` 才是用户实际选中的情绪 tag，最多 2 个，可为 0 个。
- 若选择了自定义情绪：
  - `customMoodPhrase` 传自定义文本
  - 该文本也必须出现在 `extraEmotions` 中
- `moodMode` 仅用于前端编辑态回填和 UI 来源标记，不可再拿它去覆盖标题。

### 3.1 状态定义

- `private`：仅自己可见
- `pending_manual`：待人工审核
- `pending_second_review`：二次审查
- `risk_control_24h`：风控 24h
- `published`：已公开
- `rejected`：驳回
- `needs_changes`：驳回待修改

### 3.2 自动路由规则

公开内容（`visibilityIntent=public`）：

- `very_low/low` -> `published`
- `medium/elevated` -> `pending_manual`
- `high`（纯文本）-> `pending_second_review`
- `very_high` -> `risk_control_24h`
- 含图片公开申请：统一 `pending_manual`（人工图片审核队列）
- 命中网址/广告/引流风险：进入 `pending_manual`
- 存在自定义情绪（`customMoodPhrase` 非空，或 `extraEmotions` 中含非预设情绪）时：无论公开或私密，都会进入更严格审核链路（规则/词库/AI/管理员）

私密内容（`visibilityIntent=private`）：

- 默认 `private`
- 命中高危底线（含极高风险）-> `risk_control_24h`
- 私密图片：进入 `media_review` 人工审核，但本人仍可见记录
- 存在自定义情绪时：进入 `pending_manual`，等待更严格审核

### 3.3 状态查询响应示例

```json
{
  "recordId": "2f6d3e97-c7f4-4f17-aee8-3f0e5bfb7001",
  "visibilityIntent": "public",
  "status": "pending_manual",
  "label": "待审核",
  "isPublic": false,
  "publishRequestedAt": "2026-03-18T12:10:00.000Z",
  "publishedAt": null,
  "reviewNotes": null,
  "riskSummary": {
    "level": "elevated",
    "reason": "中风险内容进入人工审核"
  }
}
```

### 3.4 Markdown 支持

- `moodPhrase / quote / description / comment content` 支持 Markdown 基础语法（含 GFM 列表、表格、删除线等）。
- 前端渲染默认禁用原始 HTML（`skipHtml`），防止注入风险。

### 3.5 记录详情补充字段

`GET /api/records/:id` 在原有 `record + quote + extraEmotions + tags` 基础上，新增：

- `author`: `{ id, displayName, avatarUrl }`
- `replyContext`: `null | { content, parentRecordId, rootRecordId, parentTarget, rootTarget }`
- `record.mood_mode`: `preset | other_random | custom`
- `record.custom_mood_phrase`: `string | null`
- `record.location_summary`: `null | { country, region, city, label, precision }`

说明：

- 普通卡片 `replyContext = null`
- 回复卡片会返回自己的回复正文，以及可跳转的父卡片 / 主帖摘要
- 前端编辑态回填时：
  - 标题使用 `record.mood_phrase`
  - 已选情绪使用 `extraEmotions`
  - 自定义输入框状态使用 `record.custom_mood_phrase`
- `parentTarget / rootTarget` 仅在当前用户有权限读取时返回，否则为 `null`
- 对非本人查看公开内容时：
  - `description / quote` 中的链接、联系方式、疑似地址、时间会被模糊处理
  - `occurred_at` 只保留到月份（`YYYY-MM`）
  - `location_id = null`，仅通过 `location_summary` 暴露到城市级别

## 4. 风控限制

- 风控中返回 `403 + RISK_CONTROL_ACTIVE`
- 风控期间限制公开申请与高频互动

```json
{
  "message": "当前处于风控冷却期，请稍后再试",
  "code": "RISK_CONTROL_ACTIVE",
  "riskControlUntil": "2026-03-18T12:00:00.000Z",
  "reason": "命中高危规则"
}
```

## 5. 评论与互动

- 发表评论（创建回复卡片）：`POST /api/records/:id/comments`
- 添加互动：`POST /api/reactions`
- 取消互动：`DELETE /api/reactions/:id`
- 互动汇总：`GET /api/records/:id/reactions-summary`

约束：

- 评论与互动仅允许目标记录为 `published` 且公开
- `:id` 始终表示“直接被回复的卡片”；服务端自动计算 `parentRecordId` 与 `rootRecordId`
- 回复卡片默认公开，但可传 `isPublic=false` 存成私密记录
- 公开回复与普通公开记录走同一套审核/风控链路；私密回复不进入 Universe
- 评论/互动同样受准入门禁限制；公开回复额外受风控限制

### 5.1 创建回复卡片请求示例

```json
{
  "content": "你的这句让我想起前几天的自己。",
  "moodPhrase": "也想把这一刻轻轻接住",
  "moodMode": "custom",
  "customMoodPhrase": "被理解",
  "quote": "愿我们都能被温柔回应",
  "description": "看到这张卡片时，我突然觉得自己也没有那么孤单了。",
  "extraEmotions": ["平静", "被理解"],
  "isPublic": true
}
```

说明：

- `content`：回复正文，独立于卡片标题
- `moodPhrase`：回复卡片标题
- `extraEmotions`：回复卡片的“心情 tag”，最多 2 个
- `customMoodPhrase`：若选择自定义情绪，则必须同时传这个字段，并把该值包含在 `extraEmotions` 中
- 本期不支持回复专用 `tags`

### 5.2 创建回复卡片响应示例（服务端原始响应）

```json
{
  "comment": {
    "id": "3c1f8d41-e08d-4cb1-bc11-3c8b82fd1c51",
    "content": "你的这句让我想起前几天的自己。",
    "parentRecordId": "4fcb8f3b-1c28-4694-b28a-c4ef8f663999",
    "rootRecordId": "4fcb8f3b-1c28-4694-b28a-c4ef8f663999",
    "createdAt": "2026-03-24T08:10:00.000Z"
  },
  "record": {
    "id": "0f93b7a7-95ad-412f-99f6-d3d6b3b1b9cb",
    "mood_phrase": "也想把这一刻轻轻接住",
    "description": "看到这张卡片时，我突然觉得自己也没有那么孤单了。",
    "visibility_intent": "public",
    "publication_status": "published",
    "is_public": true,
    "created_at": "2026-03-24T08:10:00.000Z",
    "updated_at": "2026-03-24T08:10:00.000Z",
    "replyContext": {
      "content": "你的这句让我想起前几天的自己。",
      "parentRecordId": "4fcb8f3b-1c28-4694-b28a-c4ef8f663999",
      "rootRecordId": "4fcb8f3b-1c28-4694-b28a-c4ef8f663999",
      "parentTarget": null,
      "rootTarget": null
    }
  },
  "publishStatus": {
    "status": "published",
    "label": "已公开"
  }
}
```

说明：

- 服务端原始 `record` 使用 snake_case 字段。
- 若前端通过 `apps/frontend/src/lib/apiClient.ts` 调用，会被映射成 `RecordSummary` 的 camelCase 结构再消费。

## 6. Universe 与 MindMap 可见性边界

- Universe 仅返回 `published` 的公开记录：
  - `GET /api/universe/viewport`
  - `GET /api/universe/focus`
  - `GET /api/universe/hot`
  - `GET /api/universe/recent`

Universe 返回的每条记录会额外带：

- `replyContext: null | { isReply, parentRecordId, rootRecordId, showParentArrow, showRootArrow }`

说明：

- 普通卡片 `replyContext = null`
- 回复卡片会在星海里稳定聚集到父卡片附近
- 本期不返回“主帖下所有回复内容”，也不在主帖详情里反查子回复

- MindMap：
  - 我的图谱：`GET /api/mindmap/me?mode=simple|deep`
  - 单记录图谱：`GET /api/mindmap/:recordId`
  - 手动连边：`POST /api/mindmap/manual-link`

## 7. 媒体与私密图片审核状态

- 上传签名：`POST /api/media/upload-sign`
- 上传完成：`POST /api/media/complete`
- 查询变体：`GET /api/media/:id/variants`
- 保存绘图：`POST /api/drawings`

`GET /api/media/:id/variants` 返回中：

- `moderation.status`: `pending_auto|pending_manual|approved|rejected`
- `moderation.manualReviewRequired`: `boolean`
- `moderation.reviewNotes`: `string|null`

私密图片原则：

- 本人可查看原图与状态标识
- 不进入 Universe，不对他人可见

## 8. 申诉（封禁事件单次申诉）

- 查询我的封禁/申诉状态：`GET /api/appeals/status`
- 提交申诉：`POST /api/appeals`

请求示例：

```json
{
  "banEventId": "2f6d3e97-c7f4-4f17-aee8-3f0e5bfb7001",
  "appealText": "请管理员复核，我愿意修改并遵守规则。"
}
```

错误码：

- `APPEAL_PENDING`：已有 pending 申诉，不可重复提交
- `APPEAL_USED`：该封禁事件已使用过申诉机会
- `BAN_EVENT_NOT_ACTIVE`：封禁事件已结束

## 9. 自动串联同意设置（默认关闭）

- 查询：`GET /api/me/auto-linking`
- 更新：`PATCH /api/me/auto-linking`

查询响应示例：

```json
{
  "enabled": false,
  "scope": "private_only",
  "mode": "suggestion",
  "consentedAt": null
}
```

更新请求示例：

```json
{
  "enabled": true,
  "scope": "public_recommendation",
  "mode": "suggestion"
}
```

约束：

- 默认 `enabled=false`
- 仅在用户同意后启用
- `mode` 固定 `suggestion`（不自动改写正文）

## 10. 统一错误码清单（前端需处理）

- `ACCESS_GATE_BLOCKED`
- `RISK_CONTROL_ACTIVE`
- `ACCESS_APPLICATION_PENDING`
- `ACCESS_ALREADY_APPROVED`
- `APPEAL_PENDING`
- `APPEAL_USED`
- `BAN_EVENT_NOT_ACTIVE`

## 11. Swagger / OpenAPI

- Swagger UI：`/docs`
- OpenAPI 文件：`docs/openapi.yaml`
- 新增审核/风控/申诉/准入/自动串联路由均已同步。
