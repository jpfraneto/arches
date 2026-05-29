FROM oven/bun:1-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.ts index.html ./

EXPOSE 3000

CMD ["bun", "run", "server.ts"]
