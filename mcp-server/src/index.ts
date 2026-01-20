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
  nodes: unknown[];
  connections: unknown;
  createdAt: string;
  updatedAt: string;
}

// Create MCP server
const server = new Server(
  {
    name: 'n8n-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to make n8n API requests
async function n8nRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
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

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [
    {
      name: 'n8n_list_nodes',
      description: 'List all available nodes in the connected n8n instance. Returns node names, display names, descriptions, and categories.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
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
      name: 'n8n_create_workflow',
      description: 'Create a new workflow in the connected n8n instance.',
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
                name: { type: 'string' },
                type: { type: 'string' },
                position: {
                  type: 'array',
                  items: { type: 'number' },
                },
                parameters: { type: 'object' },
              },
              required: ['name', 'type', 'position'],
            },
          },
          connections: {
            type: 'object',
            description: 'Connections between nodes',
          },
        },
        required: ['name', 'nodes'],
      },
    },
    {
      name: 'n8n_list_workflows',
      description: 'List all workflows in the connected n8n instance.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    {
      name: 'n8n_delete_workflow',
      description: 'Delete a workflow from the connected n8n instance.',
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
  ];

  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'n8n_list_nodes': {
        const response = await n8nRequest<{ data: N8nNode[] }>('GET', '/nodes');
        const nodes = response.data || [];

        // Format nodes for readability
        // Custom nodes are identified by package name not starting with "n8n-nodes-base"
        const formattedNodes = nodes.map((node) => {
          const isCustomNode = !node.name.startsWith('n8n-nodes-base.');
          return {
            name: node.name,
            displayName: node.displayName,
            description: node.description || '',
            category: node.group?.[0] || 'uncategorized',
            version: node.version,
            requiresCredentials: node.credentials && node.credentials.length > 0,
            isCustomNode,
          };
        });

        const customNodes = formattedNodes.filter(n => n.isCustomNode);
        const coreNodes = formattedNodes.filter(n => !n.isCustomNode);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                nodeCount: formattedNodes.length,
                customNodeCount: customNodes.length,
                coreNodeCount: coreNodes.length,
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

        // Get all nodes and find the specific one
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
                  availableNodes: nodes.slice(0, 10).map((n) => n.name),
                }, null, 2),
              },
            ],
          };
        }

        const isCustomNode = !node.name.startsWith('n8n-nodes-base.');
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
                  isCustomNode,
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_create_workflow': {
        const workflowArgs = args as { name?: string; nodes?: unknown[]; connections?: unknown };
        const workflowName = workflowArgs?.name;
        const nodes = workflowArgs?.nodes;
        const connections = workflowArgs?.connections;

        if (!workflowName || !nodes) {
          throw new Error('name and nodes are required');
        }

        const workflowData = {
          name: workflowName,
          active: false,
          nodes,
          connections: connections || {},
          settings: {},
        };

        const response = await n8nRequest<N8nWorkflow>('POST', '/workflows', workflowData);

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
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_list_workflows': {
        const response = await n8nRequest<{ data: N8nWorkflow[] }>('GET', '/workflows');
        const workflows = response.data || [];

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflowCount: workflows.length,
                workflows: workflows.map((w) => ({
                  id: w.id,
                  name: w.name,
                  active: w.active,
                  createdAt: w.createdAt,
                  updatedAt: w.updatedAt,
                })),
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

      default:
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`,
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
  console.error('n8n MCP Server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
