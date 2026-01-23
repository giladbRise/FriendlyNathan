import fs from 'node:fs';
import path from 'node:path';

type McpToolResult = {
  content?: Array<{ type: 'text'; text: string }>;
};

interface McpNode {
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  version: number;
  requiresCredentials?: boolean;
  credentialTypes?: Array<{ name: string } | string>;
  isCustomNode?: boolean;
}

interface McpNodeType {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  category?: string;
  credentials?: Array<{ name: string; required?: boolean }>;
  properties?: Array<{
    name: string;
    displayName: string;
    type: string;
    default?: unknown;
    description?: string;
    required?: boolean;
    options?: Array<{ name: string; value: string | number | boolean; description?: string }>;
  }>;
}

interface McpListNodesResult {
  success: boolean;
  totalNodes: number;
  nodes: McpNode[];
}

interface McpNodeTypesResult {
  success: boolean;
  nodeCount: number;
  nodeTypes: McpNodeType[];
}

interface McpSuggestResult {
  success: boolean;
  suggestedNodes: string[];
  reasoning?: string[];
  template?: { nodes: Array<{ name: string; type: string }>; connections: Record<string, unknown> };
}

class N8nMcpService {
  private cachedServerPath: string | null = null;

  isAvailable(): boolean {
    return this.resolveServerPath() !== null;
  }

  async listNodes(
    n8nUrl: string,
    apiKey: string,
    options?: { category?: string; search?: string }
  ): Promise<McpListNodesResult> {
    return this.callTool<McpListNodesResult>('n8n_list_nodes', {
      category: options?.category,
      search: options?.search,
    }, n8nUrl, apiKey);
  }

  async getNodeTypes(
    n8nUrl: string,
    apiKey: string,
    nodeTypes?: string[]
  ): Promise<McpNodeTypesResult> {
    return this.callTool<McpNodeTypesResult>('n8n_get_node_types', {
      nodeTypes: nodeTypes?.length ? nodeTypes : undefined,
      includeProperties: true,
    }, n8nUrl, apiKey);
  }

  async suggestWorkflow(
    description: string,
    n8nUrl: string,
    apiKey: string
  ): Promise<McpSuggestResult> {
    return this.callTool<McpSuggestResult>('n8n_suggest_workflow', {
      description,
      includeTemplate: false,
    }, n8nUrl, apiKey);
  }

  private resolveServerPath(): string | null {
    if (this.cachedServerPath) return this.cachedServerPath;

    const envPath = process.env.MCP_N8N_SERVER_PATH;
    const candidates = [
      envPath,
      path.resolve(process.cwd(), 'mcp-server', 'dist', 'index.js'),
      path.resolve(process.cwd(), '..', 'mcp-server', 'dist', 'index.js'),
    ].filter((candidate): candidate is string => !!candidate);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.cachedServerPath = candidate;
        return candidate;
      }
    }

    return null;
  }

  private async callTool<T>(
    toolName: string,
    args: Record<string, unknown>,
    n8nUrl: string,
    apiKey: string
  ): Promise<T> {
    const serverPath = this.resolveServerPath();
    if (!serverPath) {
      throw new Error('MCP server not found. Set MCP_N8N_SERVER_PATH or build mcp-server.');
    }

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      env: {
        N8N_API_URL: n8nUrl,
        N8N_API_KEY: apiKey,
      },
      cwd: path.dirname(serverPath),
      stderr: 'pipe',
    });

    const client = new Client({ name: 'rise-n8n-backend', version: '1.0.0' });

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      }) as McpToolResult;

      const text = result.content?.find((item) => item.type === 'text')?.text;
      if (!text) {
        throw new Error(`MCP tool ${toolName} returned no text content`);
      }

      return JSON.parse(text) as T;
    } finally {
      await client.close();
    }
  }
}

export const n8nMcpService = new N8nMcpService();
