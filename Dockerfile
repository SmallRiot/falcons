# Falcons: API + мини-приложение (8787) + веб-консоль (8788) в одном контейнере.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY console/package.json console/
RUN npm ci
COPY . .
# консоль в проде открывается по /console/
ENV CONSOLE_BASE=/console/
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/data
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY console/package.json console/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
COPY server server
COPY shared shared
COPY --from=build /app/web/dist web/dist
COPY --from=build /app/console/dist console/dist
EXPOSE 8787 8788
CMD ["node", "--no-warnings=ExperimentalWarning", "server/src/index.ts"]
