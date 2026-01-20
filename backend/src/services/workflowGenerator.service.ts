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

      // Step 2: Create workflow in n8n
      this.emitProgress(socketId, generationId, 'Creating workflow in n8n...', 60);

      const apiKey = decrypt(instance.apiKeyEncrypted);
      const n8nResult = await this.createWorkflowInN8n(instance.url, apiKey, workflow);

      if (!n8nResult.success) {
        throw new Error(n8nResult.error || 'Failed to create workflow in n8n');
      }

      // Step 3: Update generation record with success
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
    else if (lowerDesc.includes('slack') || lowerDesc.includes('message')) {
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
  async getHistory(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [generations, total] = await Promise.all([
      prisma.workflowGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          n8nInstance: {
            select: { name: true, url: true },
          },
        },
      }),
      prisma.workflowGeneration.count({ where: { userId } }),
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
