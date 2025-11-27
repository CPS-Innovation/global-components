FROM nginx:1.25-alpine

# Install njs module
RUN apk add --no-cache nginx-mod-http-js

# Create templates directory
RUN mkdir -p /etc/nginx/templates

# Copy nginx config (context is parent directory)
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY config/global-components.conf /etc/nginx/templates/global-components.conf
COPY config/global-components.js /etc/nginx/templates/global-components.js
COPY config/global-components-vars.js /etc/nginx/templates/global-components-vars.js

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
