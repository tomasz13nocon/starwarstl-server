FROM node
COPY . /app
WORKDIR /app
RUN npm install
EXPOSE 5000
CMD ["node", "index.js"]
