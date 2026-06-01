FROM node:22-bookworm-slim

WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.scripts.json ./
COPY packages ./packages
COPY apps/runner ./apps/runner

RUN pnpm install --frozen-lockfile
RUN pnpm --filter runner typecheck

EXPOSE 8787

CMD ["pnpm", "--filter", "runner", "start"]
