FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/10-generate-local-certificate.sh /docker-entrypoint.d/10-generate-local-certificate.sh
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/10-generate-local-certificate.sh

EXPOSE 80 443
