#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosError } from 'axios';

// Environment variables for n8n connection
const N8N_API_URL = process.env.N8N_API_URL || '';
const N8N_API_KEY = process.env.N8N_API_KEY || '';

interface N8nNode {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  group?: string[];
  credentials?: string[];
}

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  connections: unknown;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  position: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

interface WorkflowConnection {
  main: Array<Array<{ node: string; type: string; index: number }>>;
}

// Node suggestions mapping for common use cases
const NODE_SUGGESTIONS: Record<string, { nodes: string[]; description: string }> = {
  webhook: {
    nodes: ['n8n-nodes-base.webhook', 'n8n-nodes-base.respondToWebhook'],
    description: 'Use webhook nodes to receive HTTP requests',
  },
  http: {
    nodes: ['n8n-nodes-base.httpRequest'],
    description: 'Use HTTP Request node for API calls',
  },
  slack: {
    nodes: ['n8n-nodes-base.slack'],
    description: 'Use Slack node to send messages or interact with Slack',
  },
  email: {
    nodes: ['n8n-nodes-base.emailSend', 'n8n-nodes-base.gmail'],
    description: 'Use Email Send (SMTP) or Gmail for email operations',
  },
  google: {
    nodes: ['n8n-nodes-base.googleSheets', 'n8n-nodes-base.gmail', 'n8n-nodes-base.googleDrive'],
    description: 'Google Sheets, Gmail, and Drive integrations',
  },
  database: {
    nodes: ['n8n-nodes-base.postgres', 'n8n-nodes-base.mysql', 'n8n-nodes-base.mongodb'],
    description: 'Database nodes for PostgreSQL, MySQL, and MongoDB',
  },
  schedule: {
    nodes: ['n8n-nodes-base.schedule', 'n8n-nodes-base.cron'],
    description: 'Schedule or Cron triggers for timed workflows',
  },
  transform: {
    nodes: ['n8n-nodes-base.set', 'n8n-nodes-base.code', 'n8n-nodes-base.function'],
    description: 'Data transformation with Set, Code, or Function nodes',
  },
  conditional: {
    nodes: ['n8n-nodes-base.if', 'n8n-nodes-base.switch', 'n8n-nodes-base.filter'],
    description: 'Conditional branching with IF, Switch, or Filter nodes',
  },
  loop: {
    nodes: ['n8n-nodes-base.splitInBatches', 'n8n-nodes-base.merge'],
    description: 'Loop over items with Split In Batches and Merge nodes',
  },
};

// Create MCP server with latest SDK
const server = new Server(
  {
    name: 'n8n-mcp-server',
    version: '2.0.0', // Updated version with enhanced capabilities
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to make n8n API requests
async function n8nRequest<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  endpoint: string,
  data?: unknown
): Promise<T> {
  if (!N8N_API_URL || !N8N_API_KEY) {
    throw new Error('n8n API URL and API key must be configured via N8N_API_URL and N8N_API_KEY environment variables');
  }

  const baseUrl = N8N_API_URL.replace(/\/$/, '');
  const url = `${baseUrl}/api/v1${endpoint}`;

  try {
    const response = await axios({
      method,
      url,
      data,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const message = error.response?.data?.message || error.message;
      throw new Error(`n8n API error: ${message}`);
    }
    throw error;
  }
}

// Analyze description and suggest relevant nodes
function analyzeDescription(description: string): { suggestedNodes: string[]; reasoning: string[] } {
  const lowerDesc = description.toLowerCase();
  const suggestedNodes: string[] = [];
  const reasoning: string[] = [];

  // Always add a trigger node
  if (lowerDesc.includes('schedule') || lowerDesc.includes('every') || lowerDesc.includes('daily') || lowerDesc.includes('hourly')) {
    suggestedNodes.push('n8n-nodes-base.schedule');
    reasoning.push('Using Schedule trigger for timed execution');
  } else if (lowerDesc.includes('webhook') || lowerDesc.includes('receive')) {
    suggestedNodes.push('n8n-nodes-base.webhook');
    reasoning.push('Using Webhook trigger to receive HTTP requests');
  } else {
    suggestedNodes.push('n8n-nodes-base.manualTrigger');
    reasoning.push('Using Manual Trigger as default starting point');
  }

  // Check for service-specific keywords
  for (const [keyword, suggestion] of Object.entries(NODE_SUGGESTIONS)) {
    if (lowerDesc.includes(keyword)) {
      for (const node of suggestion.nodes) {
        if (!suggestedNodes.includes(node)) {
          suggestedNodes.push(node);
        }
      }
      reasoning.push(suggestion.description);
    }
  }

  // Check for specific services
  if (lowerDesc.includes('airtable')) {
    suggestedNodes.push('n8n-nodes-base.airtable');
    reasoning.push('Airtable integration for database operations');
  }
  if (lowerDesc.includes('notion')) {
    suggestedNodes.push('n8n-nodes-base.notion');
    reasoning.push('Notion integration for workspace management');
  }
  if (lowerDesc.includes('discord')) {
    suggestedNodes.push('n8n-nodes-base.discord');
    reasoning.push('Discord integration for chat messages');
  }
  if (lowerDesc.includes('telegram')) {
    suggestedNodes.push('n8n-nodes-base.telegram');
    reasoning.push('Telegram integration for messaging');
  }
  if (lowerDesc.includes('openai') || lowerDesc.includes('gpt') || lowerDesc.includes('ai')) {
    suggestedNodes.push('n8n-nodes-base.openAi');
    reasoning.push('OpenAI integration for AI-powered operations');
  }

  return { suggestedNodes, reasoning };
}

// Generate a basic workflow structure based on suggested nodes
function generateWorkflowTemplate(
  name: string,
  suggestedNodes: string[]
): { nodes: WorkflowNode[]; connections: Record<string, WorkflowConnection> } {
  const nodes: WorkflowNode[] = [];
  const connections: Record<string, WorkflowConnection> = {};
  const xOffset = 250;
  let position = 0;

  for (const nodeType of suggestedNodes) {
    const nodeName = nodeType.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim() || `Node ${position + 1}`;
    nodes.push({
      name: nodeName,
      type: nodeType,
      typeVersion: 1,
      position: [xOffset + position * 200, 300],
      parameters: {},
    });
    position++;
  }

  // Create linear connections
  for (let i = 0; i < nodes.length - 1; i++) {
    connections[nodes[i].name] = {
      main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]],
    };
  }

  return { nodes, connections };
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [
    {
      name: 'n8n_list_nodes',
      description: 'List all available nodes in the connected n8n instance. Returns node names, display names, descriptions, categories, and whether they require credentials.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          category: {
            type: 'string',
            description: 'Filter nodes by category (e.g., "trigger", "output", "transform", "flow")',
          },
          search: {
            type: 'string',
            description: 'Search term to filter nodes by name or description',
          },
        },
        required: [],
      },
    },
    {
      name: 'n8n_get_node_details',
      description: 'Get detailed information about a specific n8n node, including its parameters, credentials, and documentation.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          nodeName: {
            type: 'string',
            description: 'The name of the node to get details for (e.g., "n8n-nodes-base.httpRequest")',
          },
        },
        required: ['nodeName'],
      },
    },
    {
      name: 'n8n_suggest_workflow',
      description: 'Analyze a workflow description and suggest appropriate nodes and workflow structure. This is useful for understanding what nodes to use for a given task.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          description: {
            type: 'string',
            description: 'Natural language description of what the workflow should do (e.g., "When I receive a webhook, send a Slack message")',
          },
          includeTemplate: {
            type: 'boolean',
            description: 'If true, include a basic workflow template with the suggested nodes',
          },
        },
        required: ['description'],
      },
    },
    {
      name: 'n8n_create_workflow',
      description: 'Create a new workflow in the connected n8n instance. The workflow will be created in inactive state by default.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Name of the workflow',
          },
          nodes: {
            type: 'array',
            description: 'Array of nodes to include in the workflow',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Display name for this node in the workflow' },
                type: { type: 'string', description: 'Node type (e.g., "n8n-nodes-base.httpRequest")' },
                position: {
                  type: 'array',
                  items: { type: 'number' },
                  description: 'Position as [x, y] coordinates',
                },
                parameters: { type: 'object', description: 'Node-specific parameters' },
              },
              required: ['name', 'type', 'position'],
            },
          },
          connections: {
            type: 'object',
            description: 'Connections between nodes defining the workflow flow',
          },
          active: {
            type: 'boolean',
            description: 'Whether to activate the workflow immediately (default: false)',
          },
        },
        required: ['name', 'nodes'],
      },
    },
    {
      name: 'n8n_get_workflow',
      description: 'Get detailed information about a specific workflow including all nodes and connections.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          workflowId: {
            type: 'string',
            description: 'The ID of the workflow to retrieve',
          },
        },
        required: ['workflowId'],
      },
    },
    {
      name: 'n8n_list_workflows',
      description: 'List all workflows in the connected n8n instance with their status and basic information.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          active: {
            type: 'boolean',
            description: 'Filter by active/inactive status',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of workflows to return (default: 50)',
          },
        },
        required: [],
      },
    },
    {
      name: 'n8n_activate_workflow',
      description: 'Activate or deactivate a workflow in the n8n instance.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          workflowId: {
            type: 'string',
            description: 'The ID of the workflow to activate/deactivate',
          },
          active: {
            type: 'boolean',
            description: 'Set to true to activate, false to deactivate',
          },
        },
        required: ['workflowId', 'active'],
      },
    },
    {
      name: 'n8n_delete_workflow',
      description: 'Delete a workflow from the connected n8n instance. This action cannot be undone.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          workflowId: {
            type: 'string',
            description: 'The ID of the workflow to delete',
          },
        },
        required: ['workflowId'],
      },
    },
    {
      name: 'n8n_execute_workflow',
      description: 'Execute a workflow manually and return the execution result.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          workflowId: {
            type: 'string',
            description: 'The ID of the workflow to execute',
          },
          inputData: {
            type: 'object',
            description: 'Optional input data to pass to the first node',
          },
        },
        required: ['workflowId'],
      },
    },
  ];

  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'n8n_list_nodes': {
        const { category, search } = (args as { category?: string; search?: string }) || {};
        const response = await n8nRequest<{ data: N8nNode[] }>('GET', '/nodes');
        let nodes = response.data || [];

        // Apply filters
        if (category) {
          nodes = nodes.filter((n) => n.group?.some((g) => g.toLowerCase().includes(category.toLowerCase())));
        }
        if (search) {
          const searchLower = search.toLowerCase();
          nodes = nodes.filter(
            (n) =>
              n.name.toLowerCase().includes(searchLower) ||
              n.displayName.toLowerCase().includes(searchLower) ||
              n.description?.toLowerCase().includes(searchLower)
          );
        }

        const formattedNodes = nodes.map((node) => ({
          name: node.name,
          displayName: node.displayName,
          description: node.description || '',
          category: node.group?.[0] || 'uncategorized',
          version: node.version,
          requiresCredentials: node.credentials && node.credentials.length > 0,
          credentialTypes: node.credentials || [],
          isCustomNode: !node.name.startsWith('n8n-nodes-base.'),
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                totalNodes: formattedNodes.length,
                filters: { category, search },
                nodes: formattedNodes,
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_get_node_details': {
        const nodeName = (args as { nodeName?: string })?.nodeName;
        if (!nodeName) {
          throw new Error('nodeName is required');
        }

        const response = await n8nRequest<{ data: N8nNode[] }>('GET', '/nodes');
        const nodes = response.data || [];
        const node = nodes.find((n) => n.name === nodeName);

        if (!node) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: `Node "${nodeName}" not found`,
                  suggestion: 'Use n8n_list_nodes to see available nodes',
                  similarNodes: nodes
                    .filter((n) => n.name.toLowerCase().includes(nodeName.split('.').pop()?.toLowerCase() || ''))
                    .slice(0, 5)
                    .map((n) => n.name),
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                node: {
                  name: node.name,
                  displayName: node.displayName,
                  description: node.description,
                  version: node.version,
                  category: node.group?.[0] || 'uncategorized',
                  credentials: node.credentials || [],
                  isCustomNode: !node.name.startsWith('n8n-nodes-base.'),
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_suggest_workflow': {
        const { description, includeTemplate } = (args as { description?: string; includeTemplate?: boolean }) || {};
        if (!description) {
          throw new Error('description is required');
        }

        const { suggestedNodes, reasoning } = analyzeDescription(description);
        const result: {
          success: boolean;
          description: string;
          suggestedNodes: string[];
          reasoning: string[];
          template?: { nodes: WorkflowNode[]; connections: Record<string, WorkflowConnection> };
        } = {
          success: true,
          description,
          suggestedNodes,
          reasoning,
        };

        if (includeTemplate) {
          const template = generateWorkflowTemplate(`Workflow - ${new Date().toISOString().slice(0, 10)}`, suggestedNodes);
          result.template = template;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'n8n_create_workflow': {
        const { name: workflowName, nodes, connections, active } = (args as {
          name?: string;
          nodes?: WorkflowNode[];
          connections?: Record<string, unknown>;
          active?: boolean;
        }) || {};

        if (!workflowName || !nodes) {
          throw new Error('name and nodes are required');
        }

        // Add IDs to nodes if not present
        const nodesWithIds = nodes.map((node, index) => ({
          ...node,
          id: node.id || `node_${index}`,
          typeVersion: node.typeVersion || 1,
          parameters: node.parameters || {},
        }));

        const workflowData = {
          name: workflowName,
          nodes: nodesWithIds,
          connections: connections || {},
          settings: {
            saveManualExecutions: true,
          },
        };

        const response = await n8nRequest<N8nWorkflow>('POST', '/workflows', workflowData);

        // Activate if requested
        if (active) {
          try {
            await n8nRequest<N8nWorkflow>('PATCH', `/workflows/${response.id}`, { active: true });
          } catch (activateError) {
            console.error('Failed to activate workflow:', activateError);
          }
        }

        const baseUrl = N8N_API_URL.replace(/\/$/, '');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflow: {
                  id: response.id,
                  name: response.name,
                  active: response.active,
                  nodeCount: response.nodes.length,
                  createdAt: response.createdAt,
                  url: `${baseUrl}/workflow/${response.id}`,
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_get_workflow': {
        const workflowId = (args as { workflowId?: string })?.workflowId;
        if (!workflowId) {
          throw new Error('workflowId is required');
        }

        const response = await n8nRequest<N8nWorkflow>('GET', `/workflows/${workflowId}`);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflow: {
                  id: response.id,
                  name: response.name,
                  active: response.active,
                  nodeCount: response.nodes.length,
                  nodes: response.nodes.map((n) => ({
                    name: n.name,
                    type: n.type,
                    position: n.position,
                  })),
                  connections: response.connections,
                  createdAt: response.createdAt,
                  updatedAt: response.updatedAt,
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_list_workflows': {
        const { active, limit } = (args as { active?: boolean; limit?: number }) || {};
        const response = await n8nRequest<{ data: N8nWorkflow[] }>('GET', '/workflows');
        let workflows = response.data || [];

        // Apply filters
        if (active !== undefined) {
          workflows = workflows.filter((w) => w.active === active);
        }
        if (limit) {
          workflows = workflows.slice(0, limit);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflowCount: workflows.length,
                filters: { active, limit },
                workflows: workflows.map((w) => ({
                  id: w.id,
                  name: w.name,
                  active: w.active,
                  nodeCount: w.nodes?.length || 0,
                  createdAt: w.createdAt,
                  updatedAt: w.updatedAt,
                })),
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_activate_workflow': {
        const { workflowId, active } = (args as { workflowId?: string; active?: boolean }) || {};
        if (!workflowId || active === undefined) {
          throw new Error('workflowId and active are required');
        }

        const response = await n8nRequest<N8nWorkflow>('PATCH', `/workflows/${workflowId}`, { active });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflow: {
                  id: response.id,
                  name: response.name,
                  active: response.active,
                },
                message: `Workflow ${active ? 'activated' : 'deactivated'} successfully`,
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_delete_workflow': {
        const workflowId = (args as { workflowId?: string })?.workflowId;
        if (!workflowId) {
          throw new Error('workflowId is required');
        }

        await n8nRequest<void>('DELETE', `/workflows/${workflowId}`);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Workflow ${workflowId} deleted successfully`,
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_execute_workflow': {
        const { workflowId, inputData } = (args as { workflowId?: string; inputData?: Record<string, unknown> }) || {};
        if (!workflowId) {
          throw new Error('workflowId is required');
        }

        const response = await n8nRequest<{ data: { finished: boolean; mode: string; startedAt: string } }>(
          'POST',
          `/workflows/${workflowId}/execute`,
          inputData ? { data: inputData } : undefined
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                execution: response.data,
              }, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`,
                availableTools: [
                  'n8n_list_nodes',
                  'n8n_get_node_details',
                  'n8n_suggest_workflow',
                  'n8n_create_workflow',
                  'n8n_get_workflow',
                  'n8n_list_workflows',
                  'n8n_activate_workflow',
                  'n8n_delete_workflow',
                  'n8n_execute_workflow',
                ],
              }, null, 2),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: errorMessage,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('n8n MCP Server v2.0.0 started (using @modelcontextprotocol/sdk v1.25.3)');
  console.error('Available tools: n8n_list_nodes, n8n_get_node_details, n8n_suggest_workflow, n8n_create_workflow, n8n_get_workflow, n8n_list_workflows, n8n_activate_workflow, n8n_delete_workflow, n8n_execute_workflow');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
