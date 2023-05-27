FROM node:16

WORKDIR /opt/tadirankit
COPY package*.json ./

RUN npm install
COPY src ./src

VOLUME /opt/tadirankit/persist
CMD ["node", "src/main.js"]

