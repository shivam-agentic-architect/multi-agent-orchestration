# Build Stage
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM node:20-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/server.ts ./
COPY --from=build /app/firebase-applet-config.json ./
# Install only production dependencies
RUN npm install --omit=dev
# Install tsx for running server.ts
RUN npm install -g tsx

EXPOSE 3000
CMD ["tsx", "server.ts"]
