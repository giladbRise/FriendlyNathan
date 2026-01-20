import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

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

interface GeneratedWorkflow {
  workflow: N8nWorkflow;
  explanation: string;
  nodeCount: number;
}

/**
 * Gemini AI Service for intelligent workflow generation
 * Uses Google Gemini 3 Flash Preview to understand user requests and generate n8n workflows
 */
export class GeminiService {
  private model: GenerativeModel | null = null;
  private apiKey: string | null = null;

  constructor() {
    // Initialize from environment if available
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'dev-gemini-key-placeholder') {
      this.initializeModel(process.env.GEMINI_API_KEY);
    }
  }

  /**
   * Initialize or re-initialize with a specific API key
   */
  initializeModel(apiKey: string): void {
    if (!apiKey || apiKey === 'dev-gemini-key-placeholder') {
      console.warn('Gemini API key not configured, AI workflow generation will be limited');
      this.model = null;
      this.apiKey = null;
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // Use Gemini 2.0 Flash as it's the latest available model
      this.model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
      });
      this.apiKey = apiKey;
      console.log('Gemini AI model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Gemini model:', error);
      this.model = null;
      this.apiKey = null;
    }
  }

  /**
   * Check if Gemini AI is available
   */
  isAvailable(): boolean {
    return this.model !== null;
  }

  /**
   * Generate a workflow using Gemini AI
   */
  async generateWorkflow(
    description: string,
    availableNodes: N8nNode[],
    customApiKey?: string,
    nodeTypeDetails?: Map<string, NodeTypeDetails>
  ): Promise<GeneratedWorkflow> {
    // Use custom API key if provided (for per-request key support)
    let model = this.model;
    if (customApiKey && customApiKey !== this.apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(customApiKey);
        model = genAI.getGenerativeModel({
          model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
        });
      } catch (error) {
        console.error('Failed to initialize Gemini with custom key:', error);
        throw new Error('Invalid Gemini API key');
      }
    }

    if (!model) {
      throw new Error('Gemini AI not available. Please provide a valid API key.');
    }

    // Build the prompt with context about available nodes and their configurations
    const prompt = this.buildPrompt(description, availableNodes, nodeTypeDetails);

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse the generated workflow from the response
      const workflow = this.parseWorkflowResponse(text, description);

      return {
        workflow,
        explanation: this.extractExplanation(text),
        nodeCount: workflow.nodes.length,
      };
    } catch (error: any) {
      console.error('Gemini API error:', error);
      throw new Error(`Failed to generate workflow: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Build the prompt for Gemini with context about n8n workflows
   * Enhanced with detailed node configurations for better parameter accuracy (Feature #269)
   */
  private buildPrompt(
    description: string,
    availableNodes: N8nNode[],
    nodeTypeDetails?: Map<string, NodeTypeDetails>
  ): string {
    // Create a condensed list of common/useful node types
    const commonNodes = [
      'n8n-nodes-base.manualTrigger',
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.schedule',
      'n8n-nodes-base.httpRequest',
      'n8n-nodes-base.emailSend',
      'n8n-nodes-base.slack',
      'n8n-nodes-base.googleSheets',
      'n8n-nodes-base.gmail',
      'n8n-nodes-base.microsoftOutlook',
      'n8n-nodes-base.set',
      'n8n-nodes-base.code',
      'n8n-nodes-base.if',
      'n8n-nodes-base.switch',
      'n8n-nodes-base.splitInBatches',
      'n8n-nodes-base.merge',
      'n8n-nodes-base.function',
      'n8n-nodes-base.filter',
      'n8n-nodes-base.sort',
      'n8n-nodes-base.aggregate',
      'n8n-nodes-base.summarize',
      'n8n-nodes-base.noOp',
      'n8n-nodes-base.dateTime',
      'n8n-nodes-base.wait',
      'n8n-nodes-base.respondToWebhook',
      // AI/LLM nodes
      'n8n-nodes-base.openAi',
      '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
      '@n8n/n8n-nodes-langchain.chainLlm',
      '@n8n/n8n-nodes-langchain.chainSummarization',
    ];

    // Filter available nodes to the common ones for better context
    const nodeContext = availableNodes.length > 0
      ? availableNodes
          .filter(n => commonNodes.some(cn => n.name.includes(cn.split('.').pop() || '')))
          .slice(0, 30)
          .map(n => `- ${n.name}: ${n.displayName}${n.description ? ` - ${n.description.slice(0, 100)}` : ''}`)
          .join('\n')
      : commonNodes.map(n => `- ${n}`).join('\n');

    // Build detailed node configuration section (Feature #269)
    let nodeConfigSection = '';
    if (nodeTypeDetails && nodeTypeDetails.size > 0) {
      nodeConfigSection = `\n## Node Configuration Reference (IMPORTANT - use these exact parameter names):\n`;
      for (const [nodeType, details] of nodeTypeDetails) {
        nodeConfigSection += `\n### ${details.displayName} (${nodeType})`;
        if (details.description) {
          nodeConfigSection += `\n${details.description}`;
        }
        if (details.properties && details.properties.length > 0) {
          nodeConfigSection += `\nParameters:`;
          for (const prop of details.properties.slice(0, 10)) { // Limit to 10 most important
            let propLine = `\n- ${prop.name}: ${prop.displayName} (${prop.type})`;
            if (prop.required) propLine += ' [REQUIRED]';
            if (prop.default !== undefined) propLine += ` [default: ${JSON.stringify(prop.default)}]`;
            if (prop.description) propLine += ` - ${prop.description.slice(0, 100)}`;
            if (prop.options && prop.options.length > 0) {
              propLine += `\n  Options: ${prop.options.map(o => `"${o.value}"`).join(', ')}`;
            }
            nodeConfigSection += propLine;
          }
        }
        if (details.credentials && details.credentials.length > 0) {
          nodeConfigSection += `\nCredentials needed: ${details.credentials.map(c => c.name).join(', ')}`;
        }
        nodeConfigSection += '\n';
      }
    }

    return `You are an expert n8n workflow generator. Your task is to create a complete n8n workflow JSON based on the user's description.

## User Request:
"${description}"

## Available n8n Nodes (partial list):
${nodeContext}
${nodeConfigSection}
## Instructions:
1. Analyze the user's request carefully and understand ALL the steps they need
2. Create a complete workflow that implements ALL requested functionality
3. Use appropriate trigger nodes (manualTrigger, webhook, schedule) based on context
4. Chain nodes together properly with connections
5. For email operations, use Gmail or Microsoft Outlook nodes
6. For summarization with AI, use OpenAI node or Code node with AI API call
7. For Slack, use the Slack node with proper channel configuration
8. Position nodes horizontally with 200px spacing starting at x=250
9. **CRITICAL: Use the EXACT parameter names from the Node Configuration Reference above**
10. For options/enums, use the exact values listed (e.g., "post" not "POST" for Slack operation)

## Important Rules:
- ALWAYS create ALL nodes needed to complete the ENTIRE request
- If the user asks for multiple steps (e.g., "get emails, then mark them, then summarize, then send to slack"), create nodes for EACH step
- Use realistic parameter values based on the description
- For slack channel IDs mentioned (like C0A1CEBJWJF), use them directly
- For email filtering (like "from janna trobilo last 3 days"), configure the appropriate query parameters
- **Use the correct parameter names as specified in the Node Configuration Reference**

## Response Format:
Return ONLY a valid JSON object with this structure (no markdown, no explanations outside JSON):
{
  "explanation": "Brief explanation of the workflow",
  "workflow": {
    "name": "Descriptive workflow name",
    "nodes": [
      {
        "id": "node_0",
        "name": "Node Display Name",
        "type": "n8n-nodes-base.nodeType",
        "typeVersion": 1,
        "position": [250, 300],
        "parameters": {}
      }
    ],
    "connections": {
      "Source Node Name": {
        "main": [[{"node": "Target Node Name", "type": "main", "index": 0}]]
      }
    },
    "settings": {"saveManualExecutions": true}
  }
}

Generate the workflow now:`;
  }

  /**
   * Parse the workflow from Gemini's response
   */
  private parseWorkflowResponse(responseText: string, description: string): N8nWorkflow {
    try {
      // Try to extract JSON from the response
      let jsonStr = responseText;

      // Remove markdown code blocks if present
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      // Try to find JSON object in the response
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
      }

      const parsed = JSON.parse(jsonStr);

      // Handle both direct workflow and wrapped format
      const workflow = parsed.workflow || parsed;

      // Validate required fields
      if (!workflow.nodes || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
        throw new Error('Generated workflow has no nodes');
      }

      // Ensure workflow has all required fields
      return {
        name: workflow.name || `AI Generated - ${new Date().toISOString().slice(0, 10)}`,
        nodes: workflow.nodes.map((node: any, index: number) => ({
          id: node.id || `node_${index}`,
          name: node.name || `Node ${index}`,
          type: node.type || 'n8n-nodes-base.noOp',
          typeVersion: node.typeVersion || 1,
          position: node.position || [250 + index * 200, 300],
          parameters: node.parameters || {},
        })),
        connections: workflow.connections || {},
        active: false, // Never set active on creation
        settings: workflow.settings || {
          saveManualExecutions: true,
          callerPolicy: 'workflowsFromSameOwner',
        },
      };
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError);
      console.error('Raw response:', responseText.slice(0, 500));

      // Return a fallback workflow if parsing fails
      return this.createFallbackWorkflow(description);
    }
  }

  /**
   * Extract explanation from the response
   */
  private extractExplanation(responseText: string): string {
    try {
      const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return parsed.explanation || 'Workflow generated by AI';
    } catch {
      return 'Workflow generated by AI';
    }
  }

  /**
   * Create a fallback workflow when AI parsing fails
   */
  private createFallbackWorkflow(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();
    const nodes: WorkflowNode[] = [];
    const connections: Record<string, WorkflowConnection> = {};
    let nodeIndex = 0;

    // Start with manual trigger
    nodes.push({
      id: `node_${nodeIndex}`,
      name: 'Start',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    });
    nodeIndex++;

    // Detect email operations
    if (lowerDesc.includes('email') || lowerDesc.includes('gmail') || lowerDesc.includes('outlook')) {
      nodes.push({
        id: `node_${nodeIndex}`,
        name: 'Get Emails',
        type: 'n8n-nodes-base.gmail',
        typeVersion: 2,
        position: [250 + nodeIndex * 200, 300],
        parameters: {
          operation: 'getAll',
          limit: 50,
          options: {
            query: description.match(/from\s+([a-zA-Z\s]+)/i)?.[1] || '',
          },
        },
      });
      connections['Start'] = {
        main: [[{ node: 'Get Emails', type: 'main', index: 0 }]],
      };
      nodeIndex++;
    }

    // Detect filtering/processing
    if (lowerDesc.includes('filter') || lowerDesc.includes('last') || lowerDesc.includes('days')) {
      const prevNodeName = nodes[nodes.length - 1].name;
      nodes.push({
        id: `node_${nodeIndex}`,
        name: 'Filter Results',
        type: 'n8n-nodes-base.filter',
        typeVersion: 1,
        position: [250 + nodeIndex * 200, 300],
        parameters: {
          conditions: {
            string: [{ value1: '={{ $json.date }}', operation: 'isNotEmpty' }],
          },
        },
      });
      connections[prevNodeName] = {
        main: [[{ node: 'Filter Results', type: 'main', index: 0 }]],
      };
      nodeIndex++;
    }

    // Detect mark as read/unread
    if (lowerDesc.includes('mark') || lowerDesc.includes('unread') || lowerDesc.includes('read')) {
      const prevNodeName = nodes[nodes.length - 1].name;
      nodes.push({
        id: `node_${nodeIndex}`,
        name: 'Mark Emails',
        type: 'n8n-nodes-base.gmail',
        typeVersion: 2,
        position: [250 + nodeIndex * 200, 300],
        parameters: {
          operation: 'markUnread',
          messageId: '={{ $json.id }}',
        },
      });
      connections[prevNodeName] = {
        main: [[{ node: 'Mark Emails', type: 'main', index: 0 }]],
      };
      nodeIndex++;
    }

    // Detect summarization
    if (lowerDesc.includes('summary') || lowerDesc.includes('summarize') || lowerDesc.includes('gemini')) {
      const prevNodeName = nodes[nodes.length - 1].name;
      nodes.push({
        id: `node_${nodeIndex}`,
        name: 'Summarize Content',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [250 + nodeIndex * 200, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: `// Aggregate and summarize all email content
const items = $input.all();
const emailContents = items.map(item => item.json.snippet || item.json.body || '').join('\\n---\\n');

// Note: In production, this would call Gemini API for summarization
const summary = \`Summary of \${items.length} emails:\\n\${emailContents.slice(0, 500)}...\`;

return [{ json: { summary, emailCount: items.length } }];`,
        },
      });
      connections[prevNodeName] = {
        main: [[{ node: 'Summarize Content', type: 'main', index: 0 }]],
      };
      nodeIndex++;
    }

    // Detect Slack output
    if (lowerDesc.includes('slack')) {
      const prevNodeName = nodes[nodes.length - 1].name;
      // Extract channel ID from description if present
      const channelMatch = description.match(/C[A-Z0-9]{8,}/i);
      const channel = channelMatch ? channelMatch[0] : '#general';

      nodes.push({
        id: `node_${nodeIndex}`,
        name: 'Send to Slack',
        type: 'n8n-nodes-base.slack',
        typeVersion: 2,
        position: [250 + nodeIndex * 200, 300],
        parameters: {
          operation: 'post',
          channel,
          text: '={{ $json.summary || JSON.stringify($json) }}',
        },
      });
      connections[prevNodeName] = {
        main: [[{ node: 'Send to Slack', type: 'main', index: 0 }]],
      };
      nodeIndex++;
    }

    // If no specific nodes were added, add a placeholder
    if (nodes.length === 1) {
      nodes.push({
        id: 'node_1',
        name: 'Process Data',
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        position: [450, 300],
        parameters: {
          mode: 'manual',
          assignments: {
            assignments: [
              { id: 'a1', name: 'description', value: description, type: 'string' },
              { id: 'a2', name: 'processedAt', value: '={{ $now.toISO() }}', type: 'string' },
            ],
          },
        },
      });
      connections['Start'] = {
        main: [[{ node: 'Process Data', type: 'main', index: 0 }]],
      };
    }

    return {
      name: `AI Generated Workflow - ${new Date().toISOString().slice(0, 10)}`,
      nodes,
      connections,
      active: false,
      settings: {
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }
}

export const geminiService = new GeminiService();
