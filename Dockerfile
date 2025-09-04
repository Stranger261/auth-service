FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./
COPY src ./src

RUN npm install

EXPOSE 8000

CMD ["npm", "start"]