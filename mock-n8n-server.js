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

// Mock detailed node type information with properties/parameters
const mockNodeTypes = [
  {
    name: 'n8n-nodes-base.httpRequest',
    displayName: 'HTTP Request',
    description: 'Make HTTP requests to any URL',
    version: 4,
    properties: [
      { name: 'method', displayName: 'Method', type: 'options', default: 'GET', options: [
        { name: 'GET', value: 'GET' }, { name: 'POST', value: 'POST' },
        { name: 'PUT', value: 'PUT' }, { name: 'DELETE', value: 'DELETE' },
        { name: 'PATCH', value: 'PATCH' }, { name: 'HEAD', value: 'HEAD' },
      ]},
      { name: 'url', displayName: 'URL', type: 'string', required: true, description: 'The URL to make the request to' },
      { name: 'sendBody', displayName: 'Send Body', type: 'boolean', default: false },
      { name: 'bodyParameters', displayName: 'Body Parameters', type: 'fixedCollection' },
      { name: 'sendHeaders', displayName: 'Send Headers', type: 'boolean', default: false },
      { name: 'headerParameters', displayName: 'Header Parameters', type: 'fixedCollection' },
      { name: 'sendQuery', displayName: 'Send Query Parameters', type: 'boolean', default: false },
      { name: 'queryParameters', displayName: 'Query Parameters', type: 'fixedCollection' },
    ],
    credentials: [],
  },
  {
    name: 'n8n-nodes-base.slack',
    displayName: 'Slack',
    description: 'Send messages and interact with Slack',
    version: 2,
    properties: [
      { name: 'resource', displayName: 'Resource', type: 'options', default: 'message', options: [
        { name: 'Message', value: 'message' }, { name: 'Channel', value: 'channel' },
        { name: 'File', value: 'file' }, { name: 'Reaction', value: 'reaction' },
      ]},
      { name: 'operation', displayName: 'Operation', type: 'options', default: 'post', options: [
        { name: 'Post', value: 'post' }, { name: 'Update', value: 'update' },
        { name: 'Delete', value: 'delete' }, { name: 'Get Permalink', value: 'getPermalink' },
      ]},
      { name: 'channel', displayName: 'Channel', type: 'string', required: true, description: 'Channel ID (e.g., C0123456789) or name (e.g., #general)' },
      { name: 'text', displayName: 'Text', type: 'string', required: true, description: 'The message text to send' },
      { name: 'attachments', displayName: 'Attachments', type: 'json' },
      { name: 'blocksUi', displayName: 'Blocks', type: 'fixedCollection' },
    ],
    credentials: [{ name: 'slackApi', required: true }],
  },
  {
    name: 'n8n-nodes-base.gmail',
    displayName: 'Gmail',
    description: 'Send and receive emails through Gmail',
    version: 2,
    properties: [
      { name: 'resource', displayName: 'Resource', type: 'options', default: 'message', options: [
        { name: 'Message', value: 'message' }, { name: 'Thread', value: 'thread' },
        { name: 'Label', value: 'label' }, { name: 'Draft', value: 'draft' },
      ]},
      { name: 'operation', displayName: 'Operation', type: 'options', default: 'getAll', options: [
        { name: 'Get All', value: 'getAll' }, { name: 'Get', value: 'get' },
        { name: 'Send', value: 'send' }, { name: 'Delete', value: 'delete' },
        { name: 'Mark as Read', value: 'markRead' }, { name: 'Mark as Unread', value: 'markUnread' },
        { name: 'Add Labels', value: 'addLabels' }, { name: 'Remove Labels', value: 'removeLabels' },
      ]},
      { name: 'limit', displayName: 'Limit', type: 'number', default: 50, description: 'Maximum number of emails to return' },
      { name: 'filters', displayName: 'Filters', type: 'collection', description: 'Query filter (e.g., from:user@example.com newer_than:3d)' },
      { name: 'labelIds', displayName: 'Label IDs', type: 'multiOptions' },
    ],
    credentials: [{ name: 'gmailOAuth2', required: true }],
  },
  {
    name: 'n8n-nodes-base.googleSheets',
    displayName: 'Google Sheets',
    description: 'Read and write data to Google Sheets',
    version: 4,
    properties: [
      { name: 'operation', displayName: 'Operation', type: 'options', default: 'read', options: [
        { name: 'Read', value: 'read' }, { name: 'Append', value: 'append' },
        { name: 'Update', value: 'update' }, { name: 'Clear', value: 'clear' },
        { name: 'Delete', value: 'delete' },
      ]},
      { name: 'documentId', displayName: 'Spreadsheet ID', type: 'resourceLocator', required: true },
      { name: 'sheetName', displayName: 'Sheet Name', type: 'resourceLocator', required: true },
      { name: 'range', displayName: 'Range', type: 'string', description: 'Cell range (e.g., A1:D10)' },
    ],
    credentials: [{ name: 'googleSheetsOAuth2Api', required: true }],
  },
  {
    name: 'n8n-nodes-base.set',
    displayName: 'Set',
    description: 'Set and modify data fields',
    version: 3,
    properties: [
      { name: 'mode', displayName: 'Mode', type: 'options', default: 'manual', options: [
        { name: 'Manual', value: 'manual' }, { name: 'Raw JSON', value: 'raw' },
      ]},
      { name: 'duplicateItem', displayName: 'Duplicate Item', type: 'boolean', default: false },
      { name: 'assignments', displayName: 'Assignments', type: 'fixedCollection' },
    ],
    credentials: [],
  },
  {
    name: 'n8n-nodes-base.if',
    displayName: 'IF',
    description: 'Route data based on conditions',
    version: 1,
    properties: [
      { name: 'conditions', displayName: 'Conditions', type: 'fixedCollection', description: 'Define conditions using boolean, number, or string comparisons' },
      { name: 'combineOperation', displayName: 'Combine', type: 'options', default: 'and', options: [
        { name: 'AND', value: 'and' }, { name: 'OR', value: 'or' },
      ]},
    ],
    credentials: [],
  },
  {
    name: 'n8n-nodes-base.code',
    displayName: 'Code',
    description: 'Execute custom JavaScript code',
    version: 2,
    properties: [
      { name: 'mode', displayName: 'Mode', type: 'options', default: 'runOnceForAllItems', options: [
        { name: 'Run Once for All Items', value: 'runOnceForAllItems' },
        { name: 'Run Once for Each Item', value: 'runOnceForEachItem' },
      ]},
      { name: 'jsCode', displayName: 'JavaScript Code', type: 'string', description: 'Use $input.all() to get all items, return array of { json: {...} } objects' },
    ],
    credentials: [],
  },
  {
    name: 'n8n-nodes-base.filter',
    displayName: 'Filter',
    description: 'Filter items based on conditions',
    version: 1,
    properties: [
      { name: 'conditions', displayName: 'Conditions', type: 'fixedCollection' },
      { name: 'combineOperation', displayName: 'Combine', type: 'options', default: 'and', options: [
        { name: 'AND', value: 'and' }, { name: 'OR', value: 'or' },
      ]},
    ],
    credentials: [],
  },
  {
    name: 'n8n-nodes-base.webhook',
    displayName: 'Webhook',
    description: 'Create webhooks to trigger workflows via HTTP requests',
    version: 1,
    properties: [
      { name: 'httpMethod', displayName: 'HTTP Method', type: 'options', default: 'POST', options: [
        { name: 'GET', value: 'GET' }, { name: 'POST', value: 'POST' },
        { name: 'DELETE', value: 'DELETE' }, { name: 'PUT', value: 'PUT' },
      ]},
      { name: 'path', displayName: 'Path', type: 'string', required: true },
      { name: 'responseMode', displayName: 'Respond', type: 'options', default: 'onReceived', options: [
        { name: 'Immediately', value: 'onReceived' },
        { name: 'When Last Node Finishes', value: 'lastNode' },
      ]},
    ],
    credentials: [],
  },
  {
    name: 'n8n-nodes-base.emailSend',
    displayName: 'Send Email',
    description: 'Send emails via SMTP',
    version: 2,
    properties: [
      { name: 'fromEmail', displayName: 'From Email', type: 'string', required: true },
      { name: 'toEmail', displayName: 'To Email', type: 'string', required: true },
      { name: 'subject', displayName: 'Subject', type: 'string', required: true },
      { name: 'text', displayName: 'Text', type: 'string' },
      { name: 'html', displayName: 'HTML', type: 'string' },
      { name: 'attachments', displayName: 'Attachments', type: 'string' },
    ],
    credentials: [{ name: 'smtp', required: true }],
  },
  {
    name: 'n8n-nodes-base.manualTrigger',
    displayName: 'Manual Trigger',
    description: 'Trigger the workflow manually',
    version: 1,
    properties: [],
    credentials: [],
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

  // GET /api/v1/node-types - Get detailed node type information (Feature #269)
  if (req.url === '/api/v1/node-types' && req.method === 'GET') {
    // Simulate some latency
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: mockNodeTypes }));
    }, 300);
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
  - GET  /api/v1/nodes - List available nodes (${mockNodes.length} nodes)
  - GET  /api/v1/node-types - Get detailed node type info (${mockNodeTypes.length} node types)`);
});
