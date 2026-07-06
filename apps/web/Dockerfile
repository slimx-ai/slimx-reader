# --- build stage ---
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The API base URL is baked into the client bundle at build time. For a host-published stack the
# browser reaches the API on the host, so default to localhost:8200.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8200
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
# `npm run build` runs prebuild (copies pdf.worker.min.mjs into public/) then `next build`.
RUN npm run build

# --- run stage ---
FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/next.config.mjs ./next.config.mjs
USER node
EXPOSE 3200
CMD ["npm", "run", "start"]
