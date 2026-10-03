FROM node:20-alpine

WORKDIR /app

# Local tarball deps are path-referenced in package.json, so copy them first.
COPY package.json package-lock.json *.tgz ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]