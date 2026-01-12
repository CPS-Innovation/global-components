const http = require('http');

const PORT = 3000;

const server = http.createServer((req, res) => {
  // Log incoming request with headers
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  const path = req.url.replace(/\?.*$/, '');

  // Health check
  if (path === '/health' || path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mock upstream is online');
    return;
  }

  // Mock CMS endpoints
  if (path.startsWith('/CMS')) {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Mock-CMS': 'true'
    });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Mock CMS Page</title></head>
<body>
<h1>Mock CMS Response</h1>
<p>Path: ${path}</p>
<p>This is a mock CMS response for testing the polaris-proxy.</p>
</body>
</html>`);
    return;
  }

  // Mock CMSModern endpoints
  if (path.startsWith('/CMSModern')) {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Mock-CMS-Modern': 'true'
    });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Mock CMS Modern</title></head>
<body>
<h1>Mock CMS Modern Response</h1>
<p>Path: ${path}</p>
</body>
</html>`);
    return;
  }

  // Mock API endpoints
  if (path.startsWith('/api/')) {
    const apiPath = path.replace('/api/', '');

    // Auth init endpoint
    if (apiPath === 'init/' || apiPath === 'init') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mock: true,
        endpoint: 'init',
        message: 'Mock auth init response'
      }));
      return;
    }

    // Auth refresh termination
    if (apiPath.startsWith('auth-refresh-termination')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mock: true,
        endpoint: 'auth-refresh-termination'
      }));
      return;
    }

    // CMS modern token
    if (apiPath.startsWith('cms-modern-token')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mock: true,
        endpoint: 'cms-modern-token',
        token: 'mock-token-12345'
      }));
      return;
    }

    // Login endpoint
    if (apiPath.startsWith('login')) {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Mock Login</title></head>
<body>
<h1>Mock Login Page</h1>
<form method="POST">
  <input type="text" name="username" placeholder="Username">
  <input type="password" name="password" placeholder="Password">
  <button type="submit">Login</button>
</form>
</body>
</html>`);
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': ['mock_session=12345; Path=/', 'cin3.cps.gov.uk=mock; Path=/']
        });
        res.end(JSON.stringify({
          mock: true,
          success: true,
          message: 'Mock login successful'
        }));
      }
      return;
    }

    // Generic API response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      mock: true,
      path: apiPath,
      originalUrl: req.url
    }));
    return;
  }

  // Polaris UI mock
  if (path.startsWith('/polaris-ui')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Mock Polaris UI</title></head>
<body>
<h1>Mock Polaris UI</h1>
<p>Path: ${path}</p>
</body>
</html>`);
    return;
  }

  // Materials UI mock
  if (path.startsWith('/materials-ui')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Mock Materials UI</title></head>
<body>
<h1>Mock Materials UI</h1>
<p>Path: ${path}</p>
</body>
</html>`);
    return;
  }

  // Work Management redirect endpoint
  if (path.startsWith('/WorkManagementApp')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Mock Work Management</title></head>
<body>
<h1>Mock Work Management App</h1>
<p>Path: ${path}</p>
</body>
</html>`);
    return;
  }

  // SAS URL mock
  if (path.startsWith('/sas-url/')) {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'inline'
    });
    res.end('Mock SAS URL content');
    return;
  }

  // AJAX viewer mock
  if (path.startsWith('/ajax/viewer/')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Mock AJAX Viewer</title></head>
<body>
<h1>Mock AJAX Viewer</h1>
<p>Path: ${path}</p>
</body>
</html>`);
    return;
  }

  // Default response for unknown routes
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    mock: true,
    path: path,
    originalUrl: req.url,
    method: req.method,
    headers: req.headers
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`Mock upstream server running on port ${PORT}`);
  console.log('Ready to receive requests from polaris-proxy');
});
