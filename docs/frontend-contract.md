# Elysia 前端联调契约（后端已实现）

## 1. 本地登录

- `POST /api/auth/dev/switch-user`
- 请求体：

```json
{
  "username": "demo_user",
  "displayName": "演示用户",
  "avatarUrl": "https://example.com/avatar.png",
  "role": "admin"
}
```

## 2. Home 核心链路

- 发布一句话：`POST /api/records`
- 查询个人流：`GET /api/home/feed?limit=20`
- 编辑记录：`PATCH /api/records/:id`
- 切换公开：`PATCH /api/records/:id/visibility`

## 3. 评论派生

- `POST /api/records/:id/comments`
- 返回包含 `derivedRecordId`，前端应将其视为“我的新记录”。

## 4. Universe

- 视口：`GET /api/universe/viewport?x=0&y=0&w=30&h=20&limit=30`
- 焦点：`GET /api/universe/focus`
- 热门：`GET /api/universe/hot`
- 最新：`GET /api/universe/recent`

## 5. MindMap

- 我的图谱：`GET /api/mindmap/me?mode=simple|deep`
- 单记录图谱：`GET /api/mindmap/:recordId`
- 手动连边：`POST /api/mindmap/manual-link`

## 6. 媒体与画布

- 上传签名：`POST /api/media/upload-sign`
- 上传完成确认：`POST /api/media/complete`
- 查询变体：`GET /api/media/:id/variants`
- 保存矢量绘图：`POST /api/drawings`

## 6.1 时间地点

- 创建地点：`POST /api/locations`
- 搜索地点：`GET /api/locations/search?keyword=...`

## 7. 互动与实时

- 新增互动：`POST /api/reactions`
- 删除互动：`DELETE /api/reactions/:id`
- 汇总：`GET /api/records/:id/reactions-summary`
- WebSocket：`/api/ws`

## 8. 引导、洞察、草稿

- 引导建议：`GET /api/nudges/recommendations`
- 引导偏好：`PATCH /api/nudges/settings`
- 7天激活进度：
  - `GET /api/onboarding/progress`
  - `POST /api/onboarding/complete-day`
- 洞察接口：
  - `GET /api/insights/emotion-trajectory`
  - `GET /api/insights/theme-evolution`
  - `GET /api/insights/resonance-network`
- AI 辅助（不生成正文）：
  - `GET /api/ai/templates`
  - `POST /api/ai/tag-suggestions/save`
  - `POST /api/ai/weekly-report/save`
- 草稿：
  - `GET /api/drafts`
  - `POST /api/drafts`
  - `PATCH /api/drafts/:id`
  - `DELETE /api/drafts/:id`
- 入口策略：
  - `GET /api/me/entry-target`（返回 `home|mindmap` + 原因）
  - `PATCH /api/me/entry-preference`（`auto|home|mindmap`）

## 9. 治理与后台

- 举报：`POST /api/reports`
- 管理员：
  - `GET /api/admin/reports`
  - `POST /api/admin/reports/:id/resolve`
  - `POST /api/admin/users/:id/sanction`
  - `GET /api/admin/analytics/*`
  - `GET /api/admin/analytics/audit-logs`

## 10. 已实现规则

- 一句即可发布。
- 单条最多 4 图、每图 <= 5MB、每用户总图 <= 60。
- 金句限制：中文 <= 20 字，英文 <= 30 词。
- 正文编辑窗口 30 天；公开开关不限时。
- 草稿最多 5 条，自动保存由前端 1.5 秒防抖触发。
- 高风险频率下，发布/评论/互动接口会要求 Turnstile 令牌：
  - Header: `x-turnstile-token`
  - 或 Body: `turnstileToken`
## 1.1 公共配置

- `GET /api/public/config`（返回 Turnstile site key 等）

## 1.2 线上 OIDC

- `GET /api/auth/oidc/login`
- `GET /api/auth/oidc/callback`
