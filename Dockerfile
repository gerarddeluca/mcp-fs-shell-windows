FROM node:22.12-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY . .

RUN npm ci

FROM node:22-alpine AS release

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev

COPY --from=builder /app/dist /app/dist

ENV NODE_ENV=production

ENTRYPOINT ["node", "/app/dist/index.js"]
