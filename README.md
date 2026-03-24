# Elysia 

Elysia 后端基础工程，按以下技术栈实现：

- Fastify API + WebSocket
- PostgreSQL
- Redis + BullMQ Worker
- Cloudflare R2（当前为占位接入）
- Caddy + cloudflared（CF Tunnel）

## 快速开始

### 推荐方式：Windows 一键启动/停止

如果你在 Windows 本地开发，优先使用仓库根目录的脚本：

```bat
deploy.bat
```

- 会自动启动 `postgres`、`redis`
- 会自动补依赖、执行迁移
- 会启动 backend、frontend、worker
- 如果提示 Docker 权限不足，请以管理员身份运行脚本，或确认当前账号具备 Docker Desktop 访问权限

停止时使用：

```bat
stop.bat
```

- 会关闭本地 backend、frontend、worker 窗口
- 会释放常用开发端口
- 会停止 `docker compose` 服务

### 手动方式

1. 复制环境变量：

```bash
cp .env.example .env
```

2. 安装依赖：

```bash
pnpm install
```

3. 启动数据库与缓存：

```bash
docker compose up -d postgres redis
```

4. 执行迁移：

```bash
pnpm migrate
```

5. 启动 API：

```bash
pnpm dev
```

6. 启动 Worker：

```bash
pnpm worker
```

7. 运行测试：

```bash
pnpm test
```

7. 文档地址：

- Swagger UI: `http://localhost:3000/docs`
- API 前缀: `http://localhost:3000/api`

## 本地鉴权

本地默认不启 OIDC，使用开发鉴权：

- `POST /api/auth/dev/switch-user`
- body 示例：

```json
{
  "username": "demo_user",
  "displayName": "演示用户",
  "avatarUrl": "https://example.com/avatar.png"
}
```

成功后会设置 `elysia_user_id` Cookie。

## 线上 OIDC

- 配置 `.env` 中的 `OIDC_*` 变量后，可使用：
  - `GET /api/auth/oidc/login`
  - `GET /api/auth/oidc/callback`

## 高频风控（Turnstile）

- 当用户/IP 访问频率异常时，发布/评论/互动接口会要求 Turnstile token。
- 前端可从 `GET /api/public/config` 获取 `turnstileSiteKey`。

## 说明

- `plan.md` 为项目实施计划文档。
- `docs/frontend-contract.md` 为前端联调契约清单。
- `ops/backup/` 为备份与快照脚本。
- 当前版本优先落地后端骨架与核心业务链路，后续可继续深化 OIDC、R2 真签名、图谱算法与推荐系统。
