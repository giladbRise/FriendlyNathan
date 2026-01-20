import axios from 'axios';
import { io } from '../index';
import { geminiService } from './gemini.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Cache TTL in milliseconds (1 hour)
const NODE_CACHE_TTL_MS = 60 * 60 * 1000;

interface N8nNode {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  group?: string[];
  credentials?: string[];
}

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

interface CredentialRequirement {
  type: string;
  displayName: string;
  instructions: string;
  steps: string[];
  documentationUrl?: string;
  videoUrl?: string;
  contactInfo?: string;
}

// Track active generations (in-memory, will be lost on restart)
interface ActiveGeneration {
  id: string;
  n8nUrl: string;
  startTime: number;
  cancelled: boolean;
}

const activeGenerations = new Map<string, ActiveGeneration>();

// Map of node types to their credential requirements
const CREDENTIAL_MAP: Record<string, CredentialRequirement> = {
  'n8n-nodes-base.slack': {
    type: 'slackApi',
    displayName: 'Slack API',
    instructions: 'Create a Slack app and generate an OAuth token.',
    steps: [
      'Go to api.slack.com/apps and click "Create New App"',
      'Choose "From scratch" and name your app',
      'Under "OAuth & Permissions", add scopes (chat:write, channels:read)',
      'Install to workspace and copy "Bot User OAuth Token"',
      'In n8n, create Slack API credentials with the token',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/slack/',
  },
  'n8n-nodes-base.googleSheets': {
    type: 'googleSheetsOAuth2Api',
    displayName: 'Google Sheets OAuth2',
    instructions: 'Set up OAuth 2.0 in Google Cloud Console.',
    steps: [
      'Create project in Google Cloud Console',
      'Enable Google Sheets API',
      'Create OAuth 2.0 credentials',
      'Configure consent screen and callback URL',
      'Use credentials in n8n',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/google/',
  },
  'n8n-nodes-base.gmail': {
    type: 'gmailOAuth2',
    displayName: 'Gmail OAuth2',
    instructions: 'Set up OAuth 2.0 for Gmail API.',
    steps: [
      'Enable Gmail API in Google Cloud Console',
      'Create OAuth 2.0 credentials',
      'Add gmail.send and gmail.readonly scopes',
      'Configure in n8n',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/google/',
  },
  'n8n-nodes-base.emailSend': {
    type: 'smtp',
    displayName: 'SMTP',
    instructions: 'Configure SMTP server settings.',
    steps: [
      'Get SMTP server hostname and port',
      'Create app-specific password if needed',
      'Configure in n8n with host, port, username, password',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/smtp/',
  },
};

/**
 * Public workflow service - generates workflows without requiring authentication
 */
export class PublicWorkflowService {
  private generationCounter = 0;

  /**
   * Generate a unique ID for tracking generations
   */
  private generateId(): string {
    this.generationCounter++;
    return `gen_${Date.now()}_${this.generationCounter}`;
  }

  /**
   * Discover nodes from an n8n instance with caching
   */
  async discoverNodes(
    n8nUrl: string,
    apiKey: string
  ): Promise<{ nodes: N8nNode[]; fromCache: boolean; nodeCount: number }> {
    const baseUrl = n8nUrl.replace(/\/$/, '');

    // Check cache
    const cachedData = await prisma.nodeCache.findUnique({
      where: { n8nUrl: baseUrl },
    });

    if (cachedData && new Date() < cachedData.expiresAt) {
      const nodes = cachedData.nodesJson as unknown as N8nNode[];
      return { nodes, fromCache: true, nodeCount: nodes.length };
    }

    // Fetch from n8n
    try {
      const response = await axios.get(`${baseUrl}/api/v1/nodes`, {
        headers: {
          'X-N8N-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const nodes: N8nNode[] = response.data.data || [];

      // Cache the nodes
      await prisma.nodeCache.upsert({
        where: { n8nUrl: baseUrl },
        update: {
          nodesJson: nodes as any,
          cachedAt: new Date(),
          expiresAt: new Date(Date.now() + NODE_CACHE_TTL_MS),
        },
        create: {
          n8nUrl: baseUrl,
          nodesJson: nodes as any,
          cachedAt: new Date(),
          expiresAt: new Date(Date.now() + NODE_CACHE_TTL_MS),
        },
      });

      return { nodes, fromCache: false, nodeCount: nodes.length };
    } catch (error: any) {
      // Use expired cache as fallback
      if (cachedData) {
        const nodes = cachedData.nodesJson as unknown as N8nNode[];
        return { nodes, fromCache: true, nodeCount: nodes.length };
      }
      return { nodes: [], fromCache: false, nodeCount: 0 };
    }
  }

  /**
   * Generate a workflow from description
   */
  async generateWorkflow(
    n8nUrl: string,
    n8nApiKey: string,
    description: string,
    socketId?: string,
    geminiApiKey?: string
  ): Promise<{ generationId: string }> {
    const generationId = this.generateId();
    const startTime = Date.now();

    // Track this generation
    activeGenerations.set(generationId, {
      id: generationId,
      n8nUrl,
      startTime,
      cancelled: false,
    });

    // Emit initial progress
    this.emitProgress(socketId, generationId, 'Starting workflow generation...', 10);

    // Run generation asynchronously
    this.runGeneration(generationId, n8nUrl, n8nApiKey, description, socketId, startTime, geminiApiKey);

    return { generationId };
  }

  /**
   * Cancel an in-progress generation
   */
  async cancelGeneration(generationId: string, socketId?: string): Promise<boolean> {
    const generation = activeGenerations.get(generationId);

    if (!generation) {
      throw new Error('Generation not found');
    }

    if (generation.cancelled) {
      throw new Error('Generation is not in progress');
    }

    // Mark as cancelled
    generation.cancelled = true;

    // Emit cancellation event
    if (socketId) {
      io.to(socketId).emit('workflow:cancelled', {
        generationId,
        message: 'Workflow generation cancelled',
      });
    }

    return true;
  }

  /**
   * Run the generation process
   */
  private async runGeneration(
    generationId: string,
    n8nUrl: string,
    n8nApiKey: string,
    description: string,
    socketId: string | undefined,
    startTime: number,
    geminiApiKey?: string
  ) {
    try {
      // Check for cancellation
      if (this.isCancelled(generationId)) {
        activeGenerations.delete(generationId);
        return;
      }

      // Step 1: Discover nodes
      this.emitProgress(socketId, generationId, 'Discovering available nodes...', 15);
      const discoveryResult = await this.discoverNodes(n8nUrl, n8nApiKey);

      if (discoveryResult.fromCache) {
        this.emitProgress(socketId, generationId, `Using cached nodes (${discoveryResult.nodeCount} available)`, 20);
      } else if (discoveryResult.nodeCount > 0) {
        this.emitProgress(socketId, generationId, `Discovered ${discoveryResult.nodeCount} nodes`, 20);
      }

      if (this.isCancelled(generationId)) {
        activeGenerations.delete(generationId);
        return;
      }

      // Step 2: Generate workflow
      this.emitProgress(socketId, generationId, 'Analyzing description...', 30);
      await this.delay(300);

      if (this.isCancelled(generationId)) {
        activeGenerations.delete(generationId);
        return;
      }

      this.emitProgress(socketId, generationId, 'Generating workflow...', 40);

      // Use Gemini AI if available
      let workflow: N8nWorkflow;
      const hasGeminiKey = geminiApiKey || geminiService.isAvailable();

      if (hasGeminiKey) {
        try {
          this.emitProgress(socketId, generationId, 'Using AI to understand your request...', 45);
          const aiResult = await geminiService.generateWorkflow(
            description,
            discoveryResult.nodes,
            geminiApiKey
          );
          workflow = aiResult.workflow;
        } catch (aiError: any) {
          console.warn('AI generation failed, falling back to rule-based:', aiError.message);
          this.emitProgress(socketId, generationId, 'Using rule-based generation...', 45);
          workflow = this.generateWorkflowFromDescription(description);
        }
      } else {
        this.emitProgress(socketId, generationId, 'Generating workflow...', 45);
        workflow = this.generateWorkflowFromDescription(description);
      }

      if (this.isCancelled(generationId)) {
        activeGenerations.delete(generationId);
        return;
      }

      // Step 3: Detect credentials
      this.emitProgress(socketId, generationId, 'Detecting required credentials...', 50);
      const credentials = this.detectCredentials(workflow.nodes);

      // Step 4: Validate workflow
      this.emitProgress(socketId, generationId, 'Validating workflow...', 55);
      const validationResult = this.validateWorkflow(workflow);
      if (!validationResult.valid) {
        throw new Error(`Invalid workflow: ${validationResult.error}`);
      }

      // Step 5: Create in n8n
      this.emitProgress(socketId, generationId, 'Creating workflow in n8n...', 60);
      const n8nResult = await this.createWorkflowInN8n(n8nUrl, n8nApiKey, workflow, 3, socketId, generationId);

      if (!n8nResult.success) {
        throw new Error(n8nResult.error || 'Failed to create workflow in n8n');
      }

      // Success!
      this.emitProgress(socketId, generationId, 'Workflow created successfully!', 100);

      // Emit completion
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

      // Cleanup
      activeGenerations.delete(generationId);
    } catch (error: any) {
      console.error('Workflow generation error:', error);

      // Emit error
      if (socketId) {
        io.to(socketId).emit('workflow:error', {
          generationId,
          error: error.message || 'Workflow generation failed',
        });
      }

      // Cleanup
      activeGenerations.delete(generationId);
    }
  }

  private isCancelled(generationId: string): boolean {
    const gen = activeGenerations.get(generationId);
    return gen?.cancelled === true;
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

  private validateWorkflow(workflow: N8nWorkflow): { valid: boolean; error?: string } {
    if (!workflow.name) return { valid: false, error: 'Workflow must have a name' };
    if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      return { valid: false, error: 'Workflow must have at least one node' };
    }
    if (typeof workflow.connections !== 'object') {
      return { valid: false, error: 'Workflow must have connections object' };
    }

    for (const node of workflow.nodes) {
      if (!node.id || !node.name || !node.type) {
        return { valid: false, error: 'Invalid node: missing required fields' };
      }
    }

    return { valid: true };
  }

  /**
   * Generate workflow from description using rule-based approach
   */
  private generateWorkflowFromDescription(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();
    const workflowName = `Workflow - ${new Date().toISOString().slice(0, 10)}`;

    const nodes: WorkflowNode[] = [];
    const connections: Record<string, WorkflowConnection> = {};

    // Always start with Manual Trigger
    nodes.push({
      id: 'node_0',
      name: 'Start',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    });

    // Check for multi-step email workflow
    if ((lowerDesc.includes('email') || lowerDesc.includes('gmail')) &&
        (lowerDesc.includes('slack') || lowerDesc.includes('summary'))) {
      return this.generateEmailProcessingWorkflow(description);
    }

    // Webhook/HTTP
    if (lowerDesc.includes('webhook') || lowerDesc.includes('http') || lowerDesc.includes('request')) {
      const method = lowerDesc.includes('post') ? 'POST' :
                     lowerDesc.includes('get') ? 'GET' : 'POST';
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
              { name: 'message', value: 'Hello from n8n' },
              { name: 'timestamp', value: '={{ $now.toISO() }}' },
            ],
          },
        },
      });

      connections['Start'] = {
        main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
      };
    }
    // Email
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
          text: 'This is an automated email from n8n.',
        },
      });

      connections['Start'] = {
        main: [[{ node: 'Send Email', type: 'main', index: 0 }]],
      };
    }
    // Slack
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
    // Google Sheets
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

      connections['Start'] = {
        main: [[{ node: 'Google Sheets', type: 'main', index: 0 }]],
      };

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

        connections['Google Sheets'] = {
          main: [[{ node: 'Slack', type: 'main', index: 0 }]],
        };
      }
    }
    // Default: Set data node
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
              { id: 'a1', name: 'description', value: description, type: 'string' },
              { id: 'a2', name: 'processedAt', value: '={{ $now.toISO() }}', type: 'string' },
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
      active: true,
      settings: { saveManualExecutions: true },
    };
  }

  /**
   * Generate email processing workflow
   */
  private generateEmailProcessingWorkflow(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();
    const workflowName = `Email Workflow - ${new Date().toISOString().slice(0, 10)}`;
    const nodes: WorkflowNode[] = [];
    const connections: Record<string, WorkflowConnection> = {};

    // Extract parameters from description
    const daysMatch = description.match(/last\s+(\d+)\s+days?/i);
    const daysFilter = daysMatch ? parseInt(daysMatch[1]) : 7;
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

    // Node 1: Get Emails
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
        filters: { q: `newer_than:${daysFilter}d` },
      },
    });

    connections['Start'] = {
      main: [[{ node: 'Get Emails', type: 'main', index: 0 }]],
    };

    // Node 2: Filter
    nodes.push({
      id: 'node_2',
      name: 'Filter by Date',
      type: 'n8n-nodes-base.filter',
      typeVersion: 1,
      position: [650, 300],
      parameters: {
        conditions: {
          boolean: [{
            value1: `={{ $json.internalDate > Date.now() - (${daysFilter} * 24 * 60 * 60 * 1000) }}`,
            operation: 'isTrue',
          }],
        },
      },
    });

    connections['Get Emails'] = {
      main: [[{ node: 'Filter by Date', type: 'main', index: 0 }]],
    };

    // Node 3: Mark as unread if requested
    if (lowerDesc.includes('mark') && lowerDesc.includes('unread')) {
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

    // Node 4: Summarize
    const prevNode = nodes[nodes.length - 1].name;
    nodes.push({
      id: `node_${nodes.length}`,
      name: 'Summarize Emails',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1050, 300],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: `const items = $input.all();
const count = items.length;
const summary = \`📧 Found \${count} emails in the last ${daysFilter} days\`;
return [{ json: { summary, emailCount: count } }];`,
      },
    });

    connections[prevNode] = {
      main: [[{ node: 'Summarize Emails', type: 'main', index: 0 }]],
    };

    // Node 5: Send to Slack
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
      settings: { saveManualExecutions: true },
    };
  }

  /**
   * Create workflow in n8n with retry logic
   */
  private async createWorkflowInN8n(
    n8nUrl: string,
    apiKey: string,
    workflow: N8nWorkflow,
    maxRetries: number = 3,
    socketId?: string,
    generationId?: string
  ): Promise<{ success: boolean; n8nWorkflowId?: string; n8nWorkflowUrl?: string; error?: string }> {
    const baseUrl = n8nUrl.replace(/\/$/, '');
    let lastError: any = null;

    // Remove 'active' field as it's read-only
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
          n8nWorkflowId: workflowId,
          n8nWorkflowUrl: workflowUrl,
        };
      } catch (error: any) {
        lastError = error;
        console.error(`n8n API error (attempt ${attempt}/${maxRetries}):`, error.response?.data || error.message);

        // Don't retry client errors
        if (error.response?.status && error.response.status < 500) {
          break;
        }

        if (attempt < maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          if (socketId && generationId) {
            this.emitProgress(socketId, generationId, `Retrying... (attempt ${attempt + 1}/${maxRetries})`, 65);
          }
          await this.delay(retryDelay);
        }
      }
    }

    if (lastError.response?.status === 401) {
      return { success: false, error: 'Invalid n8n API key' };
    }
    if (lastError.response?.status === 403) {
      return { success: false, error: 'Access denied to n8n instance' };
    }

    return {
      success: false,
      error: lastError.response?.data?.message || lastError.message || 'Failed to create workflow',
    };
  }

  private emitProgress(socketId: string | undefined, generationId: string, message: string, progress: number) {
    if (socketId) {
      const estimatedTimeRemaining = progress < 100 ? Math.ceil((100 - progress) * 30 / 100) : null;
      io.to(socketId).emit('workflow:progress', {
        generationId,
        message,
        progress,
        estimatedTimeRemaining,
      });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const publicWorkflowService = new PublicWorkflowService();
