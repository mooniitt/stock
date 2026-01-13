# Use Node.js slim image - as our goal is only to run the server service
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim

WORKDIR /usr/src/app

# --- SERVICE SEPARATION STRATEGY ---
# By using --production, we ONLY install 'dependencies' (@modelcontextprotocol/sdk, zod)
# and completely IGNORE 'devDependencies' (electron, electron-builder).
# This isolates the backend service from the large frontend build tools.
COPY package.json yarn.lock ./
RUN yarn config set registry https://registry.npmmirror.com && \
    yarn install --production --frozen-lockfile --network-timeout 100000 && \
    yarn cache clean

# Only copy necessary server files (optional, but good for separation)
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
