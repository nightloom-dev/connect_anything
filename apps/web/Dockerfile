# The web of Connect Anything: the pages and the server routes, served by vite preview. Build from the root:
#   docker build -f apps/web/Dockerfile -t connect-anything-web .
# or let compose.yaml at the root build it. The image also runs the Telegram watcher.
FROM node:22.23.0-slim
WORKDIR /app
COPY . .
# the user the app runs as writes the recipes, the watches, and vite's bundled config at start
RUN npm ci && npm run build \
 && mkdir -p apps/web/data apps/watch/data apps/web/node_modules/.vite-temp \
 && chown node apps/web/data apps/watch/data apps/web/node_modules/.vite-temp
USER node
EXPOSE 4173
CMD ["npm", "run", "preview", "-w", "apps/web", "--", "--host", "0.0.0.0", "--strictPort"]
