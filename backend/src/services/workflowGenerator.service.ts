import { PrismaClient, WorkflowStatus } from '@prisma/client';
import axios from 'axios';
import { decrypt } from '../utils/encryption';
import { io } from '../index';

const prisma = new PrismaClient();

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
  /**
   * Generate a workflow from a description
   */
  async generateWorkflow(
    userId: string,
    instanceId: string,
    description: string,
    socketId?: string
  ): Promise<{ generationId: string }> {
    const startTime = Date.now();

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

  private async runGeneration(
    generationId: string,
    instance: { id: string; url: string; apiKeyEncrypted: string },
    description: string,
    socketId: string | undefined,
    startTime: number
  ) {
    try {
      // Step 1: Analyze description and generate workflow
      this.emitProgress(socketId, generationId, 'Analyzing description...', 20);
      await this.delay(500); // Simulate processing time

      this.emitProgress(socketId, generationId, 'Generating workflow structure...', 40);
      const workflow = this.generateWorkflowFromDescription(description);
      await this.delay(500);

      // Step 2: Detect required credentials
      this.emitProgress(socketId, generationId, 'Detecting required credentials...', 50);
      const credentials = this.detectCredentials(workflow.nodes);
      await this.delay(300);

      // Step 3: Create workflow in n8n
      this.emitProgress(socketId, generationId, 'Creating workflow in n8n...', 60);

      const apiKey = decrypt(instance.apiKeyEncrypted);
      const n8nResult = await this.createWorkflowInN8n(instance.url, apiKey, workflow);

      if (!n8nResult.success) {
        throw new Error(n8nResult.error || 'Failed to create workflow in n8n');
      }

      // Step 4: Update generation record with success
      this.emitProgress(socketId, generationId, 'Workflow created successfully!', 100);

      const durationMs = Date.now() - startTime;
      await prisma.workflowGeneration.update({
        where: { id: generationId },
        data: {
          status: WorkflowStatus.success,
          generatedWorkflowJson: workflow as any,
          n8nWorkflowId: n8nResult.n8nWorkflowId,
          n8nWorkflowUrl: n8nResult.n8nWorkflowUrl,
          nodesUsedCount: workflow.nodes.length,
          credentialsRequired: credentials.length > 0 ? credentials : null,
          durationMs,
          completedAt: new Date(),
        },
      });

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

      // Update instance last used
      await prisma.n8nInstance.update({
        where: { id: instance.id },
        data: { lastUsedAt: new Date() },
      });
    } catch (error: any) {
      console.error('Workflow generation error:', error);

      const durationMs = Date.now() - startTime;
      await prisma.workflowGeneration.update({
        where: { id: generationId },
        data: {
          status: WorkflowStatus.failed,
          errorMessage: error.message || 'Unknown error',
          durationMs,
          completedAt: new Date(),
        },
      });

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
   * Detect credentials required by workflow nodes
   */
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
   * Generate a simple workflow based on description keywords
   * In production, this would use Gemini AI
   */
  private generateWorkflowFromDescription(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();
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
      active: false,
      settings: {
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }

  /**
   * Create workflow in the n8n instance via API
   */
  private async createWorkflowInN8n(
    n8nUrl: string,
    apiKey: string,
    workflow: N8nWorkflow
  ): Promise<GenerationResult> {
    try {
      const baseUrl = n8nUrl.replace(/\/$/, '');

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
      console.error('n8n API error:', error.response?.data || error.message);

      if (error.response?.status === 401) {
        return { success: false, error: 'Invalid n8n API key' };
      }
      if (error.response?.status === 403) {
        return { success: false, error: 'Access denied to n8n instance' };
      }

      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to create workflow in n8n'
      };
    }
  }

  /**
   * Helper to emit progress events
   */
  private emitProgress(socketId: string | undefined, generationId: string, message: string, progress: number) {
    if (socketId) {
      io.to(socketId).emit('workflow:progress', {
        generationId,
        message,
        progress,
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

    const [generations, total] = await Promise.all([
      prisma.workflowGeneration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          n8nInstance: {
            select: { name: true, url: true },
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
