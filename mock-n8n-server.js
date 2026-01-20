/**
 * Mock n8n server for testing validation
 * This simulates a real n8n instance for testing purposes
 */
const http = require('http');

// Mock nodes list - simulating n8n's available nodes
const mockNodes = [
  {
    name: 'n8n-nodes-base.start',
    displayName: 'Start',
    description: 'Starts the workflow execution from this node',
    version: 1,
    group: ['input'],
  },
  {
    name: 'n8n-nodes-base.manualTrigger',
    displayName: 'Manual Trigger',
    description: 'Trigger the workflow manually',
    version: 1,
    group: ['trigger'],
  },
  {
    name: 'n8n-nodes-base.webhook',
    displayName: 'Webhook',
    description: 'Handle HTTP webhooks',
    version: 1,
    group: ['trigger'],
  },
  {
    name: 'n8n-nodes-base.httpRequest',
    displayName: 'HTTP Request',
    description: 'Make HTTP requests',
    version: 4,
    group: ['output'],
  },
  {
    name: 'n8n-nodes-base.set',
    displayName: 'Set',
    description: 'Set values',
    version: 3,
    group: ['transform'],
  },
  {
    name: 'n8n-nodes-base.if',
    displayName: 'IF',
    description: 'Conditional branching',
    version: 1,
    group: ['flow'],
  },
  {
    name: 'n8n-nodes-base.slack',
    displayName: 'Slack',
    description: 'Send messages to Slack',
    version: 2,
    group: ['output'],
    credentials: ['slackApi'],
  },
  {
    name: 'n8n-nodes-base.googleSheets',
    displayName: 'Google Sheets',
    description: 'Read and write to Google Sheets',
    version: 4,
    group: ['output'],
    credentials: ['googleSheetsOAuth2Api'],
  },
  {
    name: 'n8n-nodes-base.emailSend',
    displayName: 'Send Email',
    description: 'Send emails via SMTP',
    version: 2,
    group: ['output'],
    credentials: ['smtp'],
  },
  {
    name: 'n8n-nodes-base.airtable',
    displayName: 'Airtable',
    description: 'Read and write to Airtable',
    version: 2,
    group: ['output'],
    credentials: ['airtableApi'],
  },
  {
    name: 'n8n-nodes-base.notion',
    displayName: 'Notion',
    description: 'Read and write to Notion',
    version: 2,
    group: ['output'],
    credentials: ['notionApi'],
  },
  {
    name: 'n8n-nodes-base.noOp',
    displayName: 'No Operation',
    description: 'No operation, pass through',
    version: 1,
    group: ['flow'],
  },
  {
    name: 'n8n-nodes-base.splitInBatches',
    displayName: 'Split In Batches',
    description: 'Process items in batches',
    version: 3,
    group: ['flow'],
  },
  {
    name: 'n8n-nodes-base.gmail',
    displayName: 'Gmail',
    description: 'Send emails via Gmail',
    version: 2,
    group: ['output'],
    credentials: ['gmailOAuth2'],
  },
];

// Track workflow count for ID generation
let workflowCounter = 1000;

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-N8N-API-KEY');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const apiKey = req.headers['x-n8n-api-key'];

  // Check authorization for all requests
  if (!apiKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Unauthorized' }));
    return;
  }

  // Accept "valid_test_key_12345" as a valid API key
  if (apiKey !== 'valid_test_key_12345') {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Invalid API key' }));
    return;
  }

  console.log(`${req.method} ${req.url}`);

  // GET /api/v1/workflows - List workflows
  if (req.url === '/api/v1/workflows' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [] }));
    return;
  }

  // POST /api/v1/workflows - Create workflow
  if (req.url === '/api/v1/workflows' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const workflow = JSON.parse(body);
        const workflowId = `wf_${++workflowCounter}`;

        console.log(`Created workflow: ${workflowId} - ${workflow.name}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: workflowId,
          name: workflow.name,
          active: false, // Workflows are created inactive by default in n8n
          nodes: workflow.nodes,
          connections: workflow.connections,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        console.error('Error parsing workflow JSON:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Invalid JSON' }));
      }
    });
    // Important: Don't call res.end() here - it's handled in the 'end' event
    return;
  }

  // DELETE /api/v1/workflows/:id - Delete workflow (for rollback)
  const deleteMatch = req.url.match(/^\/api\/v1\/workflows\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const workflowId = deleteMatch[1];
    console.log(`Deleted workflow: ${workflowId}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // GET /api/v1/nodes - List available nodes
  if (req.url === '/api/v1/nodes' && req.method === 'GET') {
    // Simulate some latency to make caching benefit visible
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: mockNodes }));
    }, 500);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not found' }));
});

const PORT = 8888;
server.listen(PORT, () => {
  console.log(`Mock n8n server running on http://localhost:${PORT}`);
  console.log('Valid API key for testing: valid_test_key_12345');
  console.log(`Available endpoints:
  - GET  /api/v1/workflows - List workflows
  - POST /api/v1/workflows - Create workflow
  - DELETE /api/v1/workflows/:id - Delete workflow
  - GET  /api/v1/nodes - List available nodes (${mockNodes.length} nodes)`);
});
