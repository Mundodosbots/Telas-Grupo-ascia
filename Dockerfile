# ---- build: instala tudo e compila o front-end ----
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY . .
RUN cd apps/web && bun run build && test -f /app/apps/api/public/index.html

# ---- runtime: só a API + front compilado em apps/api/public ----
FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD bun -e "fetch('http://localhost:3000/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "apps/api/src/index.ts"]
