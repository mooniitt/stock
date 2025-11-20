# Use Node.js image from Alibaba Cloud mirror
FROM registry.cn-hangzhou.aliyuncs.com/library/node:20-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
