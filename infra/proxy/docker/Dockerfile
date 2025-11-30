FROM nginx:1.25-alpine

# Install njs module and curl for healthcheck
RUN apk add --no-cache nginx-mod-http-js curl

# Create templates directory
RUN mkdir -p /etc/nginx/templates

# Copy nginx config (context is parent directory)
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx.js /etc/nginx/nginx.js
COPY config/global-components.conf.template /etc/nginx/templates/global-components.conf.template
COPY config/global-components.js /etc/nginx/templates/global-components.js
# Use mock vars for build (real vars mounted at runtime via docker-compose)
COPY docker/global-components-vars.mock.js /etc/nginx/templates/global-components-vars.js

# Configure nginx to run as non-root
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/global-components || exit 1

CMD ["nginx", "-g", "daemon off;"]
