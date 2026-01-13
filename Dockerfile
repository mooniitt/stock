# Use Node.js image with platform awareness
# If using Docker Desktop on Mac (M1/M2/M3), ensure we use arm64 to avoid QEMU emulation
FROM --platform=linux/arm64 swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim

WORKDIR /usr/src/app

# Set yarn registry to user preferred URL
# Use --production to skip large devDependencies like electron
COPY package.json yarn.lock ./
RUN yarn config set registry https://r.cnpmjs.org/ && \
    yarn install --production --frozen-lockfile && \
    yarn cache clean

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
