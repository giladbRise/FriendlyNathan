import { PrismaClient, WorkflowStatus } from '@prisma/client';
import axios from 'axios';
import { decrypt } from '../utils/encryption';
import { io } from '../index';

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
    console.log(`Cleared node cache for ${baseUrl}`);
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
    skipDuplicateCheck: boolean = false
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
    this.runGeneration(generation.id, instance, description, socketId, startTime);

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
    startTime: number
  ) {
    let createdWorkflowId: string | undefined; // Track created workflow for potential rollback
    let nodesDiscoveredCount: number | undefined;
    const apiKey = decrypt(instance.apiKeyEncrypted);

    try {
      // Check for cancellation before each step
      if (this.isCancelled(generationId)) {
        this.cancelledGenerations.delete(generationId);
        return;
      }

      // Step 1: Discover available nodes (with caching)
      this.emitProgress(socketId, generationId, 'Discovering available nodes...', 15);
      const discoveryResult = await this.discoverNodes(instance.url, apiKey);
      nodesDiscoveredCount = discoveryResult.nodeCount;

      // Show different message based on cache status
      if (discoveryResult.fromCache) {
        this.emitProgress(socketId, generationId, `Using cached nodes (${discoveryResult.nodeCount} nodes available)`, 20);
      } else if (discoveryResult.nodeCount > 0) {
        this.emitProgress(socketId, generationId, `Discovered ${discoveryResult.nodeCount} nodes from n8n instance`, 20);
      }

      if (this.isCancelled(generationId)) {
        this.cancelledGenerations.delete(generationId);
        return;
      }

      // Step 2: Analyze description and generate workflow
      this.emitProgress(socketId, generationId, 'Analyzing description...', 30);
      await this.delay(300); // Simulate processing time

      if (this.isCancelled(generationId)) {
        this.cancelledGenerations.delete(generationId);
        return;
      }

      this.emitProgress(socketId, generationId, 'Generating workflow structure...', 40);
      const workflow = this.generateWorkflowFromDescription(description);
      await this.delay(300);

      if (this.isCancelled(generationId)) {
        this.cancelledGenerations.delete(generationId);
        return;
      }

      // Step 3: Detect required credentials
      this.emitProgress(socketId, generationId, 'Detecting required credentials...', 50);
      const credentials = this.detectCredentials(workflow.nodes);
      await this.delay(200);

      if (this.isCancelled(generationId)) {
        this.cancelledGenerations.delete(generationId);
        return;
      }

      // Step 4: Validate workflow JSON before sending to n8n
      this.emitProgress(socketId, generationId, 'Validating workflow structure...', 55);
      const validationResult = this.validateWorkflowJson(workflow);
      if (!validationResult.valid) {
        throw new Error(`Invalid workflow: ${validationResult.error}`);
      }

      // Estimate AI token usage (simulated - in production this comes from AI API response)
      // Input tokens: ~1 token per 4 characters of description
      // Output tokens: ~1 token per 4 characters of workflow JSON
      const inputTokens = Math.ceil(description.length / 4);
      const outputTokens = Math.ceil(JSON.stringify(workflow).length / 4);
      const aiTokensUsed = inputTokens + outputTokens;

      // Step 5: Create workflow in n8n (with automatic retry for transient failures)
      this.emitProgress(socketId, generationId, 'Creating workflow in n8n...', 60);

      const n8nResult = await this.createWorkflowInN8n(instance.url, apiKey, workflow, 3, socketId, generationId);

      if (!n8nResult.success) {
        throw new Error(n8nResult.error || 'Failed to create workflow in n8n');
      }

      // Track the created workflow ID for potential rollback
      createdWorkflowId = n8nResult.n8nWorkflowId;

      // Step 6: Update generation record with success
      this.emitProgress(socketId, generationId, 'Workflow created successfully!', 100);

      const durationMs = Date.now() - startTime;

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
            credentialsRequired: credentials.length > 0 ? credentials : null,
            aiTokensUsed,
            durationMs,
            completedAt: new Date(),
          },
        });
      } catch (dbError: any) {
        // Database update failed after workflow was created in n8n
        // Attempt rollback by deleting the workflow from n8n
        console.error('Database update failed, attempting rollback:', dbError);
        await this.rollbackWorkflow(instance.url, apiKey, createdWorkflowId);
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
  private generateComplexWorkflow(description: string): N8nWorkflow {
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
   * Generate a simple workflow based on description keywords
   * In production, this would use Gemini AI
   */
  private generateWorkflowFromDescription(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();

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

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${baseUrl}/api/v1/workflows`,
          workflow,
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
