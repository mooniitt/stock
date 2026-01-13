# Use Node.js slim image
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim

WORKDIR /usr/src/app

# Only copy lockfile and package.json to leverage Docker cache
# Use --production to skip HUGE devDependencies (like electron) 
# This also avoids the 'git not found' error usually caused by dev deps
COPY package.json yarn.lock ./
RUN yarn config set registry https://r.cnpmjs.org/ && \
    yarn install --production --frozen-lockfile && \
    yarn cache clean

# Copy rest of the code
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
