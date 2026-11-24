# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.30.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/dto/package.json packages/dto/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY apps/server apps/server
COPY apps/web apps/web
COPY packages/dto packages/dto
RUN pnpm build
RUN pnpm --filter @dongxuan/server deploy --prod --legacy /out/server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3040 SERVE_WEB=1
WORKDIR /app/apps/server
COPY --from=build --chown=node:node /out/server ./
COPY --from=build --chown=node:node /workspace/apps/web/dist /app/apps/web/dist
USER node
EXPOSE 3040
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD ["node", "-e", "fetch('http://127.0.0.1:3040/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
