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

## 3. 发布与审核状态机（先审后发）

相关接口：

- 创建记录：`POST /api/records`
- 编辑记录：`PATCH /api/records/:id`
- 切换公开：`PATCH /api/records/:id/visibility`
- 查询发布状态：`GET /api/records/:id/publish-status`
- 查询记录详情：`GET /api/records/:id`

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

私密内容（`visibilityIntent=private`）：

- 默认 `private`
- 命中高危底线（含极高风险）-> `risk_control_24h`
- 私密图片：进入 `media_review` 人工审核，但本人仍可见记录

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

说明：

- 普通卡片 `replyContext = null`
- 回复卡片会返回自己的回复正文，以及可跳转的父卡片 / 主帖摘要
- `parentTarget / rootTarget` 仅在当前用户有权限读取时返回，否则为 `null`

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
  "quote": "愿我们都能被温柔回应",
  "description": "看到这张卡片时，我突然觉得自己也没有那么孤单了。",
  "extraEmotions": ["平静", "被理解"],
  "isPublic": true
}
```

说明：

- `content`：回复正文，独立于卡片标题
- `moodPhrase`：回复卡片标题
- `extraEmotions`：回复卡片的“心情 tag”
- 本期不支持回复专用 `tags`

### 5.2 创建回复卡片响应示例

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
    "user_id": "4b30e94b-bb4b-4d62-88bb-dad14a6fb3b1",
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
