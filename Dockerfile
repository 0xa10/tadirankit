FROM node:16

WORKDIR /opt/tadirankit
COPY package*.json ./

RUN npm install
COPY . .

EXPOSE 47137/tcp
EXPOSE 47137/udp
CMD ["node", "src/main.js"]

