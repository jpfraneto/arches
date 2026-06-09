FROM oven/bun:1

WORKDIR /app
COPY apps/setup-broker/package.json apps/setup-broker/bun.lock ./
RUN bun install --frozen-lockfile
COPY apps/setup-broker/src ./src
COPY packages /packages

ENV PORT=3020
EXPOSE 3020

CMD ["bun", "run", "src/index.ts"]
