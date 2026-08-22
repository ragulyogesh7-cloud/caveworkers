FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/static ./static
COPY --from=build --chown=node:node /app/templates ./templates
COPY --from=build --chown=node:node /app/deskforce.html ./deskforce.html
COPY --from=build --chown=node:node /app/firebase-applet-config.json ./firebase-applet-config.json
USER node
EXPOSE 8080
CMD ["npm", "start"]
