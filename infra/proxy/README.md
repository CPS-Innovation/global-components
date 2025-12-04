# Nginx Proxy Config

## Deployment

Copy contents of `config/` to your nginx templates directory (alongside main nginx.conf).

Create `global-components-vars.js` from the example:
```bash
cp config/global-components-vars.example.js config/global-components-vars.js
# Edit with your upstream URL and function key
```

## Local Testing

```bash
cd docker
docker-compose up --build
```

Test routes at `http://localhost:8080/global-components/`.
