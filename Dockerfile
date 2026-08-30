FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV BIND_HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV AUTH_DIR=/app/auth
ENV DATABASE_PATH=/app/data/timer-bot.sqlite
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
EXPOSE 3000
VOLUME ["/app/data", "/app/auth"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "run", "service"]
