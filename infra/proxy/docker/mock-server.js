const http = require('http');
const https = require('https');
const fs = require('fs');

const PORT = 3000;
const HTTPS_PORT = 3443;
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

  // Mock Graph API token validation endpoint
  if (req.url === '/v1.0/me') {
    if (req.headers.authorization) {
      console.log('  -> Mock Graph API: token present, returning 200');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'mock-user', displayName: 'Mock User' }));
    } else {
      console.log('  -> Mock Graph API: no token, returning 401');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
    return;
  }

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

  // Handle blob storage requests (dev/test/prod environments)
  // Matches both /blob/env/file (HTTP mock) and /env/file (HTTPS blob proxy)
  const blobMatch = path.match(/^(?:blob\/)?(dev|test|prod)\/(.+)$/);
  if (blobMatch) {
    const [, env, file] = blobMatch;
    console.log(`  -> Blob storage: env=${env}, file=${file}`);

    // Determine content type based on file extension
    let contentType = 'text/plain';
    let body;
    if (file.endsWith('.js')) {
      contentType = 'application/javascript';
      body = `// Mock blob file: ${env}/${file}\nconsole.log("Hello from ${env}");`;
    } else if (file.endsWith('.html') || file.endsWith('/index.html')) {
      contentType = 'text/html';
      // Extract folder name from path (e.g., "preview/index.html" -> "preview")
      const folder = file.replace(/\/?index\.html$/, '') || 'root';
      body = `<!DOCTYPE html><html><head><title>Mock ${folder}</title></head><body><h1>Mock ${folder} page</h1><p>Environment: ${env}</p><p>File: ${file}</p></body></html>`;
    } else {
      body = `Mock blob file: ${env}/${file}`;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'X-Mock-Blob-Env': env,
      'X-Mock-Blob-File': file
    });
    res.end(body);
    return;
  }

  // Handle case summary and monitoring-codes requests
  const caseMatch = path.match(/^cases\/(\d+)\/(summary|monitoring-codes)/);
  if (caseMatch) {
    const [, caseId, endpoint] = caseMatch;
    console.log(`  -> Case ${endpoint}: caseId=${caseId}`);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Functions-Key-Received': functionsKey || 'none'
    });
    res.end(JSON.stringify({
      mock: true,
      caseId: parseInt(caseId),
      endpoint: endpoint,
      originalUrl: req.url,
      data: endpoint === 'summary' ? 'Mock case summary' : ['MC001', 'MC002'],
      headers: {
        'x-functions-key': functionsKey || null,
        'cms-auth-values': cmsAuthValues || null,
        'authorization': req.headers.authorization || null
      }
    }));
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

// HTTPS server for blob storage proxy (self-signed cert from Dockerfile)
try {
  const httpsOptions = {
    key: fs.readFileSync('/app/key.pem'),
    cert: fs.readFileSync('/app/cert.pem')
  };
  const httpsServer = https.createServer(httpsOptions, server.listeners('request')[0]);
  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`Mock upstream HTTPS server running on port ${HTTPS_PORT}`);
  });
} catch (e) {
  console.log(`HTTPS server not started (no certs): ${e.message}`);
}
