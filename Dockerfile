ARG RUNNER_IMAGE="gcr.io/distroless/base-debian11"

# Build Stage
FROM node:18.17 AS builder
WORKDIR /app
COPY package.json ./
COPY yarn.lock ./
COPY . .
RUN yarn install
RUN yarn build

FROM --platform=linux/x86_64 gcr.io/distroless/nodejs20-debian11
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 8903
CMD ["--max-old-space-size=4096", "dist/app.js"]