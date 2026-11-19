# 智学课堂 · 生产镜像（Next.js standalone + 两个 worker）
# 部署形态见 docs/2026-11/云端部署方案-2026-11-23.md

FROM node:20-bookworm-slim AS base
ENV TZ=Asia/Shanghai \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---------- 依赖 ----------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- 构建 ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期不连真实数据库；运行时才注入。
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npx prisma generate \
 && npm run build \
 && npm run build:background-worker \
 && npm run build:programming-judge-worker

# ---------- 运行 ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Next 自包含产物
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# worker 需要完整依赖（background-worker 使用 --packages=external）
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.data/background-worker-build ./.data/background-worker-build
COPY --from=builder --chown=nextjs:nodejs /app/.data/programming-judge-worker-build ./.data/programming-judge-worker-build

# 迁移文件与 CLI，用于发布前一次性执行 prisma migrate deploy
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# 运行期可写目录（单机部署挂载持久卷；多副本需改对象存储）
RUN mkdir -p /app/.data/uploads /app/.data/login-captcha \
 && chown -R nextjs:nodejs /app/.data

USER nextjs
EXPOSE 3000

# 默认启动 Web；worker 通过 command 覆盖
CMD ["node", "server.js"]
