# syntax=docker/dockerfile:1
# One image serving the API and the built React frontend.
#   docker build -t usertopio/the-parzival-film-profile .
#   docker run -p 3001:3001 --env-file backend/.env \
#     -e GOOGLE_KEY_FILE=/run/secrets/service-account.key.json \
#     -v "$PWD/backend/service-account.key.json:/run/secrets/service-account.key.json:ro" \
#     usertopio/the-parzival-film-profile

# --- Build: install everything, type-check, build the frontend ---------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY core/package.json core/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY shared shared
COPY core core
COPY backend backend
COPY frontend frontend
RUN npm run build

# --- Runtime: production dependencies + backend source + built frontend -------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY core/package.json core/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev && npm cache clean --force
COPY shared shared
COPY core core
COPY backend backend
COPY --from=build /app/frontend/dist frontend/dist

USER node
WORKDIR /app/backend
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
# Run node directly (not via npm) so it receives stop signals.
CMD ["node", "--import", "tsx", "src/index.ts"]
