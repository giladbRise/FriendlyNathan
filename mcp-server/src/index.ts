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

// Node cache to store discovered nodes
const NODE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache TTL
interface NodeCache {
  nodes: N8nNode[];
  nodeTypes: Map<string, N8nNodeType>;
  timestamp: number;
}
let nodeCache: NodeCache | null = null;

interface N8nNodeType {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  properties: N8nNodeProperty[];
  credentials?: N8nCredentialType[];
  group?: string[];
}

interface N8nNodeProperty {
  name: string;
  displayName: string;
  type: string;
  default?: unknown;
  required?: boolean;
  description?: string;
  options?: Array<{ name: string; value: string | number | boolean }>;
}

interface N8nCredentialType {
  name: string;
  required?: boolean;
}

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

/**
 * Discover and cache all available nodes from n8n
 * This ensures we have a complete picture of what nodes are available
 * before generating workflows
 */
async function discoverAndCacheNodes(): Promise<NodeCache> {
  // Return cached nodes if still valid
  if (nodeCache && Date.now() - nodeCache.timestamp < NODE_CACHE_TTL_MS) {
    console.error(`Using cached nodes (${nodeCache.nodes.length} nodes, cached ${Math.round((Date.now() - nodeCache.timestamp) / 1000)}s ago)`);
    return nodeCache;
  }

  console.error('Discovering available n8n nodes...');

  try {
    // Fetch all nodes
    const nodesResponse = await n8nRequest<{ data: N8nNode[] }>('GET', '/nodes');
    const nodes = nodesResponse.data || [];

    // Try to fetch node types with full schemas
    const nodeTypes = new Map<string, N8nNodeType>();

    try {
      const nodeTypesResponse = await n8nRequest<{ data: N8nNodeType[] }>('GET', '/node-types');
      const types = nodeTypesResponse.data || [];
      for (const nodeType of types) {
        nodeTypes.set(nodeType.name, nodeType);
      }
      console.error(`Fetched ${nodeTypes.size} node type configurations`);
    } catch (nodeTypeError) {
      console.error('Could not fetch node types (endpoint may not be available). Using basic node info only.');
    }

    // Create cache
    nodeCache = {
      nodes,
      nodeTypes,
      timestamp: Date.now(),
    };

    console.error(`Cached ${nodes.length} nodes, ${nodeTypes.size} with full schemas`);
    return nodeCache;
  } catch (error) {
    console.error('Failed to discover nodes:', error);
    // Return empty cache on error
    return {
      nodes: [],
      nodeTypes: new Map(),
      timestamp: Date.now(),
    };
  }
}

/**
 * Get cached nodes or discover them if not cached
 */
async function getCachedNodes(): Promise<N8nNode[]> {
  const cache = await discoverAndCacheNodes();
  return cache.nodes;
}

/**
 * Get node type details from cache
 */
async function getNodeTypeDetails(nodeType: string): Promise<N8nNodeType | undefined> {
  const cache = await discoverAndCacheNodes();
  return cache.nodeTypes.get(nodeType);
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
    {
      name: 'n8n_get_node_types',
      description: 'Get detailed node type information including all available parameters, options, and credential requirements. This is essential for understanding what options are available before creating workflows. Results are cached for 1 hour.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          nodeTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of node type names to get details for (e.g., ["n8n-nodes-base.httpRequest", "n8n-nodes-base.slack"]). If empty, returns all available node types.',
          },
          includeProperties: {
            type: 'boolean',
            description: 'If true, include full property schemas with options and defaults (default: true)',
          },
        },
        required: [],
      },
    },
    {
      name: 'n8n_refresh_node_cache',
      description: 'Force refresh the node cache to get the latest available nodes from n8n. Use this if new nodes have been installed.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    {
      name: 'n8n_get_cache_status',
      description: 'Get information about the current node cache status including how many nodes are cached and when the cache was last updated.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
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
        // Use cached nodes instead of direct API call
        let nodes = await getCachedNodes();

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

      case 'n8n_get_node_types': {
        const { nodeTypes: requestedTypes, includeProperties } = (args as { nodeTypes?: string[]; includeProperties?: boolean }) || {};
        const includeProps = includeProperties !== false; // Default to true

        const cache = await discoverAndCacheNodes();
        const result: {
          success: boolean;
          nodeCount: number;
          cacheAge: number;
          nodeTypes: Array<{
            name: string;
            displayName: string;
            description?: string;
            version: number;
            category?: string;
            credentials?: N8nCredentialType[];
            properties?: N8nNodeProperty[];
          }>;
        } = {
          success: true,
          nodeCount: 0,
          cacheAge: Math.round((Date.now() - cache.timestamp) / 1000),
          nodeTypes: [],
        };

        // If specific node types requested, return those
        // Otherwise return all cached node types
        const typesToReturn = requestedTypes && requestedTypes.length > 0
          ? requestedTypes
          : Array.from(cache.nodeTypes.keys());

        for (const nodeTypeName of typesToReturn) {
          const nodeType = cache.nodeTypes.get(nodeTypeName);
          if (nodeType) {
            result.nodeTypes.push({
              name: nodeType.name,
              displayName: nodeType.displayName,
              description: nodeType.description,
              version: nodeType.version,
              category: nodeType.group?.[0],
              credentials: nodeType.credentials,
              properties: includeProps ? nodeType.properties : undefined,
            });
          } else {
            // Try to find basic node info
            const basicNode = cache.nodes.find(n => n.name === nodeTypeName);
            if (basicNode) {
              result.nodeTypes.push({
                name: basicNode.name,
                displayName: basicNode.displayName,
                description: basicNode.description,
                version: basicNode.version,
                category: basicNode.group?.[0],
                credentials: basicNode.credentials?.map(c => ({ name: c })),
              });
            }
          }
        }

        result.nodeCount = result.nodeTypes.length;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'n8n_refresh_node_cache': {
        // Clear cache to force refresh
        nodeCache = null;

        // Re-discover nodes
        const cache = await discoverAndCacheNodes();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: 'Node cache refreshed successfully',
                nodeCount: cache.nodes.length,
                nodeTypesWithSchemas: cache.nodeTypes.size,
                timestamp: new Date(cache.timestamp).toISOString(),
              }, null, 2),
            },
          ],
        };
      }

      case 'n8n_get_cache_status': {
        const cacheStatus = nodeCache
          ? {
              isCached: true,
              nodeCount: nodeCache.nodes.length,
              nodeTypesWithSchemas: nodeCache.nodeTypes.size,
              cacheTimestamp: new Date(nodeCache.timestamp).toISOString(),
              cacheAgeSeconds: Math.round((Date.now() - nodeCache.timestamp) / 1000),
              cacheTtlSeconds: Math.round(NODE_CACHE_TTL_MS / 1000),
              expiresInSeconds: Math.max(0, Math.round((nodeCache.timestamp + NODE_CACHE_TTL_MS - Date.now()) / 1000)),
            }
          : {
              isCached: false,
              message: 'No nodes cached. Call n8n_list_nodes or n8n_get_node_types to populate cache.',
            };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                cache: cacheStatus,
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
                  'n8n_get_node_types',
                  'n8n_suggest_workflow',
                  'n8n_create_workflow',
                  'n8n_get_workflow',
                  'n8n_list_workflows',
                  'n8n_refresh_node_cache',
                  'n8n_get_cache_status',
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
  console.error('n8n MCP Server v3.0.0 started (using @modelcontextprotocol/sdk v1.25.3)');
  console.error('Node caching enabled with 1 hour TTL');
  console.error('Available tools:');
  console.error('  Node Discovery: n8n_list_nodes, n8n_get_node_details, n8n_get_node_types');
  console.error('  Cache Management: n8n_refresh_node_cache, n8n_get_cache_status');
  console.error('  Workflow Planning: n8n_suggest_workflow');
  console.error('  Workflow CRUD: n8n_create_workflow, n8n_get_workflow, n8n_list_workflows');
  console.error('  Workflow Control: n8n_activate_workflow, n8n_delete_workflow, n8n_execute_workflow');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
