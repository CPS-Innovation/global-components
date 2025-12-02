const http = require('http');

const PORT = 3000;
const BASE_URL = 'http://mock-upstream:3000/api/';

// Simulate upstream CORS - only allow requests from "itself"
const ALLOWED_ORIGINS = [
  'http://mock-upstream:3000',
  'https://localhost',
  'https://localhost:8080'
];

function checkCors(req, res) {
  const origin = req.headers.origin;

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.log(`  -> CORS REJECTED: Origin "${origin}" not allowed`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'CORS error',
      message: `Origin "${origin}" is not allowed`,
      allowedOrigins: ALLOWED_ORIGINS
    }));
    return false;
  }
  return true;
}

const routes = {
  'preview/index.html': {
    contentType: 'text/html',
    body: `<!DOCTYPE html>
<html><head><title>Preview Settings</title></head>
<body><h1>Preview Settings</h1><p>Mock preview page</p></body>
</html>`,
    skipApiPrefix: true
  },
  'swagger.json': {
    contentType: 'application/json',
    body: JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Mock API', version: '1.0.0' },
      servers: [{ url: BASE_URL }],
      paths: {
        '/api/cases': { get: { summary: 'Get cases' } },
        '/api/documents': { get: { summary: 'Get documents' } }
      }
    }, null, 2)
  },
  'swagger/ui': {
    contentType: 'text/html',
    body: `<html><body><h1>Swagger UI Mock</h1><p>Base URL: ${BASE_URL}</p></body></html>`
  },
  'cases': {
    contentType: 'application/json',
    body: JSON.stringify({ cases: [{ id: 1, name: 'Test Case' }] })
  },
  'documents': {
    contentType: 'application/json',
    body: JSON.stringify({ documents: [{ id: 1, title: 'Test Doc' }] })
  }
};

const server = http.createServer((req, res) => {
  // Log incoming request with headers
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  // Strip /api/ prefix if present, and leading slash
  const path = req.url.replace(/^\/api\//, '').replace(/^\//, '').replace(/\?.*$/, '');

  // Check for required headers
  const functionsKey = req.headers['x-functions-key'];
  const cmsAuthValues = req.headers['cms-auth-values'];

  console.log(`  -> Path: ${path}`);
  console.log(`  -> x-functions-key: ${functionsKey || '(not set)'}`);
  console.log(`  -> cms-auth-values: ${cmsAuthValues || '(not set)'}`);

  // Check CORS before processing
  if (!checkCors(req, res)) {
    return;
  }

  const route = routes[path];

  if (route) {
    res.writeHead(200, {
      'Content-Type': route.contentType,
      'X-Mock-Path': path,
      'X-Functions-Key-Received': functionsKey || 'none'
    });
    res.end(route.body);
  } else {
    // Default response for unknown routes
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      mock: true,
      path: path,
      originalUrl: req.url,
      headers: {
        'x-functions-key': functionsKey || null,
        'cms-auth-values': cmsAuthValues || null,
        origin: req.headers.origin || null
      }
    }, null, 2));
  }
});

server.listen(PORT, () => {
  console.log(`Mock upstream server running on port ${PORT}`);
  console.log('Available routes:');
  Object.keys(routes).forEach(r => console.log(`  /api/${r}`));
});
