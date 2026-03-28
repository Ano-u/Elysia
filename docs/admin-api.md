# Admin API（审核 / 风控 / 封禁 / 申诉 / 准入 / AI 审核）

本文档对应 `/api/admin/*` 接口，面向管理员后台联调。

## 1. 鉴权与权限

- 全部接口要求管理员身份（`role=admin`）。
- 非管理员返回：

```json
{
  "message": "仅管理员可访问"
}
```

## 2. 审核队列

### 2.1 查询队列

- `GET /api/admin/moderation/queue`
- query:
  - `queueType`: `moderation|second_review|risk_control|access_application|appeal|media_review`（可选）
  - `queueStatus`: `open|claimed|resolved`（默认 `open`）
  - `limit`: `1..200`（默认 `100`）

响应示例：

```json
{
  "items": [
    {
      "id": "77dad906-2198-4ef6-a104-c94583ff96a9",
      "target_type": "record",
      "target_id": "8f02a4e6-c7e1-4b95-b2e3-b4ea2ec4f645",
      "target_revision_no": 3,
      "priority": 2,
      "queue_type": "second_review",
      "queue_status": "open",
      "assigned_to": null,
      "reason": "高风险公开申请进入二次审查",
      "payload": {
        "riskLevel": "high"
      },
      "sla_due_at": "2026-03-19T10:00:00.000Z",
      "created_at": "2026-03-18T10:00:00.000Z",
      "updated_at": "2026-03-18T10:00:00.000Z"
    }
  ]
}
```

### 2.2 文本审核决策

- `POST /api/admin/moderation/records/:id/decision`
- body:

```json
{
  "decision": "approve",
  "note": "文本审核通过"
}
```

`decision` 枚举：`approve|reject|needs_changes|second_review|risk_control`

状态机影响：

- `approve`：公开记录 -> `published`，私密记录 -> `private`
- `reject`：`rejected`
- `needs_changes`：`needs_changes`
- `second_review`：`pending_second_review`
- `risk_control`：`risk_control_24h` + 24h 风控事件

### 2.3 图片审核决策

- `POST /api/admin/moderation/media/:id/decision`
- body:

```json
{
  "decision": "approve",
  "note": "图片通过人工审核"
}
```

`decision`：`approve|reject`

效果：

- `approve`：媒体标记 `approved`；若关联记录是 `pending_manual` 且全部图片通过，则推进为 `published/private`
- `reject`：媒体标记 `rejected`，关联记录进入 `needs_changes`

## 3. 准入申请池

### 3.1 列表

- `GET /api/admin/access/applications`
- query:
  - `status`: `pending|approved|rejected`（默认 `pending`）
  - `limit`: `1..200`（默认 `100`）

### 3.2 通过

- `POST /api/admin/access/applications/:id/approve`
- body（可选）：

```json
{
  "note": "欢迎加入"
}
```

效果：

- `access_applications.status=approved`
- `users.access_status=approved`
- 审核队列对应项置 `resolved`
- 写通知与审计日志

### 3.3 驳回

- `POST /api/admin/access/applications/:id/reject`

```json
{
  "note": "建议补充你想长期创作的主题。"
}
```

效果：

- `access_applications.status=rejected`
- `users.access_status=rejected`
- 审核队列对应项置 `resolved`
- 写通知与审计日志

## 4. 风控队列

### 4.1 列表

- `GET /api/admin/risk-control/events`
- query:
  - `status`: `active|released|warned|banned`（默认 `active`）
  - `limit`: `1..200`（默认 `100`）

### 4.2 处置

- `POST /api/admin/risk-control/events/:id/action`
- body:

```json
{
  "action": "ban_permanent",
  "note": "人工确认严重违规",
  "ipHash": "<optional>"
}
```

`action`：`release|warn|ban_temp|ban_permanent`

效果：

- `release|warn`：结束用户风控冷却
- `ban_temp|ban_permanent`：写入 `ban_events`，同步用户/IP 封禁

## 5. 封禁中心

### 5.1 列表

- `GET /api/admin/bans`
- query:
  - `status`: `active|lifted`（可选）
  - `limit`: `1..200`（默认 `100`）

### 5.2 解封

- `POST /api/admin/bans/:id/lift`

```json
{
  "reason": "申诉通过，解除限制",
  "liftUser": true,
  "liftIp": true
}
```

## 6. 申诉中心

### 6.1 列表

- `GET /api/admin/appeals`
- query:
  - `status`: `pending|approved|rejected`（默认 `pending`）
  - `limit`: `1..200`（默认 `100`）

### 6.2 通过申诉

- `POST /api/admin/appeals/:id/approve`

```json
{
  "resolutionNote": "确认误判，已解除封禁",
  "liftUser": true,
  "liftIp": true
}
```

### 6.3 驳回申诉

- `POST /api/admin/appeals/:id/reject`

```json
{
  "resolutionNote": "证据充分，维持封禁"
}
```

## 7. AI 审核助手

### 7.1 配置读取

- `GET /api/admin/ai-review/config`
- 返回 `apiKeyMasked`，不回传明文 Key。

### 7.2 配置更新

- `PUT /api/admin/ai-review/config`

```json
{
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-xxxx",
  "endpointType": "responses",
  "model": "gpt-5.4-mini",
  "isEnabled": true
}
```

约束：

- `baseUrl` 必须 `https`
- 禁止内网地址/localhost
- 密钥服务端加密存储（前端仅见掩码）

### 7.3 扫描最近 1 小时公开文本申请

- `POST /api/admin/ai-review/scan-recent`

后端流程：

1. 收集 `visibility_intent='public'` 且 `publication_status in ('pending_auto','pending_manual')` 且“无图片”的记录。
2. 组 CSV 字段：`record_id,user_id,username,mood_phrase,quote,description,tags,created_at`。
3. 使用配置的 `baseUrl + apiKey + endpointType + model` 调用。
4. 写入 `ai_review_runs / ai_review_decisions`。
5. 回写记录状态：
   - `very_low/low` -> `published`
   - `medium/elevated` -> `pending_manual`
   - `high` -> `pending_second_review`
   - `very_high` -> `risk_control_24h` 并触发 24h 风控

响应示例：

```json
{
  "ok": true,
  "runId": "c280762f-d920-4bb7-b0cb-f9815ab93daf",
  "matched": 42,
  "parsed": 40,
  "applied": 40,
  "published": 18,
  "pendingManual": 12,
  "secondReview": 7,
  "riskControl": 3
}
```

## 8. 错误码（管理员域）

- `INVALID_AI_BASE_URL`（400）
- `AI_REVIEW_NOT_CONFIGURED`（409）
- `AI_REVIEW_CONFIG_INVALID`（400）
- `AI_REVIEW_UPSTREAM_FAILED`（502）
- `ACCESS_APPLICATION_NOT_FOUND`（404）
- `ACCESS_APPLICATION_NOT_PENDING`（409）
- `RISK_EVENT_NOT_FOUND`（404）
- `RISK_EVENT_NOT_ACTIVE`（409）
- `BAN_NOT_FOUND`（404）
- `APPEAL_NOT_FOUND`（404）
- `APPEAL_NOT_PENDING`（409）

## 9. 审计要求

以下操作都会写审计日志，便于追溯：

- 文本审核决策
- 图片审核决策
- 准入审核通过/驳回
- 风控处置
- 解封
- 申诉通过/驳回
- AI 审核配置更新与扫描触发
