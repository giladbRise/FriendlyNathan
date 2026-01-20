import { PrismaClient, WorkflowStatus } from '@prisma/client';
import axios from 'axios';
import { decrypt } from '../utils/encryption';
import { io } from '../index';
import { geminiService } from './gemini.service';
import { workflowLogger } from './workflow-logger.service';

const prisma = new PrismaClient();

// Cache TTL in milliseconds (1 hour)
const NODE_CACHE_TTL_MS = 60 * 60 * 1000;

// Node type details cache TTL (4 hours - these don't change often)
const NODE_TYPES_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

interface N8nNode {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  group?: string[];
  credentials?: string[];
}

interface NodeProperty {
  name: string;
  displayName: string;
  type: string;
  default?: any;
  description?: string;
  required?: boolean;
  options?: Array<{ name: string; value: string; description?: string }>;
}

interface NodeTypeDetails {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  properties?: NodeProperty[];
  credentials?: Array<{ name: string; required?: boolean }>;
}

// In-memory cache for node type details
const nodeTypeDetailsCache: Map<string, { details: Map<string, NodeTypeDetails>; expiresAt: number }> = new Map();

interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, any>;
}

interface WorkflowConnection {
  main: Array<Array<{ node: string; type: string; index: number }>>;
}

interface N8nWorkflow {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, WorkflowConnection>;
  active: boolean;
  settings?: Record<string, any>;
}

interface GenerationResult {
  success: boolean;
  workflow?: N8nWorkflow;
  n8nWorkflowId?: string;
  n8nWorkflowUrl?: string;
  error?: string;
  nodesUsed?: number;
}

interface CredentialRequirement {
  type: string;
  displayName: string;
  instructions: string;
  steps: string[];
  documentationUrl?: string;
  videoUrl?: string;
  contactInfo?: string;
}

// Map of node types to their credential requirements
const CREDENTIAL_MAP: Record<string, CredentialRequirement> = {
  'n8n-nodes-base.slack': {
    type: 'slackApi',
    displayName: 'Slack API',
    instructions: 'Create a Slack app and generate an OAuth token to connect n8n to your Slack workspace.',
    steps: [
      'Go to api.slack.com/apps and click "Create New App"',
      'Choose "From scratch" and name your app',
      'Under "OAuth & Permissions", add the required scopes (chat:write, channels:read)',
      'Install the app to your workspace',
      'Copy the "Bot User OAuth Token" (starts with xoxb-)',
      'In n8n, create new Slack API credentials and paste the token',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/slack/',
    videoUrl: 'https://www.youtube.com/watch?v=n8n-slack-setup',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  'n8n-nodes-base.googleSheets': {
    type: 'googleSheetsOAuth2Api',
    displayName: 'Google Sheets OAuth2',
    instructions: 'Set up OAuth 2.0 credentials in Google Cloud Console to access Google Sheets.',
    steps: [
      'Go to console.cloud.google.com and create a new project',
      'Enable the Google Sheets API in the API Library',
      'Go to "Credentials" and click "Create Credentials" > "OAuth client ID"',
      'Configure the OAuth consent screen (Internal or External)',
      'Select "Web application" as the application type',
      'Add n8n callback URL to authorized redirect URIs',
      'Copy the Client ID and Client Secret',
      'In n8n, create Google Sheets OAuth2 credentials with these values',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/google/',
    videoUrl: 'https://www.youtube.com/watch?v=n8n-google-oauth-setup',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  'n8n-nodes-base.gmail': {
    type: 'gmailOAuth2',
    displayName: 'Gmail OAuth2',
    instructions: 'Set up OAuth 2.0 credentials in Google Cloud Console to send emails via Gmail.',
    steps: [
      'Go to console.cloud.google.com and create or select a project',
      'Enable the Gmail API in the API Library',
      'Create OAuth 2.0 credentials (same process as Google Sheets)',
      'Add gmail.send and gmail.readonly scopes',
      'In n8n, create Gmail OAuth2 credentials',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/google/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  'n8n-nodes-base.emailSend': {
    type: 'smtp',
    displayName: 'SMTP',
    instructions: 'Configure SMTP server settings to send emails from n8n.',
    steps: [
      'Get your SMTP server hostname and port from your email provider',
      'Create an app-specific password if using Gmail or similar',
      'In n8n, create SMTP credentials with host, port, username, and password',
      'Test the connection by sending a test email',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/smtp/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  'n8n-nodes-base.httpRequest': {
    type: 'httpBasicAuth',
    displayName: 'HTTP Basic Authentication',
    instructions: 'Configure username and password for HTTP Basic Auth endpoints.',
    steps: [
      'Obtain your username and password from the service provider',
      'IMPORTANT: Never use personal passwords - create service-specific credentials',
      'In n8n, create "HTTP Basic Auth" credentials',
      'Enter your username and password',
      'Use these credentials in your HTTP Request node',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/httprequest/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  'n8n-nodes-base.airtable': {
    type: 'airtableApi',
    displayName: 'Airtable API',
    instructions: 'Generate a personal access token from your Airtable account.',
    steps: [
      'Go to airtable.com/account and click "Developer hub"',
      'Click "Create new token" under Personal access tokens',
      'Give your token a name and select the required scopes',
      'Add the bases you want to access',
      'Copy the generated token',
      'In n8n, create Airtable API credentials and paste the token',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/airtable/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  'n8n-nodes-base.notion': {
    type: 'notionApi',
    displayName: 'Notion API',
    instructions: 'Create a Notion integration and share pages with it.',
    steps: [
      'Go to notion.so/my-integrations and click "New integration"',
      'Name your integration and select the workspace',
      'Copy the "Internal Integration Token"',
      'In Notion, share the pages you want to access with your integration',
      'In n8n, create Notion API credentials and paste the token',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/notion/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  // Microsoft Excel
  'n8n-nodes-base.microsoftExcel': {
    type: 'microsoftExcelOAuth2Api',
    displayName: 'Microsoft Excel OAuth2',
    instructions: 'Set up OAuth 2.0 credentials in Azure Active Directory to access Excel files in OneDrive or SharePoint.',
    steps: [
      'Go to portal.azure.com and navigate to Azure Active Directory',
      'Click "App registrations" and then "New registration"',
      'Name your application and select supported account types',
      'Add n8n callback URL to redirect URIs',
      'Under "API permissions", add Microsoft Graph permissions (Files.ReadWrite)',
      'Create a client secret under "Certificates & secrets"',
      'Copy the Application (client) ID and client secret',
      'In n8n, create Microsoft Excel OAuth2 credentials',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/microsoft/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  // OpenAI
  'n8n-nodes-base.openAi': {
    type: 'openAiApi',
    displayName: 'OpenAI API',
    instructions: 'Create an API key from your OpenAI account to use GPT and other models.',
    steps: [
      'Go to platform.openai.com and sign in or create an account',
      'Navigate to API Keys section',
      'Click "Create new secret key"',
      'Copy the API key (it won\'t be shown again)',
      'In n8n, create OpenAI API credentials and paste the key',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/openai/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  // Google Gemini (via Google Palm API)
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': {
    type: 'googlePalmApi',
    displayName: 'Google Gemini API',
    instructions: 'Create an API key from Google AI Studio to use Gemini models.',
    steps: [
      'Go to makersuite.google.com (Google AI Studio)',
      'Sign in with your Google account',
      'Click "Get API Key" in the sidebar',
      'Create a new API key or use an existing one',
      'Copy the API key',
      'In n8n, create Google PaLM/Gemini API credentials and paste the key',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/google/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  // Discord
  'n8n-nodes-base.discord': {
    type: 'discordApi',
    displayName: 'Discord API',
    instructions: 'Create a Discord bot and get its token to send messages.',
    steps: [
      'Go to discord.com/developers/applications',
      'Click "New Application" and name your bot',
      'Navigate to the "Bot" tab and click "Add Bot"',
      'Copy the bot token',
      'Enable necessary Intents (Message Content Intent if reading messages)',
      'Invite the bot to your server via OAuth2 > URL Generator',
      'In n8n, create Discord credentials and paste the bot token',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/discord/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  // Telegram
  'n8n-nodes-base.telegram': {
    type: 'telegramApi',
    displayName: 'Telegram Bot API',
    instructions: 'Create a Telegram bot via BotFather to send and receive messages.',
    steps: [
      'Open Telegram and search for @BotFather',
      'Send /newbot to create a new bot',
      'Follow the prompts to name your bot',
      'Copy the HTTP API token provided',
      'In n8n, create Telegram API credentials and paste the token',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/telegram/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  // GitHub
  'n8n-nodes-base.github': {
    type: 'githubApi',
    displayName: 'GitHub API',
    instructions: 'Create a personal access token from GitHub to manage repositories and issues.',
    steps: [
      'Go to github.com/settings/tokens',
      'Click "Generate new token (classic)"',
      'Select the scopes you need (repo, workflow, etc.)',
      'Click "Generate token" and copy it',
      'In n8n, create GitHub credentials and paste the token',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/github/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  // AWS S3
  'n8n-nodes-base.awsS3': {
    type: 'aws',
    displayName: 'AWS S3',
    instructions: 'Create an IAM user with S3 permissions and get access keys.',
    steps: [
      'Sign in to AWS Console and go to IAM',
      'Create a new user or use an existing one',
      'Attach the AmazonS3FullAccess policy (or more restrictive)',
      'Create access keys for the user',
      'Copy the Access Key ID and Secret Access Key',
      'In n8n, create AWS credentials with these values',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/aws/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  // MongoDB
  'n8n-nodes-base.mongoDb': {
    type: 'mongoDb',
    displayName: 'MongoDB',
    instructions: 'Get your MongoDB connection string from your database provider.',
    steps: [
      'Get your MongoDB connection string from MongoDB Atlas or your host',
      'The format is: mongodb+srv://user:password@cluster.mongodb.net/database',
      'In n8n, create MongoDB credentials with the connection string',
      'Test the connection to verify access',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/mongodb/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
  // Postgres
  'n8n-nodes-base.postgres': {
    type: 'postgres',
    displayName: 'PostgreSQL',
    instructions: 'Get your PostgreSQL connection details from your database administrator.',
    steps: [
      'Get your database host, port, database name, username, and password',
      'Ensure the database allows connections from your n8n instance IP',
      'In n8n, create Postgres credentials with these values',
      'Optionally enable SSL if required',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/postgres/',
    contactInfo: 'Contact your IT administrator or email support@rise.com for help',
  },
};

/**
 * Simple workflow generator that creates n8n workflows from descriptions
 * In production, this would use Gemini AI to generate workflows
 * For now, it generates a simple workflow based on keywords in the description
 */
export class WorkflowGeneratorService {
  // Track generations that should be cancelled
  private cancelledGenerations: Set<string> = new Set();

  /**
   * Discover nodes from an n8n instance, using cache if available
   * Returns nodes and whether they came from cache
   */
  async discoverNodes(
    n8nUrl: string,
    apiKey: string
  ): Promise<{ nodes: N8nNode[]; fromCache: boolean; nodeCount: number }> {
    const baseUrl = n8nUrl.replace(/\/$/, '');

    // Check if we have valid cached nodes
    const cachedData = await prisma.nodeCache.findUnique({
      where: { n8nUrl: baseUrl },
    });

    if (cachedData && new Date() < cachedData.expiresAt) {
      console.log(`Using cached nodes for ${baseUrl} (${(cachedData.nodesJson as unknown as N8nNode[]).length} nodes)`);
      const nodes = cachedData.nodesJson as unknown as N8nNode[];
      return { nodes, fromCache: true, nodeCount: nodes.length };
    }

    // Fetch nodes from n8n instance
    try {
      console.log(`Fetching nodes from ${baseUrl}...`);
      const response = await axios.get(`${baseUrl}/api/v1/nodes`, {
        headers: {
          'X-N8N-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const nodes: N8nNode[] = response.data.data || [];
      console.log(`Discovered ${nodes.length} nodes from ${baseUrl}`);

      // Cache the nodes
      const expiresAt = new Date(Date.now() + NODE_CACHE_TTL_MS);
      await prisma.nodeCache.upsert({
        where: { n8nUrl: baseUrl },
        update: {
          nodesJson: nodes as any,
          cachedAt: new Date(),
          expiresAt,
        },
        create: {
          n8nUrl: baseUrl,
          nodesJson: nodes as any,
          cachedAt: new Date(),
          expiresAt,
        },
      });

      return { nodes, fromCache: false, nodeCount: nodes.length };
    } catch (error: any) {
      console.error('Failed to discover nodes:', error.response?.data || error.message);

      // If we have expired cache, use it as fallback
      if (cachedData) {
        console.log(`Using expired cache as fallback for ${baseUrl}`);
        const nodes = cachedData.nodesJson as unknown as N8nNode[];
        return { nodes, fromCache: true, nodeCount: nodes.length };
      }

      // Return empty array if no cache available - workflow generation will proceed without node info
      console.log('No cached nodes available, proceeding without node discovery');
      return { nodes: [], fromCache: false, nodeCount: 0 };
    }
  }

  /**
   * Clear node cache for a specific n8n instance
   */
  async clearNodeCache(n8nUrl: string): Promise<void> {
    const baseUrl = n8nUrl.replace(/\/$/, '');
    await prisma.nodeCache.deleteMany({
      where: { n8nUrl: baseUrl },
    });
    // Also clear in-memory node type details cache
    nodeTypeDetailsCache.delete(baseUrl);
    console.log(`Cleared node cache for ${baseUrl}`);
  }

  /**
   * Fetch detailed node type information including parameters/properties
   * This helps the AI generate workflows with correct node configurations
   */
  async fetchNodeTypeDetails(
    n8nUrl: string,
    apiKey: string,
    nodeTypes: string[]
  ): Promise<Map<string, NodeTypeDetails>> {
    const baseUrl = n8nUrl.replace(/\/$/, '');
    const now = Date.now();

    // Check in-memory cache first
    const cachedEntry = nodeTypeDetailsCache.get(baseUrl);
    if (cachedEntry && cachedEntry.expiresAt > now) {
      console.log(`Using cached node type details for ${baseUrl}`);
      // Filter to only requested node types
      const filteredDetails = new Map<string, NodeTypeDetails>();
      for (const nodeType of nodeTypes) {
        const details = cachedEntry.details.get(nodeType);
        if (details) {
          filteredDetails.set(nodeType, details);
        }
      }
      return filteredDetails;
    }

    // Fetch node type details from n8n API
    const nodeTypeDetailsMap = new Map<string, NodeTypeDetails>();

    try {
      console.log(`Fetching node type details from ${baseUrl}...`);

      // n8n provides node type details via /api/v1/node-types endpoint
      // This returns detailed information about each node including its properties/parameters
      const response = await axios.get(`${baseUrl}/api/v1/node-types`, {
        headers: {
          'X-N8N-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // Longer timeout as this is a larger response
      });

      const nodeTypesData = response.data.data || response.data || [];

      // Process and store node type details
      for (const nodeType of nodeTypesData) {
        if (!nodeType.name) continue;

        const details: NodeTypeDetails = {
          name: nodeType.name,
          displayName: nodeType.displayName || nodeType.name,
          description: nodeType.description,
          version: nodeType.version || 1,
          properties: this.extractNodeProperties(nodeType.properties || []),
          credentials: nodeType.credentials || [],
        };

        nodeTypeDetailsMap.set(nodeType.name, details);
      }

      // Cache all node type details
      nodeTypeDetailsCache.set(baseUrl, {
        details: nodeTypeDetailsMap,
        expiresAt: now + NODE_TYPES_CACHE_TTL_MS,
      });

      console.log(`Cached ${nodeTypeDetailsMap.size} node type details for ${baseUrl}`);

      // Return only the requested node types
      const filteredDetails = new Map<string, NodeTypeDetails>();
      for (const nodeType of nodeTypes) {
        const details = nodeTypeDetailsMap.get(nodeType);
        if (details) {
          filteredDetails.set(nodeType, details);
        }
      }

      return filteredDetails;
    } catch (error: any) {
      console.warn('Failed to fetch node type details:', error.response?.status || error.message);

      // Fall back to basic built-in node configurations
      return this.getBuiltInNodeConfigs(nodeTypes);
    }
  }

  /**
   * Extract relevant properties from n8n node schema
   */
  private extractNodeProperties(properties: any[]): NodeProperty[] {
    if (!Array.isArray(properties)) return [];

    return properties
      .filter((prop: any) => prop.name && prop.displayName)
      .slice(0, 20) // Limit to first 20 properties to keep context manageable
      .map((prop: any) => ({
        name: prop.name,
        displayName: prop.displayName,
        type: prop.type || 'string',
        default: prop.default,
        description: prop.description?.slice(0, 200), // Truncate long descriptions
        required: prop.required || false,
        options: prop.options?.slice(0, 10)?.map((opt: any) => ({
          name: opt.name || opt.value,
          value: opt.value,
          description: opt.description?.slice(0, 100),
        })),
      }));
  }

  /**
   * Get built-in node configurations for common nodes
   * Used as fallback when n8n API doesn't return detailed info
   */
  private getBuiltInNodeConfigs(nodeTypes: string[]): Map<string, NodeTypeDetails> {
    const builtIn = new Map<string, NodeTypeDetails>();

    const configs: Record<string, NodeTypeDetails> = {
      'n8n-nodes-base.httpRequest': {
        name: 'n8n-nodes-base.httpRequest',
        displayName: 'HTTP Request',
        description: 'Make HTTP requests to any URL',
        version: 4,
        properties: [
          { name: 'method', displayName: 'Method', type: 'options', options: [
            { name: 'GET', value: 'GET' }, { name: 'POST', value: 'POST' },
            { name: 'PUT', value: 'PUT' }, { name: 'DELETE', value: 'DELETE' },
            { name: 'PATCH', value: 'PATCH' }, { name: 'HEAD', value: 'HEAD' },
          ]},
          { name: 'url', displayName: 'URL', type: 'string', required: true },
          { name: 'sendBody', displayName: 'Send Body', type: 'boolean', default: false },
          { name: 'bodyParameters', displayName: 'Body Parameters', type: 'fixedCollection' },
          { name: 'sendHeaders', displayName: 'Send Headers', type: 'boolean', default: false },
          { name: 'headerParameters', displayName: 'Header Parameters', type: 'fixedCollection' },
          { name: 'sendQuery', displayName: 'Send Query Parameters', type: 'boolean', default: false },
          { name: 'queryParameters', displayName: 'Query Parameters', type: 'fixedCollection' },
        ],
      },
      'n8n-nodes-base.slack': {
        name: 'n8n-nodes-base.slack',
        displayName: 'Slack',
        description: 'Send messages and interact with Slack',
        version: 2,
        properties: [
          { name: 'resource', displayName: 'Resource', type: 'options', options: [
            { name: 'Message', value: 'message' }, { name: 'Channel', value: 'channel' },
            { name: 'File', value: 'file' }, { name: 'Reaction', value: 'reaction' },
            { name: 'User', value: 'user' },
          ]},
          { name: 'operation', displayName: 'Operation', type: 'options', options: [
            { name: 'Post', value: 'post' }, { name: 'Update', value: 'update' },
            { name: 'Delete', value: 'delete' }, { name: 'Get Permalink', value: 'getPermalink' },
          ]},
          { name: 'channel', displayName: 'Channel', type: 'string', required: true, description: 'Channel ID (e.g., C0123456789) or name (e.g., #general)' },
          { name: 'text', displayName: 'Text', type: 'string', required: true },
          { name: 'attachments', displayName: 'Attachments', type: 'json' },
          { name: 'blocksUi', displayName: 'Blocks', type: 'fixedCollection' },
        ],
        credentials: [{ name: 'slackApi', required: true }],
      },
      'n8n-nodes-base.gmail': {
        name: 'n8n-nodes-base.gmail',
        displayName: 'Gmail',
        description: 'Send and receive emails through Gmail',
        version: 2,
        properties: [
          { name: 'resource', displayName: 'Resource', type: 'options', options: [
            { name: 'Message', value: 'message' }, { name: 'Thread', value: 'thread' },
            { name: 'Label', value: 'label' }, { name: 'Draft', value: 'draft' },
          ]},
          { name: 'operation', displayName: 'Operation', type: 'options', options: [
            { name: 'Get All', value: 'getAll' }, { name: 'Get', value: 'get' },
            { name: 'Send', value: 'send' }, { name: 'Delete', value: 'delete' },
            { name: 'Mark as Read', value: 'markRead' }, { name: 'Mark as Unread', value: 'markUnread' },
            { name: 'Add Labels', value: 'addLabels' }, { name: 'Remove Labels', value: 'removeLabels' },
          ]},
          { name: 'limit', displayName: 'Limit', type: 'number', default: 50 },
          { name: 'filters', displayName: 'Filters', type: 'collection', description: 'Query filter (e.g., from:user@example.com newer_than:3d)' },
          { name: 'labelIds', displayName: 'Label IDs', type: 'multiOptions' },
        ],
        credentials: [{ name: 'gmailOAuth2', required: true }],
      },
      'n8n-nodes-base.googleSheets': {
        name: 'n8n-nodes-base.googleSheets',
        displayName: 'Google Sheets',
        description: 'Read and write data to Google Sheets',
        version: 4,
        properties: [
          { name: 'operation', displayName: 'Operation', type: 'options', options: [
            { name: 'Read', value: 'read' }, { name: 'Append', value: 'append' },
            { name: 'Update', value: 'update' }, { name: 'Clear', value: 'clear' },
            { name: 'Delete', value: 'delete' },
          ]},
          { name: 'documentId', displayName: 'Spreadsheet ID', type: 'resourceLocator', required: true },
          { name: 'sheetName', displayName: 'Sheet Name', type: 'resourceLocator', required: true },
          { name: 'range', displayName: 'Range', type: 'string', description: 'Cell range (e.g., A1:D10)' },
          { name: 'options', displayName: 'Options', type: 'collection' },
        ],
        credentials: [{ name: 'googleSheetsOAuth2Api', required: true }],
      },
      'n8n-nodes-base.set': {
        name: 'n8n-nodes-base.set',
        displayName: 'Set',
        description: 'Set and modify data fields',
        version: 3,
        properties: [
          { name: 'mode', displayName: 'Mode', type: 'options', options: [
            { name: 'Manual', value: 'manual' }, { name: 'Raw JSON', value: 'raw' },
          ]},
          { name: 'duplicateItem', displayName: 'Duplicate Item', type: 'boolean', default: false },
          { name: 'assignments', displayName: 'Assignments', type: 'fixedCollection' },
        ],
      },
      'n8n-nodes-base.if': {
        name: 'n8n-nodes-base.if',
        displayName: 'IF',
        description: 'Route data based on conditions',
        version: 1,
        properties: [
          { name: 'conditions', displayName: 'Conditions', type: 'fixedCollection', description: 'Define conditions using boolean, number, or string comparisons' },
          { name: 'combineOperation', displayName: 'Combine', type: 'options', options: [
            { name: 'AND', value: 'and' }, { name: 'OR', value: 'or' },
          ]},
        ],
      },
      'n8n-nodes-base.code': {
        name: 'n8n-nodes-base.code',
        displayName: 'Code',
        description: 'Execute custom JavaScript code',
        version: 2,
        properties: [
          { name: 'mode', displayName: 'Mode', type: 'options', options: [
            { name: 'Run Once for All Items', value: 'runOnceForAllItems' },
            { name: 'Run Once for Each Item', value: 'runOnceForEachItem' },
          ]},
          { name: 'jsCode', displayName: 'JavaScript Code', type: 'string', description: 'Use $input.all() to get all items, return array of { json: {...} } objects' },
        ],
      },
      'n8n-nodes-base.filter': {
        name: 'n8n-nodes-base.filter',
        displayName: 'Filter',
        description: 'Filter items based on conditions',
        version: 1,
        properties: [
          { name: 'conditions', displayName: 'Conditions', type: 'fixedCollection' },
          { name: 'combineOperation', displayName: 'Combine', type: 'options', options: [
            { name: 'AND', value: 'and' }, { name: 'OR', value: 'or' },
          ]},
        ],
      },
      'n8n-nodes-base.webhook': {
        name: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        description: 'Create webhooks to trigger workflows via HTTP requests',
        version: 1,
        properties: [
          { name: 'httpMethod', displayName: 'HTTP Method', type: 'options', options: [
            { name: 'GET', value: 'GET' }, { name: 'POST', value: 'POST' },
            { name: 'DELETE', value: 'DELETE' }, { name: 'PUT', value: 'PUT' },
          ]},
          { name: 'path', displayName: 'Path', type: 'string', required: true },
          { name: 'responseMode', displayName: 'Respond', type: 'options', options: [
            { name: 'Immediately', value: 'onReceived' },
            { name: 'When Last Node Finishes', value: 'lastNode' },
          ]},
        ],
      },
      'n8n-nodes-base.emailSend': {
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
      // Excel / Microsoft Excel node
      'n8n-nodes-base.microsoftExcel': {
        name: 'n8n-nodes-base.microsoftExcel',
        displayName: 'Microsoft Excel',
        description: 'Read, create, and modify Microsoft Excel spreadsheets in OneDrive or SharePoint',
        version: 2,
        properties: [
          { name: 'resource', displayName: 'Resource', type: 'options', options: [
            { name: 'Table', value: 'table' }, { name: 'Workbook', value: 'workbook' },
            { name: 'Worksheet', value: 'worksheet' },
          ]},
          { name: 'operation', displayName: 'Operation', type: 'options', options: [
            { name: 'Append', value: 'append' }, { name: 'Delete', value: 'delete' },
            { name: 'Get All Rows', value: 'getAll' }, { name: 'Get Columns', value: 'getColumns' },
            { name: 'Lookup', value: 'lookup' }, { name: 'Update', value: 'update' },
          ]},
          { name: 'workbook', displayName: 'Workbook', type: 'resourceLocator', required: true },
          { name: 'worksheet', displayName: 'Worksheet', type: 'resourceLocator', required: true },
          { name: 'tableId', displayName: 'Table', type: 'resourceLocator' },
        ],
        credentials: [{ name: 'microsoftExcelOAuth2Api', required: true }],
      },
      // Spreadsheet File node (for local Excel/CSV files)
      'n8n-nodes-base.spreadsheetFile': {
        name: 'n8n-nodes-base.spreadsheetFile',
        displayName: 'Spreadsheet File',
        description: 'Read and write Excel, ODS, HTML, and CSV files',
        version: 2,
        properties: [
          { name: 'operation', displayName: 'Operation', type: 'options', options: [
            { name: 'Read From File', value: 'fromFile' },
            { name: 'Write to File', value: 'toFile' },
          ]},
          { name: 'fileFormat', displayName: 'File Format', type: 'options', options: [
            { name: 'Autodetect', value: 'autodetect' },
            { name: 'CSV', value: 'csv' },
            { name: 'HTML', value: 'html' },
            { name: 'ODS', value: 'ods' },
            { name: 'RTF', value: 'rtf' },
            { name: 'XLSX', value: 'xlsx' },
          ]},
          { name: 'options', displayName: 'Options', type: 'collection' },
        ],
      },
      // OpenAI node
      'n8n-nodes-base.openAi': {
        name: 'n8n-nodes-base.openAi',
        displayName: 'OpenAI',
        description: 'Interact with OpenAI API for text generation, chat, images, and more',
        version: 1,
        properties: [
          { name: 'resource', displayName: 'Resource', type: 'options', options: [
            { name: 'Chat', value: 'chat' },
            { name: 'Text', value: 'text' },
            { name: 'Image', value: 'image' },
            { name: 'Audio', value: 'audio' },
          ]},
          { name: 'operation', displayName: 'Operation', type: 'options', options: [
            { name: 'Create', value: 'create' },
            { name: 'Message', value: 'message' },
          ]},
          { name: 'model', displayName: 'Model', type: 'options', options: [
            { name: 'gpt-4', value: 'gpt-4' },
            { name: 'gpt-4-turbo', value: 'gpt-4-turbo' },
            { name: 'gpt-3.5-turbo', value: 'gpt-3.5-turbo' },
          ]},
          { name: 'prompt', displayName: 'Prompt', type: 'string', required: true },
          { name: 'maxTokens', displayName: 'Max Tokens', type: 'number', default: 1000 },
          { name: 'temperature', displayName: 'Temperature', type: 'number', default: 0.7 },
        ],
        credentials: [{ name: 'openAiApi', required: true }],
      },
      // Google Gemini LLM node (LangChain)
      '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': {
        name: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
        displayName: 'Google Gemini Chat Model',
        description: 'Use Google Gemini AI models for chat and text generation',
        version: 1,
        properties: [
          { name: 'model', displayName: 'Model', type: 'options', options: [
            { name: 'gemini-pro', value: 'gemini-pro' },
            { name: 'gemini-pro-vision', value: 'gemini-pro-vision' },
          ]},
          { name: 'options', displayName: 'Options', type: 'collection' },
        ],
        credentials: [{ name: 'googlePalmApi', required: true }],
      },
      // LLM Chain node (LangChain)
      '@n8n/n8n-nodes-langchain.chainLlm': {
        name: '@n8n/n8n-nodes-langchain.chainLlm',
        displayName: 'LLM Chain',
        description: 'Execute prompts with language models',
        version: 1,
        properties: [
          { name: 'prompt', displayName: 'Prompt', type: 'string', required: true },
          { name: 'options', displayName: 'Options', type: 'collection' },
        ],
      },
      // Summarization Chain node (LangChain)
      '@n8n/n8n-nodes-langchain.chainSummarization': {
        name: '@n8n/n8n-nodes-langchain.chainSummarization',
        displayName: 'Summarization Chain',
        description: 'Summarize text using AI language models',
        version: 1,
        properties: [
          { name: 'type', displayName: 'Type', type: 'options', options: [
            { name: 'Map Reduce', value: 'map_reduce' },
            { name: 'Stuff', value: 'stuff' },
            { name: 'Refine', value: 'refine' },
          ]},
          { name: 'options', displayName: 'Options', type: 'collection' },
        ],
      },
      // Merge node
      'n8n-nodes-base.merge': {
        name: 'n8n-nodes-base.merge',
        displayName: 'Merge',
        description: 'Merge data from multiple sources',
        version: 2,
        properties: [
          { name: 'mode', displayName: 'Mode', type: 'options', options: [
            { name: 'Append', value: 'append' },
            { name: 'Combine', value: 'combine' },
            { name: 'Choose Branch', value: 'chooseBranch' },
          ]},
          { name: 'joinMode', displayName: 'Join Mode', type: 'options', options: [
            { name: 'Inner Join', value: 'inner' },
            { name: 'Left Join', value: 'left' },
            { name: 'Outer Join', value: 'outer' },
          ]},
        ],
      },
      // Split In Batches node
      'n8n-nodes-base.splitInBatches': {
        name: 'n8n-nodes-base.splitInBatches',
        displayName: 'Split In Batches',
        description: 'Process items in batches (loop)',
        version: 3,
        properties: [
          { name: 'batchSize', displayName: 'Batch Size', type: 'number', default: 10 },
          { name: 'options', displayName: 'Options', type: 'collection' },
        ],
      },
      // Aggregate node
      'n8n-nodes-base.aggregate': {
        name: 'n8n-nodes-base.aggregate',
        displayName: 'Aggregate',
        description: 'Combine items into a single item with aggregated values',
        version: 1,
        properties: [
          { name: 'aggregate', displayName: 'Aggregate', type: 'options', options: [
            { name: 'All Items', value: 'aggregateAllItemData' },
            { name: 'Individual Fields', value: 'aggregateIndividualFields' },
          ]},
        ],
      },
      // Wait node
      'n8n-nodes-base.wait': {
        name: 'n8n-nodes-base.wait',
        displayName: 'Wait',
        description: 'Wait for a specified time or until a webhook is called',
        version: 1,
        properties: [
          { name: 'resume', displayName: 'Resume', type: 'options', options: [
            { name: 'After Time Interval', value: 'timeInterval' },
            { name: 'At Specified Time', value: 'specificTime' },
            { name: 'On Webhook Call', value: 'webhook' },
          ]},
          { name: 'amount', displayName: 'Wait Amount', type: 'number', default: 1 },
          { name: 'unit', displayName: 'Wait Unit', type: 'options', options: [
            { name: 'Seconds', value: 'seconds' },
            { name: 'Minutes', value: 'minutes' },
            { name: 'Hours', value: 'hours' },
            { name: 'Days', value: 'days' },
          ]},
        ],
      },
    };

    for (const nodeType of nodeTypes) {
      const config = configs[nodeType];
      if (config) {
        builtIn.set(nodeType, config);
      }
    }

    return builtIn;
  }

  /**
   * Detect which node types are likely needed based on description keywords
   * This helps us fetch relevant node configurations before AI generation
   * Updated to include Excel, AI/LLM nodes, and more n8n node types
   */
  private detectRelevantNodeTypes(description: string): string[] {
    const lowerDesc = description.toLowerCase();
    const nodeTypes: Set<string> = new Set();

    // Always include common utility nodes
    nodeTypes.add('n8n-nodes-base.manualTrigger');
    nodeTypes.add('n8n-nodes-base.set');

    // Comprehensive keyword to node type mapping
    const keywordMap: Array<{ keywords: string[]; nodeType: string }> = [
      // Triggers
      { keywords: ['webhook', 'http trigger', 'incoming'], nodeType: 'n8n-nodes-base.webhook' },
      { keywords: ['schedule', 'cron', 'timer', 'every day', 'every hour', 'daily', 'hourly', 'weekly'], nodeType: 'n8n-nodes-base.scheduleTrigger' },

      // HTTP & API
      { keywords: ['http', 'request', 'api call', 'fetch', 'url', 'rest api', 'endpoint'], nodeType: 'n8n-nodes-base.httpRequest' },

      // Communication
      { keywords: ['slack', 'message slack', 'slack channel', 'slack message'], nodeType: 'n8n-nodes-base.slack' },
      { keywords: ['email', 'gmail', 'inbox', 'mail', 'outlook', 'imap'], nodeType: 'n8n-nodes-base.gmail' },
      { keywords: ['send email', 'smtp', 'mail send'], nodeType: 'n8n-nodes-base.emailSend' },
      { keywords: ['microsoft outlook', 'outlook email'], nodeType: 'n8n-nodes-base.microsoftOutlook' },
      { keywords: ['discord', 'discord message'], nodeType: 'n8n-nodes-base.discord' },
      { keywords: ['telegram', 'telegram message'], nodeType: 'n8n-nodes-base.telegram' },
      { keywords: ['twitter', 'tweet', 'x.com', 'post tweet'], nodeType: 'n8n-nodes-base.twitter' },
      { keywords: ['twilio', 'sms', 'text message', 'send sms'], nodeType: 'n8n-nodes-base.twilio' },

      // Spreadsheets & Documents
      { keywords: ['google sheet', 'spreadsheet', 'sheets', 'google sheets'], nodeType: 'n8n-nodes-base.googleSheets' },
      { keywords: ['excel', 'xlsx', 'xls', 'microsoft excel'], nodeType: 'n8n-nodes-base.microsoftExcel' },
      { keywords: ['spreadsheet file', 'read excel', 'write excel', 'csv file', 'csv'], nodeType: 'n8n-nodes-base.spreadsheetFile' },
      { keywords: ['google drive', 'drive file', 'google docs'], nodeType: 'n8n-nodes-base.googleDrive' },
      { keywords: ['dropbox', 'dropbox file'], nodeType: 'n8n-nodes-base.dropbox' },
      { keywords: ['pdf', 'pdf file', 'extract pdf'], nodeType: 'n8n-nodes-base.readPdf' },

      // AI/LLM Nodes (important for Gemini, OpenAI, etc.)
      { keywords: ['openai', 'gpt', 'chatgpt', 'gpt-4', 'gpt-3'], nodeType: 'n8n-nodes-base.openAi' },
      { keywords: ['gemini', 'google ai', 'palm', 'bard'], nodeType: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini' },
      { keywords: ['ai', 'artificial intelligence', 'llm', 'language model', 'chat ai'], nodeType: '@n8n/n8n-nodes-langchain.chainLlm' },
      { keywords: ['summarize', 'summarization', 'summary ai', 'ai summary'], nodeType: '@n8n/n8n-nodes-langchain.chainSummarization' },
      { keywords: ['text generation', 'generate text', 'ai text'], nodeType: '@n8n/n8n-nodes-langchain.textSplitter' },
      { keywords: ['embedding', 'vector', 'semantic search'], nodeType: '@n8n/n8n-nodes-langchain.embeddings' },
      { keywords: ['anthropic', 'claude'], nodeType: '@n8n/n8n-nodes-langchain.lmChatAnthropic' },
      { keywords: ['azure openai'], nodeType: '@n8n/n8n-nodes-langchain.lmChatAzureOpenAi' },

      // Project Management & Productivity
      { keywords: ['airtable', 'airtable base'], nodeType: 'n8n-nodes-base.airtable' },
      { keywords: ['notion', 'notion page', 'notion database'], nodeType: 'n8n-nodes-base.notion' },
      { keywords: ['github', 'repo', 'repository', 'git', 'pull request', 'issue'], nodeType: 'n8n-nodes-base.github' },
      { keywords: ['gitlab', 'gitlab project'], nodeType: 'n8n-nodes-base.gitlab' },
      { keywords: ['jira', 'jira issue', 'jira ticket'], nodeType: 'n8n-nodes-base.jira' },
      { keywords: ['trello', 'trello board', 'trello card'], nodeType: 'n8n-nodes-base.trello' },
      { keywords: ['asana', 'asana task', 'asana project'], nodeType: 'n8n-nodes-base.asana' },
      { keywords: ['monday', 'monday.com', 'monday board'], nodeType: 'n8n-nodes-base.mondayCom' },
      { keywords: ['clickup', 'clickup task'], nodeType: 'n8n-nodes-base.clickUp' },
      { keywords: ['todoist', 'todoist task'], nodeType: 'n8n-nodes-base.todoist' },

      // CRM & Sales
      { keywords: ['hubspot', 'hubspot crm', 'hubspot contact'], nodeType: 'n8n-nodes-base.hubspot' },
      { keywords: ['salesforce', 'salesforce crm', 'salesforce lead'], nodeType: 'n8n-nodes-base.salesforce' },
      { keywords: ['pipedrive', 'pipedrive deal'], nodeType: 'n8n-nodes-base.pipedrive' },
      { keywords: ['zoho', 'zoho crm'], nodeType: 'n8n-nodes-base.zohoCrm' },

      // Databases
      { keywords: ['postgres', 'postgresql', 'database', 'sql'], nodeType: 'n8n-nodes-base.postgres' },
      { keywords: ['mysql', 'mariadb'], nodeType: 'n8n-nodes-base.mySql' },
      { keywords: ['mongodb', 'mongo', 'nosql'], nodeType: 'n8n-nodes-base.mongoDb' },
      { keywords: ['redis', 'redis cache'], nodeType: 'n8n-nodes-base.redis' },
      { keywords: ['elasticsearch', 'elastic'], nodeType: 'n8n-nodes-base.elasticsearch' },
      { keywords: ['supabase'], nodeType: 'n8n-nodes-base.supabase' },
      { keywords: ['firebase', 'firestore'], nodeType: 'n8n-nodes-base.googleFirebaseCloudFirestore' },

      // Cloud Services
      { keywords: ['aws', 's3', 'bucket', 'amazon s3'], nodeType: 'n8n-nodes-base.awsS3' },
      { keywords: ['aws lambda', 'lambda function'], nodeType: 'n8n-nodes-base.awsLambda' },
      { keywords: ['google cloud', 'gcp', 'cloud storage'], nodeType: 'n8n-nodes-base.googleCloudStorage' },
      { keywords: ['azure', 'azure blob'], nodeType: 'n8n-nodes-base.microsoftAzureBlobStorage' },

      // Payments
      { keywords: ['stripe', 'payment', 'stripe payment'], nodeType: 'n8n-nodes-base.stripe' },
      { keywords: ['paypal', 'paypal payment'], nodeType: 'n8n-nodes-base.payPal' },
      { keywords: ['square', 'square payment'], nodeType: 'n8n-nodes-base.square' },

      // Logic & Flow Control
      { keywords: ['if', 'condition', 'branch', 'when', 'conditional'], nodeType: 'n8n-nodes-base.if' },
      { keywords: ['switch', 'multiple branch', 'route', 'case'], nodeType: 'n8n-nodes-base.switch' },
      { keywords: ['loop', 'each', 'iterate', 'batch', 'for each'], nodeType: 'n8n-nodes-base.splitInBatches' },
      { keywords: ['filter', 'remove', 'exclude', 'only', 'keep'], nodeType: 'n8n-nodes-base.filter' },
      { keywords: ['sort', 'order', 'arrange'], nodeType: 'n8n-nodes-base.sort' },
      { keywords: ['limit', 'limit items'], nodeType: 'n8n-nodes-base.limit' },
      { keywords: ['remove duplicates', 'dedupe', 'unique'], nodeType: 'n8n-nodes-base.removeDuplicates' },

      // Data Transformation
      { keywords: ['code', 'javascript', 'script', 'custom code', 'function'], nodeType: 'n8n-nodes-base.code' },
      { keywords: ['merge', 'combine', 'join', 'merge data'], nodeType: 'n8n-nodes-base.merge' },
      { keywords: ['aggregate', 'count', 'sum', 'average', 'statistics'], nodeType: 'n8n-nodes-base.aggregate' },
      { keywords: ['summarize data', 'group by'], nodeType: 'n8n-nodes-base.summarize' },
      { keywords: ['split', 'split out', 'unnest'], nodeType: 'n8n-nodes-base.splitOut' },
      { keywords: ['wait', 'delay', 'pause', 'sleep'], nodeType: 'n8n-nodes-base.wait' },
      { keywords: ['date', 'time', 'datetime', 'format date'], nodeType: 'n8n-nodes-base.dateTime' },
      { keywords: ['html', 'extract html', 'html parse'], nodeType: 'n8n-nodes-base.html' },
      { keywords: ['xml', 'parse xml'], nodeType: 'n8n-nodes-base.xml' },
      { keywords: ['json', 'parse json', 'json transform'], nodeType: 'n8n-nodes-base.set' },
      { keywords: ['markdown', 'convert markdown'], nodeType: 'n8n-nodes-base.markdown' },

      // Form & Data Collection
      { keywords: ['google forms', 'form response'], nodeType: 'n8n-nodes-base.googleFormsTrigger' },
      { keywords: ['typeform', 'typeform response'], nodeType: 'n8n-nodes-base.typeformTrigger' },
      { keywords: ['jotform', 'jotform response'], nodeType: 'n8n-nodes-base.jotFormTrigger' },

      // E-commerce
      { keywords: ['shopify', 'shopify order'], nodeType: 'n8n-nodes-base.shopify' },
      { keywords: ['woocommerce', 'woo order'], nodeType: 'n8n-nodes-base.wooCommerce' },
      { keywords: ['magento'], nodeType: 'n8n-nodes-base.magento2' },

      // Marketing
      { keywords: ['mailchimp', 'mailchimp list'], nodeType: 'n8n-nodes-base.mailchimp' },
      { keywords: ['sendgrid', 'sendgrid email'], nodeType: 'n8n-nodes-base.sendGrid' },
      { keywords: ['mailerlite'], nodeType: 'n8n-nodes-base.mailerLite' },

      // Calendar & Scheduling
      { keywords: ['google calendar', 'calendar event'], nodeType: 'n8n-nodes-base.googleCalendar' },
      { keywords: ['calendly', 'calendly event'], nodeType: 'n8n-nodes-base.calendly' },

      // Analytics
      { keywords: ['google analytics', 'analytics'], nodeType: 'n8n-nodes-base.googleAnalytics' },

      // Misc
      { keywords: ['ftp', 'sftp', 'file transfer'], nodeType: 'n8n-nodes-base.ftp' },
      { keywords: ['rss', 'feed', 'rss feed'], nodeType: 'n8n-nodes-base.rssFeedRead' },
      { keywords: ['crypto', 'encrypt', 'decrypt', 'hash'], nodeType: 'n8n-nodes-base.crypto' },
      { keywords: ['qr code', 'generate qr'], nodeType: 'n8n-nodes-base.qrCode' },
    ];

    // Match keywords in description
    for (const { keywords, nodeType } of keywordMap) {
      for (const keyword of keywords) {
        if (lowerDesc.includes(keyword)) {
          nodeTypes.add(nodeType);
          break;
        }
      }
    }

    return Array.from(nodeTypes);
  }

  /**
   * Check for recently created duplicate workflows
   */
  async checkDuplicate(
    userId: string,
    description: string,
  ): Promise<{ isDuplicate: boolean; existingId?: string; createdAt?: Date }> {
    // Look for workflows with the same description in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const existing = await prisma.workflowGeneration.findFirst({
      where: {
        userId,
        workflowDescription: description,
        status: 'success',
        createdAt: { gte: oneHourAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return {
        isDuplicate: true,
        existingId: existing.id,
        createdAt: existing.createdAt,
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Generate a workflow from a description
   */
  async generateWorkflow(
    userId: string,
    instanceId: string,
    description: string,
    socketId?: string,
    skipDuplicateCheck: boolean = false,
    geminiApiKey?: string
  ): Promise<{ generationId: string; duplicateWarning?: { existingId: string; createdAt: Date } }> {
    const startTime = Date.now();

    // Check for duplicate unless explicitly skipped
    if (!skipDuplicateCheck) {
      const duplicateCheck = await this.checkDuplicate(userId, description);
      if (duplicateCheck.isDuplicate) {
        return {
          generationId: '',
          duplicateWarning: {
            existingId: duplicateCheck.existingId!,
            createdAt: duplicateCheck.createdAt!,
          },
        };
      }
    }

    // Get the n8n instance
    const instance = await prisma.n8nInstance.findFirst({
      where: { id: instanceId, userId },
    });

    if (!instance) {
      throw new Error('n8n instance not found');
    }

    // Create the workflow generation record
    const generation = await prisma.workflowGeneration.create({
      data: {
        userId,
        n8nInstanceId: instanceId,
        n8nUrl: instance.url,
        workflowDescription: description,
        status: WorkflowStatus.in_progress,
      },
    });

    // Emit progress event
    this.emitProgress(socketId, generation.id, 'Starting workflow generation...', 10);

    // Run generation asynchronously
    this.runGeneration(generation.id, instance, description, socketId, startTime, geminiApiKey);

    return { generationId: generation.id };
  }

  /**
   * Cancel an in-progress workflow generation
   */
  async cancelGeneration(generationId: string, userId: string, socketId?: string): Promise<boolean> {
    // Verify the generation exists and belongs to the user
    const generation = await prisma.workflowGeneration.findFirst({
      where: { id: generationId, userId },
    });

    if (!generation) {
      throw new Error('Generation not found');
    }

    if (generation.status !== 'in_progress') {
      throw new Error('Generation is not in progress');
    }

    // Mark as cancelled
    this.cancelledGenerations.add(generationId);

    // Update database status
    await prisma.workflowGeneration.update({
      where: { id: generationId },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
        errorMessage: 'Cancelled by user',
      },
    });

    // Emit cancellation event via socket
    if (socketId) {
      io.to(socketId).emit('workflow:cancelled', {
        generationId,
        message: 'Workflow generation cancelled',
      });
    }

    return true;
  }

  /**
   * Check if a generation has been cancelled
   */
  private isCancelled(generationId: string): boolean {
    return this.cancelledGenerations.has(generationId);
  }

  private async runGeneration(
    generationId: string,
    instance: { id: string; url: string; apiKeyEncrypted: string },
    description: string,
    socketId: string | undefined,
    startTime: number,
    geminiApiKey?: string
  ) {
    let createdWorkflowId: string | undefined; // Track created workflow for potential rollback
    let nodesDiscoveredCount: number | undefined;
    let workflow: N8nWorkflow | undefined;
    const apiKey = decrypt(instance.apiKeyEncrypted);
    const hasGeminiKey = !!(geminiApiKey || geminiService.isAvailable());

    // Log generation start with comprehensive details
    workflowLogger.logGenerationStart(
      generationId,
      '', // We don't have userId here directly
      description,
      instance.url,
      hasGeminiKey
    );

    try {
      // Check for cancellation before each step
      if (this.isCancelled(generationId)) {
        workflowLogger.info(generationId, 'CANCELLED', 'Generation cancelled by user before start');
        this.cancelledGenerations.delete(generationId);
        return;
      }

      // Step 1: Discover available nodes (with caching)
      this.emitProgress(socketId, generationId, 'Discovering available nodes...', 15);
      const discoveryResult = await this.discoverNodes(instance.url, apiKey);
      nodesDiscoveredCount = discoveryResult.nodeCount;

      // Log node discovery
      workflowLogger.logNodeDiscovery(
        generationId,
        discoveryResult.nodeCount,
        discoveryResult.fromCache,
        discoveryResult.nodes.map(n => n.name).slice(0, 30)
      );

      // Show different message based on cache status
      if (discoveryResult.fromCache) {
        this.emitProgress(socketId, generationId, `Using cached nodes (${discoveryResult.nodeCount} nodes available)`, 20);
      } else if (discoveryResult.nodeCount > 0) {
        this.emitProgress(socketId, generationId, `Discovered ${discoveryResult.nodeCount} nodes from n8n instance`, 20);
      }

      if (this.isCancelled(generationId)) {
        workflowLogger.info(generationId, 'CANCELLED', 'Generation cancelled after node discovery');
        this.cancelledGenerations.delete(generationId);
        return;
      }

      // Step 2: Analyze description and fetch relevant node configurations
      this.emitProgress(socketId, generationId, 'Analyzing description with AI...', 30);

      if (this.isCancelled(generationId)) {
        this.cancelledGenerations.delete(generationId);
        return;
      }

      // Detect which node types are likely needed based on the description
      const relevantNodeTypes = this.detectRelevantNodeTypes(description);

      // Log detected relevant node types
      workflowLogger.logRelevantNodeTypes(generationId, relevantNodeTypes);
      console.log(`Detected relevant node types: ${relevantNodeTypes.join(', ')}`);

      // Fetch detailed node configurations for those types (Feature #269)
      this.emitProgress(socketId, generationId, 'Fetching node configurations...', 35);
      const nodeTypeDetails = await this.fetchNodeTypeDetails(instance.url, apiKey, relevantNodeTypes);

      workflowLogger.info(generationId, 'NODE_CONFIGS', 'Fetched node type configurations', {
        count: nodeTypeDetails.size,
        nodeTypes: Array.from(nodeTypeDetails.keys()),
      });
      console.log(`Fetched ${nodeTypeDetails.size} node type configurations`);

      if (this.isCancelled(generationId)) {
        this.cancelledGenerations.delete(generationId);
        return;
      }

      this.emitProgress(socketId, generationId, 'Generating workflow with Gemini AI...', 40);

      // Use Gemini AI if available (custom API key or environment key), otherwise fall back to rule-based generation
      let generationMethod: 'AI' | 'RULE_BASED' = 'RULE_BASED';
      let aiExplanation: string | undefined;

      if (hasGeminiKey) {
        try {
          this.emitProgress(socketId, generationId, 'Using Gemini AI to understand your request...', 45);
          workflowLogger.info(generationId, 'AI_GENERATION', 'Starting AI-based workflow generation');

          const aiResult = await geminiService.generateWorkflow(
            description,
            discoveryResult.nodes,
            geminiApiKey, // Pass custom key if provided
            nodeTypeDetails // Pass node configurations to AI
          );
          workflow = aiResult.workflow;
          generationMethod = 'AI';
          aiExplanation = aiResult.explanation;

          workflowLogger.info(generationId, 'AI_SUCCESS', 'AI generation completed', {
            nodeCount: aiResult.nodeCount,
            explanation: aiResult.explanation,
          });
          console.log(`AI generated workflow with ${aiResult.nodeCount} nodes: ${aiResult.explanation}`);
        } catch (aiError: any) {
          workflowLogger.warn(generationId, 'AI_FALLBACK', 'AI generation failed, falling back to rule-based', {
            error: aiError.message,
          });
          console.warn('AI generation failed, falling back to rule-based:', aiError.message);
          this.emitProgress(socketId, generationId, 'AI unavailable, using rule-based generation...', 45);
          workflow = this.generateWorkflowFromDescription(description);
          generationMethod = 'RULE_BASED';
        }
      } else {
        // Fallback to rule-based generation
        this.emitProgress(socketId, generationId, 'Generating workflow (no AI key provided)...', 45);
        workflowLogger.info(generationId, 'RULE_BASED', 'Using rule-based generation (no AI key)');
        workflow = this.generateWorkflowFromDescription(description);
        generationMethod = 'RULE_BASED';
      }

      // Log the generated workflow with all details
      workflowLogger.logGeneratedWorkflow(generationId, workflow, generationMethod, aiExplanation);

      if (this.isCancelled(generationId)) {
        this.cancelledGenerations.delete(generationId);
        return;
      }

      // Step 3: Detect required credentials
      this.emitProgress(socketId, generationId, 'Detecting required credentials...', 50);
      const credentials = this.detectCredentials(workflow.nodes);

      // Log credentials detected
      workflowLogger.logCredentialsDetected(generationId, credentials);
      await this.delay(200);

      if (this.isCancelled(generationId)) {
        this.cancelledGenerations.delete(generationId);
        return;
      }

      // Step 4: Validate workflow JSON before sending to n8n
      this.emitProgress(socketId, generationId, 'Validating workflow structure...', 55);
      const validationResult = this.validateWorkflowJson(workflow);
      if (!validationResult.valid) {
        workflowLogger.error(generationId, 'VALIDATION', 'Workflow validation failed', {
          error: validationResult.error,
        });
        throw new Error(`Invalid workflow: ${validationResult.error}`);
      }

      workflowLogger.info(generationId, 'VALIDATION', 'Workflow validation passed');

      // Estimate AI token usage (simulated - in production this comes from AI API response)
      // Input tokens: ~1 token per 4 characters of description
      // Output tokens: ~1 token per 4 characters of workflow JSON
      const inputTokens = Math.ceil(description.length / 4);
      const outputTokens = Math.ceil(JSON.stringify(workflow).length / 4);
      const aiTokensUsed = inputTokens + outputTokens;

      // Step 5: Create workflow in n8n (with automatic retry for transient failures)
      this.emitProgress(socketId, generationId, 'Creating workflow in n8n...', 60);
      workflowLogger.info(generationId, 'N8N_CREATE', 'Sending workflow to n8n API');

      const n8nResult = await this.createWorkflowInN8n(instance.url, apiKey, workflow, 3, socketId, generationId);

      // Log n8n creation result
      workflowLogger.logN8nCreation(
        generationId,
        n8nResult.success,
        n8nResult.n8nWorkflowId,
        n8nResult.error
      );

      if (!n8nResult.success) {
        throw new Error(n8nResult.error || 'Failed to create workflow in n8n');
      }

      // Track the created workflow ID for potential rollback
      createdWorkflowId = n8nResult.n8nWorkflowId;

      // Step 6: Update generation record with success
      this.emitProgress(socketId, generationId, 'Workflow created successfully!', 100);

      const durationMs = Date.now() - startTime;

      // Log generation completion with analysis
      workflowLogger.logGenerationComplete(generationId, description, workflow, durationMs, true);

      try {
        await prisma.workflowGeneration.update({
          where: { id: generationId },
          data: {
            status: WorkflowStatus.success,
            generatedWorkflowJson: workflow as any,
            n8nWorkflowId: n8nResult.n8nWorkflowId,
            n8nWorkflowUrl: n8nResult.n8nWorkflowUrl,
            nodesDiscoveredCount: nodesDiscoveredCount ?? null,
            nodesUsedCount: workflow.nodes.length,
            credentialsRequired: credentials.length > 0 ? (credentials as any) : undefined,
            aiTokensUsed,
            durationMs,
            completedAt: new Date(),
          },
        });
      } catch (dbError: any) {
        // Database update failed after workflow was created in n8n
        // Attempt rollback by deleting the workflow from n8n
        workflowLogger.error(generationId, 'DB_ERROR', 'Database update failed, attempting rollback', {
          error: dbError.message,
        });
        console.error('Database update failed, attempting rollback:', dbError);
        await this.rollbackWorkflow(instance.url, apiKey, createdWorkflowId ?? '');
        throw new Error('Failed to save workflow record. The workflow has been rolled back.');
      }

      // Emit completion event
      if (socketId) {
        io.to(socketId).emit('workflow:complete', {
          generationId,
          success: true,
          n8nWorkflowId: n8nResult.n8nWorkflowId,
          n8nWorkflowUrl: n8nResult.n8nWorkflowUrl,
          nodesUsed: workflow.nodes.length,
          credentials: credentials.length > 0 ? credentials : undefined,
        });
      }

      // Update instance last used (non-critical, don't rollback on failure)
      try {
        await prisma.n8nInstance.update({
          where: { id: instance.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (instanceUpdateError) {
        console.warn('Failed to update instance last used timestamp:', instanceUpdateError);
        // Non-critical, don't fail the operation
      }
    } catch (error: any) {
      // Log the error
      workflowLogger.error(generationId, 'GENERATION_ERROR', 'Workflow generation failed', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      });
      console.error('Workflow generation error:', error);

      const durationMs = Date.now() - startTime;

      try {
        await prisma.workflowGeneration.update({
          where: { id: generationId },
          data: {
            status: WorkflowStatus.failed,
            errorMessage: error.message || 'Unknown error',
            durationMs,
            completedAt: new Date(),
          },
        });
      } catch (dbError) {
        console.error('Failed to update generation status to failed:', dbError);
        // Even if this fails, we still need to inform the user
      }

      // Emit error event
      if (socketId) {
        io.to(socketId).emit('workflow:error', {
          generationId,
          error: error.message || 'Workflow generation failed',
        });
      }
    }
  }

  /**
   * Rollback a created workflow by deleting it from n8n
   * Called when post-creation operations (like database update) fail
   */
  private async rollbackWorkflow(n8nUrl: string, apiKey: string, workflowId: string): Promise<boolean> {
    const baseUrl = n8nUrl.replace(/\/$/, '');

    try {
      console.log(`Attempting to rollback workflow ${workflowId} from ${baseUrl}`);

      await axios.delete(
        `${baseUrl}/api/v1/workflows/${workflowId}`,
        {
          headers: {
            'X-N8N-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      console.log(`Successfully rolled back workflow ${workflowId}`);
      return true;
    } catch (error: any) {
      // Log but don't throw - rollback is best-effort
      console.error(`Failed to rollback workflow ${workflowId}:`, error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Detect credentials required by workflow nodes
   */
  /**
   * Validate workflow JSON structure before sending to n8n
   */
  private validateWorkflowJson(workflow: N8nWorkflow): { valid: boolean; error?: string } {
    // Check required fields
    if (!workflow.name || typeof workflow.name !== 'string') {
      return { valid: false, error: 'Workflow must have a name' };
    }

    if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      return { valid: false, error: 'Workflow must have at least one node' };
    }

    if (typeof workflow.connections !== 'object') {
      return { valid: false, error: 'Workflow must have connections object' };
    }

    // Validate each node
    for (const node of workflow.nodes) {
      if (!node.id || !node.name || !node.type) {
        return { valid: false, error: `Invalid node: missing required fields (id, name, type)` };
      }

      if (!Array.isArray(node.position) || node.position.length !== 2) {
        return { valid: false, error: `Invalid node ${node.name}: position must be [x, y] array` };
      }

      if (typeof node.parameters !== 'object') {
        return { valid: false, error: `Invalid node ${node.name}: parameters must be an object` };
      }
    }

    // Validate connections reference existing nodes
    const nodeNames = new Set(workflow.nodes.map(n => n.name));
    for (const [sourceName, conn] of Object.entries(workflow.connections)) {
      if (!nodeNames.has(sourceName)) {
        return { valid: false, error: `Connection references non-existent node: ${sourceName}` };
      }

      if (conn.main) {
        for (const branch of conn.main) {
          for (const target of branch) {
            if (!nodeNames.has(target.node)) {
              return { valid: false, error: `Connection references non-existent target node: ${target.node}` };
            }
          }
        }
      }
    }

    return { valid: true };
  }

  private detectCredentials(nodes: WorkflowNode[]): CredentialRequirement[] {
    const credentials: CredentialRequirement[] = [];
    const seenTypes = new Set<string>();

    for (const node of nodes) {
      const credential = CREDENTIAL_MAP[node.type];
      if (credential && !seenTypes.has(credential.type)) {
        seenTypes.add(credential.type);
        credentials.push(credential);
      }
    }

    return credentials;
  }

  /**
   * Check if description requires a complex multi-node workflow
   */
  private isComplexWorkflowRequest(description: string): boolean {
    const lowerDesc = description.toLowerCase();

    // Count how many different services/operations are mentioned
    const services = [
      'webhook', 'google sheets', 'spreadsheet', 'slack', 'email', 'airtable',
      'notion', 'http', 'request', 'conditional', 'branch', 'if', 'switch',
      'filter', 'transform', 'process', 'multiple', 'log'
    ];

    let mentionedServices = 0;
    for (const service of services) {
      if (lowerDesc.includes(service)) {
        mentionedServices++;
      }
    }

    // If 4+ services/operations mentioned, consider it complex
    return mentionedServices >= 4 || lowerDesc.includes('complex');
  }

  /**
   * Generate a complex multi-node workflow with 10+ nodes
   */
  private generateComplexWorkflow(_description: string): N8nWorkflow {
    const workflowName = `Complex Workflow - ${new Date().toISOString().slice(0, 10)}`;
    const nodes: WorkflowNode[] = [];
    const connections: Record<string, WorkflowConnection> = {};

    // Node 0: Webhook Trigger
    nodes.push({
      id: 'node_0',
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        httpMethod: 'POST',
        path: 'workflow-trigger',
        responseMode: 'onReceived',
        responseData: 'allEntries',
      },
    });

    // Node 1: Google Sheets - Fetch data
    nodes.push({
      id: 'node_1',
      name: 'Google Sheets',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4,
      position: [450, 300],
      parameters: {
        operation: 'read',
        documentId: { __rl: true, mode: 'id', value: '' },
        sheetName: { __rl: true, mode: 'name', value: 'Sheet1' },
      },
    });

    // Node 2: Set - Add metadata
    nodes.push({
      id: 'node_2',
      name: 'Add Metadata',
      type: 'n8n-nodes-base.set',
      typeVersion: 3,
      position: [650, 300],
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'a1', name: 'processedAt', value: '={{ $now.toISO() }}', type: 'string' },
            { id: 'a2', name: 'source', value: 'Google Sheets', type: 'string' },
          ],
        },
      },
    });

    // Node 3: IF - Conditional branch
    nodes.push({
      id: 'node_3',
      name: 'Check Condition',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [850, 300],
      parameters: {
        conditions: {
          boolean: [
            {
              value1: '={{ $json.status }}',
              operation: 'equals',
              value2: 'active',
            },
          ],
        },
      },
    });

    // Node 4: Slack - Send success message (true branch)
    nodes.push({
      id: 'node_4',
      name: 'Slack Success',
      type: 'n8n-nodes-base.slack',
      typeVersion: 2,
      position: [1050, 200],
      parameters: {
        operation: 'post',
        channel: '#success',
        text: '✅ Process completed successfully: {{ $json.name }}',
      },
    });

    // Node 5: Email - Send notification (true branch)
    nodes.push({
      id: 'node_5',
      name: 'Email Success',
      type: 'n8n-nodes-base.emailSend',
      typeVersion: 2,
      position: [1250, 200],
      parameters: {
        fromEmail: 'workflow@example.com',
        toEmail: 'team@example.com',
        subject: 'Workflow Success Notification',
        text: 'The workflow completed successfully.',
      },
    });

    // Node 6: Slack - Send error message (false branch)
    nodes.push({
      id: 'node_6',
      name: 'Slack Error',
      type: 'n8n-nodes-base.slack',
      typeVersion: 2,
      position: [1050, 400],
      parameters: {
        operation: 'post',
        channel: '#errors',
        text: '❌ Process failed: {{ $json.name }}',
      },
    });

    // Node 7: Email - Send error notification (false branch)
    nodes.push({
      id: 'node_7',
      name: 'Email Error',
      type: 'n8n-nodes-base.emailSend',
      typeVersion: 2,
      position: [1250, 400],
      parameters: {
        fromEmail: 'workflow@example.com',
        toEmail: 'admin@example.com',
        subject: 'Workflow Error Notification',
        text: 'The workflow encountered an error.',
      },
    });

    // Node 8: Airtable - Log success (merge from success branch)
    nodes.push({
      id: 'node_8',
      name: 'Log to Airtable',
      type: 'n8n-nodes-base.airtable',
      typeVersion: 2,
      position: [1450, 200],
      parameters: {
        operation: 'append',
        application: { __rl: true, mode: 'id', value: '' },
        table: { __rl: true, mode: 'name', value: 'Workflow Logs' },
        options: {},
      },
    });

    // Node 9: Set - Prepare final status
    nodes.push({
      id: 'node_9',
      name: 'Final Status',
      type: 'n8n-nodes-base.set',
      typeVersion: 3,
      position: [1650, 200],
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'f1', name: 'completedAt', value: '={{ $now.toISO() }}', type: 'string' },
            { id: 'f2', name: 'status', value: 'completed', type: 'string' },
          ],
        },
      },
    });

    // Node 10: HTTP Request - Callback
    nodes.push({
      id: 'node_10',
      name: 'Callback',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [1850, 200],
      parameters: {
        method: 'POST',
        url: 'https://example.com/callback',
        sendBody: true,
        bodyParameters: {
          parameters: [
            { name: 'status', value: '={{ $json.status }}' },
            { name: 'completedAt', value: '={{ $json.completedAt }}' },
          ],
        },
      },
    });

    // Define connections for the complex workflow
    connections['Webhook Trigger'] = {
      main: [[{ node: 'Google Sheets', type: 'main', index: 0 }]],
    };
    connections['Google Sheets'] = {
      main: [[{ node: 'Add Metadata', type: 'main', index: 0 }]],
    };
    connections['Add Metadata'] = {
      main: [[{ node: 'Check Condition', type: 'main', index: 0 }]],
    };
    connections['Check Condition'] = {
      main: [
        [{ node: 'Slack Success', type: 'main', index: 0 }],
        [{ node: 'Slack Error', type: 'main', index: 0 }],
      ],
    };
    connections['Slack Success'] = {
      main: [[{ node: 'Email Success', type: 'main', index: 0 }]],
    };
    connections['Email Success'] = {
      main: [[{ node: 'Log to Airtable', type: 'main', index: 0 }]],
    };
    connections['Slack Error'] = {
      main: [[{ node: 'Email Error', type: 'main', index: 0 }]],
    };
    connections['Log to Airtable'] = {
      main: [[{ node: 'Final Status', type: 'main', index: 0 }]],
    };
    connections['Final Status'] = {
      main: [[{ node: 'Callback', type: 'main', index: 0 }]],
    };

    return {
      name: workflowName,
      nodes,
      connections,
      active: true,
      settings: {
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }

  /**
   * Generate a workflow with conditional logic (IF node with true/false branches)
   */
  private generateConditionalWorkflow(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();
    const workflowName = `Conditional Workflow - ${new Date().toISOString().slice(0, 10)}`;
    const nodes: WorkflowNode[] = [];
    const connections: Record<string, WorkflowConnection> = {};

    // Extract condition value from description (look for numbers)
    const numberMatch = description.match(/(\d+)/);
    const conditionValue = numberMatch ? numberMatch[1] : '100';

    // Node 0: Manual Trigger
    nodes.push({
      id: 'node_0',
      name: 'Start',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    });

    // Node 1: IF - Conditional check
    nodes.push({
      id: 'node_1',
      name: 'Check Condition',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [450, 300],
      parameters: {
        conditions: {
          number: [
            {
              value1: '={{ $json.value }}',
              operation: 'larger',
              value2: conditionValue,
            },
          ],
        },
      },
    });

    // Determine true/false branch actions from description
    const hasSlack = lowerDesc.includes('slack');
    const hasEmail = lowerDesc.includes('email');

    // Node 2: True branch action
    if (hasSlack) {
      nodes.push({
        id: 'node_2',
        name: 'Slack (Condition True)',
        type: 'n8n-nodes-base.slack',
        typeVersion: 2,
        position: [650, 200],
        parameters: {
          operation: 'post',
          channel: '#notifications',
          text: '✅ Condition met: value > ' + conditionValue,
        },
      });
    } else {
      nodes.push({
        id: 'node_2',
        name: 'Set True Result',
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        position: [650, 200],
        parameters: {
          mode: 'manual',
          duplicateItem: false,
          assignments: {
            assignments: [
              { id: 't1', name: 'result', value: 'Condition was true', type: 'string' },
            ],
          },
        },
      });
    }

    // Node 3: False branch action
    if (hasEmail) {
      nodes.push({
        id: 'node_3',
        name: 'Send Email (Condition False)',
        type: 'n8n-nodes-base.emailSend',
        typeVersion: 2,
        position: [650, 400],
        parameters: {
          fromEmail: 'workflow@example.com',
          toEmail: 'notifications@example.com',
          subject: 'Condition Not Met',
          text: 'The value did not exceed ' + conditionValue,
        },
      });
    } else if (hasSlack && !hasEmail) {
      nodes.push({
        id: 'node_3',
        name: 'Send Email (Condition False)',
        type: 'n8n-nodes-base.emailSend',
        typeVersion: 2,
        position: [650, 400],
        parameters: {
          fromEmail: 'workflow@example.com',
          toEmail: 'notifications@example.com',
          subject: 'Condition Not Met',
          text: 'The value did not exceed ' + conditionValue,
        },
      });
    } else {
      nodes.push({
        id: 'node_3',
        name: 'Set False Result',
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        position: [650, 400],
        parameters: {
          mode: 'manual',
          duplicateItem: false,
          assignments: {
            assignments: [
              { id: 'f1', name: 'result', value: 'Condition was false', type: 'string' },
            ],
          },
        },
      });
    }

    // Define connections
    connections['Start'] = {
      main: [[{ node: 'Check Condition', type: 'main', index: 0 }]],
    };
    connections['Check Condition'] = {
      main: [
        [{ node: nodes[2].name, type: 'main', index: 0 }],  // true branch
        [{ node: nodes[3].name, type: 'main', index: 0 }],  // false branch
      ],
    };

    return {
      name: workflowName,
      nodes,
      connections,
      active: true,
      settings: {
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }

  /**
   * Generate a workflow with loop/iteration for processing arrays
   */
  private generateLoopWorkflow(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();
    const workflowName = `Loop Workflow - ${new Date().toISOString().slice(0, 10)}`;
    const nodes: WorkflowNode[] = [];
    const connections: Record<string, WorkflowConnection> = {};

    // Node 0: Manual Trigger
    nodes.push({
      id: 'node_0',
      name: 'Start',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    });

    // Node 1: HTTP Request to fetch list
    nodes.push({
      id: 'node_1',
      name: 'Get List from API',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [450, 300],
      parameters: {
        method: 'GET',
        url: 'https://api.example.com/users',
        options: {},
      },
    });

    // Node 2: Split In Batches for iteration
    nodes.push({
      id: 'node_2',
      name: 'Loop Over Items',
      type: 'n8n-nodes-base.splitInBatches',
      typeVersion: 3,
      position: [650, 300],
      parameters: {
        batchSize: 1,
        options: {},
      },
    });

    // Determine what to do with each item
    if (lowerDesc.includes('email')) {
      nodes.push({
        id: 'node_3',
        name: 'Send Email',
        type: 'n8n-nodes-base.emailSend',
        typeVersion: 2,
        position: [850, 300],
        parameters: {
          fromEmail: 'noreply@example.com',
          toEmail: '={{ $json.email }}',
          subject: 'Notification for {{ $json.name }}',
          text: 'Hello {{ $json.name }}, this is an automated notification.',
        },
      });
    } else if (lowerDesc.includes('slack')) {
      nodes.push({
        id: 'node_3',
        name: 'Send Slack Message',
        type: 'n8n-nodes-base.slack',
        typeVersion: 2,
        position: [850, 300],
        parameters: {
          operation: 'post',
          channel: '#notifications',
          text: 'Processing user: {{ $json.name }}',
        },
      });
    } else {
      nodes.push({
        id: 'node_3',
        name: 'Process Item',
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        position: [850, 300],
        parameters: {
          mode: 'manual',
          duplicateItem: false,
          assignments: {
            assignments: [
              { id: 'p1', name: 'processed', value: 'true', type: 'string' },
              { id: 'p2', name: 'processedAt', value: '={{ $now.toISO() }}', type: 'string' },
            ],
          },
        },
      });
    }

    // Node 4: No Operation (to handle completion)
    nodes.push({
      id: 'node_4',
      name: 'Done',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [1050, 300],
      parameters: {},
    });

    // Define connections - Loop back from processing to batch splitter
    connections['Start'] = {
      main: [[{ node: 'Get List from API', type: 'main', index: 0 }]],
    };
    connections['Get List from API'] = {
      main: [[{ node: 'Loop Over Items', type: 'main', index: 0 }]],
    };
    connections['Loop Over Items'] = {
      main: [
        [{ node: nodes[3].name, type: 'main', index: 0 }],  // Process each item
        [{ node: 'Done', type: 'main', index: 0 }],  // Done processing all items
      ],
    };
    connections[nodes[3].name] = {
      main: [[{ node: 'Loop Over Items', type: 'main', index: 0 }]],  // Loop back
    };

    return {
      name: workflowName,
      nodes,
      connections,
      active: true,
      settings: {
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }

  /**
   * Generate a multi-step email processing workflow
   * Handles: get emails -> filter -> mark -> summarize -> send to Slack
   */
  private generateEmailProcessingWorkflow(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();
    const workflowName = `Email Processing Workflow - ${new Date().toISOString().slice(0, 10)}`;
    const nodes: WorkflowNode[] = [];
    const connections: Record<string, WorkflowConnection> = {};

    // Extract sender from description if present (e.g., "from janna trobilo")
    const fromMatch = description.match(/from\s+([a-zA-Z\s]+?)(?:\s+in|\s+last|\s+next|$)/i);
    const senderName = fromMatch ? fromMatch[1].trim() : '';

    // Extract days filter if present (e.g., "last 3 days")
    const daysMatch = description.match(/last\s+(\d+)\s+days?/i);
    const daysFilter = daysMatch ? parseInt(daysMatch[1]) : 7;

    // Extract Slack channel ID if present (e.g., "C0A1CEBJWJF")
    const channelMatch = description.match(/C[A-Z0-9]{8,}/i);
    const slackChannel = channelMatch ? channelMatch[0] : '#general';

    // Node 0: Manual Trigger
    nodes.push({
      id: 'node_0',
      name: 'Start',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    });

    // Node 1: Get Emails from Gmail
    nodes.push({
      id: 'node_1',
      name: 'Get Emails',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2,
      position: [450, 300],
      parameters: {
        operation: 'getAll',
        resource: 'message',
        limit: 100,
        filters: {
          q: senderName ? `from:${senderName} newer_than:${daysFilter}d` : `newer_than:${daysFilter}d`,
        },
        options: {
          returnAll: true,
        },
      },
    });

    connections['Start'] = {
      main: [[{ node: 'Get Emails', type: 'main', index: 0 }]],
    };

    // Node 2: Filter emails by date (additional filtering)
    nodes.push({
      id: 'node_2',
      name: 'Filter by Date',
      type: 'n8n-nodes-base.filter',
      typeVersion: 1,
      position: [650, 300],
      parameters: {
        conditions: {
          boolean: [
            {
              value1: '={{ $json.internalDate > Date.now() - (' + daysFilter + ' * 24 * 60 * 60 * 1000) }}',
              operation: 'isTrue',
            },
          ],
        },
      },
    });

    connections['Get Emails'] = {
      main: [[{ node: 'Filter by Date', type: 'main', index: 0 }]],
    };

    // Node 3: Mark emails as unread (if requested)
    if (lowerDesc.includes('mark') && (lowerDesc.includes('unread') || lowerDesc.includes('read'))) {
      nodes.push({
        id: 'node_3',
        name: 'Mark as Unread',
        type: 'n8n-nodes-base.gmail',
        typeVersion: 2,
        position: [850, 300],
        parameters: {
          operation: 'markUnread',
          resource: 'message',
          messageId: '={{ $json.id }}',
        },
      });

      connections['Filter by Date'] = {
        main: [[{ node: 'Mark as Unread', type: 'main', index: 0 }]],
      };
    }

    // Node 4: Aggregate and Summarize content
    const prevNodeForSummary = nodes[nodes.length - 1].name;
    nodes.push({
      id: `node_${nodes.length}`,
      name: 'Summarize Emails',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1050, 300],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: `// Aggregate all email content for summarization
const items = $input.all();
const emailCount = items.length;

// Collect email snippets/bodies
const emailSummaries = items.map((item, idx) => {
  const email = item.json;
  const subject = email.subject || 'No Subject';
  const snippet = email.snippet || email.textPlain || 'No content';
  const from = email.from?.emailAddress || email.from || 'Unknown';
  const date = email.date || new Date(parseInt(email.internalDate)).toISOString();

  return \`Email \${idx + 1}:
  From: \${from}
  Subject: \${subject}
  Date: \${date}
  Preview: \${snippet.substring(0, 200)}...\`;
}).join('\\n\\n---\\n\\n');

// Create summary (Note: For AI summarization, use Gemini API in production)
const summary = \`📧 Email Summary Report
=========================
Total emails found: \${emailCount}
${senderName ? `From: ${senderName}` : ''}
Time period: Last ${daysFilter} days

\${emailSummaries}

---
Generated at: \${new Date().toISOString()}\`;

return [{ json: { summary, emailCount, sender: '${senderName}' } }];`,
      },
    });

    connections[prevNodeForSummary] = {
      main: [[{ node: 'Summarize Emails', type: 'main', index: 0 }]],
    };

    // Node 5: Send to Slack (if requested)
    if (lowerDesc.includes('slack')) {
      nodes.push({
        id: `node_${nodes.length}`,
        name: 'Send to Slack',
        type: 'n8n-nodes-base.slack',
        typeVersion: 2,
        position: [1250, 300],
        parameters: {
          operation: 'post',
          channel: slackChannel,
          text: '={{ $json.summary }}',
          options: {
            mrkdwn: true,
          },
        },
      });

      connections['Summarize Emails'] = {
        main: [[{ node: 'Send to Slack', type: 'main', index: 0 }]],
      };
    }

    return {
      name: workflowName,
      nodes,
      connections,
      active: true,
      settings: {
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }

  /**
   * Generate a simple workflow based on description keywords
   * In production, this would use Gemini AI
   */
  private generateWorkflowFromDescription(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();

    // Check for multi-step email workflow (emails + process + send somewhere)
    if ((lowerDesc.includes('email') || lowerDesc.includes('gmail')) &&
        (lowerDesc.includes('slack') || lowerDesc.includes('summary') || lowerDesc.includes('summarize'))) {
      return this.generateEmailProcessingWorkflow(description);
    }

    // Check if this is a complex workflow request
    if (this.isComplexWorkflowRequest(description)) {
      return this.generateComplexWorkflow(description);
    }

    // Check for conditional workflow pattern (if...otherwise/else)
    if ((lowerDesc.includes('if ') || lowerDesc.includes('when ')) &&
        (lowerDesc.includes('otherwise') || lowerDesc.includes('else') || lowerDesc.includes('otherwise'))) {
      return this.generateConditionalWorkflow(description);
    }

    // Check for loop/iteration workflow pattern
    if (lowerDesc.includes('each') || lowerDesc.includes('every') ||
        lowerDesc.includes('list of') || lowerDesc.includes('all users') ||
        lowerDesc.includes('iterate') || lowerDesc.includes('loop')) {
      return this.generateLoopWorkflow(description);
    }

    const workflowName = `Generated Workflow - ${new Date().toISOString().slice(0, 10)}`;

    const nodes: WorkflowNode[] = [];
    const connections: Record<string, WorkflowConnection> = {};

    // Always start with a Manual Trigger node
    nodes.push({
      id: 'node_0',
      name: 'Start',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    });

    // Check for webhook patterns
    if (lowerDesc.includes('webhook') || lowerDesc.includes('http') || lowerDesc.includes('request')) {
      const method = lowerDesc.includes('post') ? 'POST' :
                     lowerDesc.includes('get') ? 'GET' :
                     lowerDesc.includes('put') ? 'PUT' : 'POST';

      // Extract URL from description if present
      const urlMatch = description.match(/https?:\/\/[^\s'"]+/);
      const url = urlMatch ? urlMatch[0] : 'https://example.com/hook';

      nodes.push({
        id: 'node_1',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [450, 300],
        parameters: {
          method,
          url,
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'message', value: 'Hello from n8n workflow' },
              { name: 'timestamp', value: '={{ $now.toISO() }}' },
            ],
          },
        },
      });

      connections['Start'] = {
        main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
      };
    }
    // Check for email patterns
    else if (lowerDesc.includes('email') || lowerDesc.includes('send mail')) {
      nodes.push({
        id: 'node_1',
        name: 'Send Email',
        type: 'n8n-nodes-base.emailSend',
        typeVersion: 2,
        position: [450, 300],
        parameters: {
          fromEmail: 'no-reply@example.com',
          toEmail: 'recipient@example.com',
          subject: 'Automated Email',
          text: 'This is an automated email from n8n workflow.',
        },
      });

      connections['Start'] = {
        main: [[{ node: 'Send Email', type: 'main', index: 0 }]],
      };
    }
    // Check for Slack patterns
    else if (lowerDesc.includes('slack')) {
      nodes.push({
        id: 'node_1',
        name: 'Slack',
        type: 'n8n-nodes-base.slack',
        typeVersion: 2,
        position: [450, 300],
        parameters: {
          operation: 'post',
          channel: '#general',
          text: 'Hello from n8n workflow!',
        },
      });

      connections['Start'] = {
        main: [[{ node: 'Slack', type: 'main', index: 0 }]],
      };
    }
    // Check for Google Sheets patterns
    else if (lowerDesc.includes('google sheets') || lowerDesc.includes('spreadsheet')) {
      nodes.push({
        id: 'node_1',
        name: 'Google Sheets',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4,
        position: [450, 300],
        parameters: {
          operation: 'read',
          documentId: { __rl: true, mode: 'id', value: '' },
          sheetName: { __rl: true, mode: 'name', value: 'Sheet1' },
        },
      });

      // If also mentions Slack, add a Slack node
      if (lowerDesc.includes('slack')) {
        nodes.push({
          id: 'node_2',
          name: 'Slack',
          type: 'n8n-nodes-base.slack',
          typeVersion: 2,
          position: [650, 300],
          parameters: {
            operation: 'post',
            channel: '#general',
            text: '={{ JSON.stringify($json) }}',
          },
        });

        connections['Start'] = {
          main: [[{ node: 'Google Sheets', type: 'main', index: 0 }]],
        };
        connections['Google Sheets'] = {
          main: [[{ node: 'Slack', type: 'main', index: 0 }]],
        };
      } else {
        connections['Start'] = {
          main: [[{ node: 'Google Sheets', type: 'main', index: 0 }]],
        };
      }
    }
    // Default: Set node with data transformation
    else {
      nodes.push({
        id: 'node_1',
        name: 'Set Data',
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        position: [450, 300],
        parameters: {
          mode: 'manual',
          duplicateItem: false,
          assignments: {
            assignments: [
              {
                id: 'assignment_0',
                name: 'description',
                value: description,
                type: 'string',
              },
              {
                id: 'assignment_1',
                name: 'processedAt',
                value: '={{ $now.toISO() }}',
                type: 'string',
              },
            ],
          },
        },
      });

      connections['Start'] = {
        main: [[{ node: 'Set Data', type: 'main', index: 0 }]],
      };
    }

    return {
      name: workflowName,
      nodes,
      connections,
      active: true, // Workflows are activated by default
      settings: {
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }

  /**
   * Check if an error is a transient error that should be retried
   */
  private isTransientError(error: any): boolean {
    // Network errors (ECONNREFUSED, ETIMEDOUT, etc.)
    if (!error.response) {
      return true;
    }
    // Server errors (5xx) except 501 Not Implemented
    if (error.response?.status >= 500 && error.response?.status !== 501) {
      return true;
    }
    // Request timeout
    if (error.code === 'ECONNABORTED') {
      return true;
    }
    return false;
  }

  /**
   * Create workflow in the n8n instance via API with automatic retry for transient failures
   */
  private async createWorkflowInN8n(
    n8nUrl: string,
    apiKey: string,
    workflow: N8nWorkflow,
    maxRetries: number = 3,
    socketId?: string,
    generationId?: string
  ): Promise<GenerationResult> {
    const baseUrl = n8nUrl.replace(/\/$/, '');
    let lastError: any = null;

    // Remove 'active' field from workflow as it's read-only in n8n API
    // Workflows need to be activated separately after creation
    const { active: _active, ...workflowWithoutActive } = workflow;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${baseUrl}/api/v1/workflows`,
          workflowWithoutActive,
          {
            headers: {
              'X-N8N-API-KEY': apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );

        const workflowId = response.data.id;
        const workflowUrl = `${baseUrl}/workflow/${workflowId}`;

        return {
          success: true,
          workflow,
          n8nWorkflowId: workflowId,
          n8nWorkflowUrl: workflowUrl,
          nodesUsed: workflow.nodes.length,
        };
      } catch (error: any) {
        lastError = error;
        console.error(`n8n API error (attempt ${attempt}/${maxRetries}):`, error.response?.data || error.message);

        // Don't retry non-transient errors
        if (!this.isTransientError(error)) {
          break;
        }

        // If we have more retries, emit progress about retry and wait
        if (attempt < maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          if (socketId && generationId) {
            this.emitProgress(socketId, generationId, `Retrying... (attempt ${attempt + 1}/${maxRetries})`, 65);
          }
          await this.delay(retryDelay);
        }
      }
    }

    // All retries exhausted, return error
    if (lastError.response?.status === 401) {
      return { success: false, error: 'Invalid n8n API key' };
    }
    if (lastError.response?.status === 403) {
      return { success: false, error: 'Access denied to n8n instance' };
    }

    return {
      success: false,
      error: lastError.response?.data?.message || lastError.message || 'Failed to create workflow in n8n after multiple attempts'
    };
  }

  /**
   * Helper to emit progress events with estimated time remaining
   */
  private emitProgress(
    socketId: string | undefined,
    generationId: string,
    message: string,
    progress: number,
    estimatedTotalMs: number = 3000
  ) {
    if (socketId) {
      // Calculate estimated time remaining based on progress
      let estimatedTimeRemaining: number | null = null;
      if (progress > 0 && progress < 100) {
        const remainingProgress = 100 - progress;
        const msPerPercent = estimatedTotalMs / 100;
        estimatedTimeRemaining = Math.ceil((remainingProgress * msPerPercent) / 1000);
      }

      io.to(socketId).emit('workflow:progress', {
        generationId,
        message,
        progress,
        estimatedTimeRemaining, // in seconds
      });
    }
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get a workflow generation by ID
   */
  async getGeneration(generationId: string, userId: string) {
    return prisma.workflowGeneration.findFirst({
      where: { id: generationId, userId },
    });
  }

  /**
   * Get user's workflow history
   */
  async getHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      status?: string;
      search?: string;
      sortBy?: 'date' | 'status' | 'duration';
      sortOrder?: 'asc' | 'desc';
    }
  ) {
    const skip = (page - 1) * limit;

    // Build where clause with filters
    const where: any = { userId };

    // Date range filter
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        // Set end date to end of day
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }

    // Status filter
    if (filters?.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    // Search filter - search by description
    if (filters?.search && filters.search.trim()) {
      where.workflowDescription = {
        contains: filters.search.trim(),
        mode: 'insensitive',
      };
    }

    // Build orderBy based on sortBy and sortOrder
    let orderBy: any = { createdAt: 'desc' }; // Default
    if (filters?.sortBy) {
      const order = filters.sortOrder || 'desc';
      switch (filters.sortBy) {
        case 'date':
          orderBy = { createdAt: order };
          break;
        case 'status':
          orderBy = { status: order };
          break;
        case 'duration':
          orderBy = { durationMs: order };
          break;
      }
    }

    const [generations, total] = await Promise.all([
      prisma.workflowGeneration.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          n8nInstance: {
            select: { id: true, name: true, url: true },
          },
        },
      }),
      prisma.workflowGeneration.count({ where }),
    ]);

    return {
      generations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export const workflowGeneratorService = new WorkflowGeneratorService();
