/**
 * Mock n8n server for testing validation
 * This simulates a real n8n instance for testing purposes
 */
const http = require('http');

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-N8N-API-KEY');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/api/v1/workflows' && req.method === 'GET') {
    const apiKey = req.headers['x-n8n-api-key'];

    console.log('Received request with API key:', apiKey ? '***' + apiKey.slice(-4) : 'none');

    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Unauthorized' }));
      return;
    }

    // Accept "valid_test_key_12345" as a valid API key
    if (apiKey === 'valid_test_key_12345') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [] }));
      return;
    }

    // Any other key is invalid
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Invalid API key' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not found' }));
});

const PORT = 8888;
server.listen(PORT, () => {
  console.log(`Mock n8n server running on http://localhost:${PORT}`);
  console.log('Valid API key for testing: valid_test_key_12345');
});
