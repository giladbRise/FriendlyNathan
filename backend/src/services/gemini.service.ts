import crypto from 'crypto';

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
  ai_model?: Array<Array<{ node: string; type: string; index: number }>>;
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

export interface WorkflowIntent {
  sender?: string | null;
  days?: number | null;
  slackChannel?: string | null;
  spreadsheetId?: string | null;
  spreadsheetGid?: string | null;
  wantsMarkUnread?: boolean;
  wantsGeminiSummary?: boolean;
  wantsSlack?: boolean;
  wantsEmail?: boolean;
  wantsSpreadsheet?: boolean;
  wantsGoogleSheets?: boolean;
  requestedNodeTypes?: string[];
}

export interface VerificationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  analysis: string;
}

// ─── Vertex AI Auth Helpers ────────────────────────────────────────────────

const VERTEX_MODEL = 'gemini-3.1-pro-preview';
// gemini-3.1-pro-preview is only available via the global endpoint
const VERTEX_GLOBAL_MODELS = new Set(['gemini-3.1-pro-preview']);
const TOKEN_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_CACHE_TTL_MS = 55 * 60 * 1000; // 55 minutes (tokens last 60)

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Extract GCP project ID from service account email: name@project-id.iam.gserviceaccount.com */
function projectIdFromEmail(saEmail: string): string {
  const parts = saEmail.split('@');
  if (parts.length !== 2) throw new Error('Invalid service account email format');
  const domain = parts[1]; // project-id.iam.gserviceaccount.com
  return domain.split('.')[0]; // project-id
}

/** Sign a JWT for Google OAuth2 service account flow using RS256 */
function signServiceAccountJwt(saEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: saEmail,
    sub: saEmail,
    aud: TOKEN_URL,
    scope: TOKEN_SCOPE,
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const toSign = `${header}.${payload}`;
  const pem = privateKey.replace(/\\n/g, '\n');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  sign.end();
  const signature = sign.sign(pem, 'base64url');
  return `${toSign}.${signature}`;
}

/** Exchange a signed JWT for a Google OAuth2 Bearer access token */
async function fetchAccessToken(saEmail: string, privateKey: string): Promise<string> {
  const jwt = signServiceAccountJwt(saEmail, privateKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(`Vertex AI token exchange failed: ${data?.error_description || data?.error || res.status}`);
  }
  return data.access_token as string;
}

/**
 * Gemini AI Service — now using Vertex AI with service account JWT auth.
 * Model: gemini-2.0-flash-001
 * Auth: Service account email + private key → OAuth2 Bearer token (cached 55 min)
 */
export class GeminiService {
  private serverSaEmail: string | null = null;
  private serverPrivateKey: string | null = null;

  /** Token cache keyed by SA email to avoid re-fetching every request */
  private tokenCache = new Map<string, CachedToken>();

  /** Generation config for structured JSON outputs (low temperature for consistency) */
  private readonly structuredGenerationConfig = {
    temperature: 0.2,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 8192,
  };

  /** Max retries for transient errors (429, 503) */
  private readonly MAX_RETRIES = 3;

  constructor() {
    const email = process.env.VERTEX_SA_EMAIL;
    const key = process.env.VERTEX_PRIVATE_KEY;
    if (email && key && email !== 'your-sa@project.iam.gserviceaccount.com') {
      this.serverSaEmail = email;
      this.serverPrivateKey = key;
      console.log(`Vertex AI initialized with SA: ${email}`);
    } else {
      console.warn('Vertex AI credentials not configured in VERTEX_SA_EMAIL / VERTEX_PRIVATE_KEY');
    }
  }

  /** Returns true if server-level Vertex AI credentials are configured */
  isAvailable(): boolean {
    return this.serverSaEmail !== null && this.serverPrivateKey !== null;
  }

  /** Get a cached or fresh Bearer token for the given SA credentials */
  private async getBearerToken(saEmail: string, privateKey: string): Promise<string> {
    const cached = this.tokenCache.get(saEmail);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
    try {
      const token = await fetchAccessToken(saEmail, privateKey);
      this.tokenCache.set(saEmail, { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
      return token;
    } catch (error) {
      this.tokenCache.delete(saEmail);
      throw error;
    }
  }

  /** Resolve which SA credentials to use: custom (user-provided) or server defaults */
  private resolveCredentials(customSaEmail?: string, customPrivateKey?: string): { saEmail: string; privateKey: string } {
    if (customSaEmail && customPrivateKey) {
      return { saEmail: customSaEmail, privateKey: customPrivateKey };
    }
    if (this.serverSaEmail && this.serverPrivateKey) {
      return { saEmail: this.serverSaEmail, privateKey: this.serverPrivateKey };
    }
    throw new Error('Vertex AI not available. Please provide service account credentials.');
  }

  /**
   * Fix a workflow based on verification issues and suggestions
   */
  async fixWorkflow(
    workflow: N8nWorkflow,
    description: string,
    issues: string[],
    suggestions: string[],
    availableNodes: N8nNode[],
    nodeTypeDetails?: Map<string, NodeTypeDetails>,
    customSaEmail?: string,
    customPrivateKey?: string
  ): Promise<{ workflow: N8nWorkflow; fixesApplied: string[] }> {
    let credentials: { saEmail: string; privateKey: string };
    try {
      credentials = this.resolveCredentials(customSaEmail, customPrivateKey);
    } catch {
      return { workflow, fixesApplied: [] };
    }

    const nodeTypesInfo = nodeTypeDetails
      ? Array.from(nodeTypeDetails.values())
          .slice(0, 50)
          .map((nt) => ({
            name: nt.name,
            displayName: nt.displayName,
            properties: nt.properties?.slice(0, 10).map((p) => ({
              name: p.name,
              type: p.type,
              required: p.required,
              options: p.options?.slice(0, 5),
            })),
          }))
      : [];

    const prompt = `You are an expert n8n workflow engineer. Fix the following workflow based on the identified issues and suggestions.

User Request: "${description}"

Current Workflow (JSON):
${JSON.stringify(workflow, null, 2)}

Issues to Fix:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

Suggestions to Apply:
${suggestions.map((sug, i) => `${i + 1}. ${sug}`).join('\n')}

Available Node Types (sample):
${JSON.stringify(nodeTypesInfo.slice(0, 20), null, 2)}

Instructions:
1. Fix all the critical issues mentioned above
2. Apply the suggestions to improve the workflow
3. Ensure the workflow still accomplishes the user's request
4. Keep the workflow structure as similar as possible (only change what's necessary)
5. **CRITICAL: Keep the exact same workflow name - do NOT change it or add suffixes like " - Fixed"**
6. Return the workflow with fixes applied and a list of what was fixed

Return ONLY valid JSON with this schema (no markdown, no code blocks):
{
  "workflow": { ...fixed n8n workflow object with SAME name... },
  "fixesApplied": ["description of fix 1", "description of fix 2"]
}`;

    try {
      const text = await this.callVertexAI(prompt, credentials.saEmail, credentials.privateKey);
      const parsed = this.parseJsonResponse(text) as any;

      if (parsed.workflow && parsed.workflow.nodes) {
        const fixedWorkflow = this.normalizeWorkflow(parsed.workflow, availableNodes, nodeTypeDetails);
        return {
          workflow: fixedWorkflow,
          fixesApplied: Array.isArray(parsed.fixesApplied) ? parsed.fixesApplied : [],
        };
      }

      return { workflow, fixesApplied: [] };
    } catch (error) {
      console.warn('Gemini workflow fix failed:', error);
      return { workflow, fixesApplied: [] };
    }
  }

  /**
   * Verify a generated workflow against the user description
   */
  async verifyWorkflow(
    workflow: N8nWorkflow,
    description: string,
    customSaEmail?: string,
    customPrivateKey?: string
  ): Promise<VerificationResult> {
    let credentials: { saEmail: string; privateKey: string };
    try {
      credentials = this.resolveCredentials(customSaEmail, customPrivateKey);
    } catch {
      return {
        isValid: true, // Assume valid if no AI to check
        issues: [],
        suggestions: [],
        analysis: 'AI verification unavailable (no credentials)',
      };
    }

    const prompt = `You are an expert n8n workflow auditor. Verify the following workflow against the user's request.

User Request: "${description}"

Generated Workflow (JSON):
${JSON.stringify(workflow, null, 2)}

## Verification Checklist:

1. **Completeness**: Does the workflow implement ALL steps the user asked for? Check every noun and verb in the request.
2. **Node correctness**: Are the right node types used? (e.g., BigQuery requests need n8n-nodes-base.googleBigQuery, Confluence updates need n8n-nodes-base.confluence, not httpRequest)
3. **Data flow**: Does data flow correctly from source → transform → destination?
4. **Missing nodes**: Are any required intermediate steps missing?
   - BigQuery workflow: needs Schedule/Manual Trigger → googleBigQuery (executeQuery) → Code node (build HTML) → confluence GET (get current version) → confluence UPDATE (with version+1)
   - If BigQuery result rows need to become an HTML table, there MUST be a Code node that builds the HTML string
   - If updating Confluence, there MUST be a GET before UPDATE to fetch the current version number
5. **Parameter completeness**: Do nodes have required parameters set? (e.g., BigQuery needs projectId + query, Confluence update needs pageId + version + body)
6. **Connection integrity**: Are all nodes connected? No orphaned nodes?
7. **AI nodes**: AI/LLM nodes should ONLY be present if the user explicitly asked for AI processing. If the user only asked to query data and update a page — no AI nodes should exist.

## Critical Issues (mark isValid=false):
- Missing entire steps the user asked for
- Wrong node type used (e.g., httpRequest instead of googleBigQuery)
- BigQuery node missing query parameter
- Confluence update without prior GET to fetch version
- Disconnected nodes

## Suggestions (isValid stays true, list as suggestions):
- Parameter values that could be more specific
- Missing optional but useful nodes (e.g., error handling)
- Better data transformation approaches

Return ONLY valid JSON with this schema (no markdown):
{
  "isValid": boolean,
  "issues": string[],     // Critical blocking errors — be specific (e.g., "Missing Code node to transform BigQuery rows into HTML table")
  "suggestions": string[], // Non-blocking improvements
  "analysis": string       // Brief summary of what the workflow does and what's missing
}`;

    try {
      const text = await this.callVertexAI(prompt, credentials.saEmail, credentials.privateKey);
      const parsed = this.parseJsonResponse(text) as any;

      return {
        isValid: typeof parsed.isValid === 'boolean' ? parsed.isValid : true,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        analysis: typeof parsed.analysis === 'string' ? parsed.analysis : 'Verification completed',
      };
    } catch (error) {
      console.warn('Gemini workflow verification failed:', error);
      return {
        isValid: true,
        issues: [],
        suggestions: [],
        analysis: 'Verification failed due to API error',
      };
    }
  }

  /**
   * Generate a workflow using Gemini AI
   */
  async generateWorkflow(
    description: string,
    availableNodes: N8nNode[],
    customSaEmail?: string,
    customPrivateKey?: string,
    nodeTypeDetails?: Map<string, NodeTypeDetails>,
    suggestedNodeTypes?: string[],
    learningGuidance?: string
  ): Promise<GeneratedWorkflow> {
    const credentials = this.resolveCredentials(customSaEmail, customPrivateKey);

    // Build the prompt with context about available nodes and their configurations
    const prompt = this.buildPrompt(description, availableNodes, nodeTypeDetails, suggestedNodeTypes, learningGuidance);

    try {
      const text = await this.callVertexAI(prompt, credentials.saEmail, credentials.privateKey);

      // Parse the generated workflow from the response
      const workflow = this.normalizeWorkflow(
        this.parseWorkflowResponse(text, description),
        availableNodes,
        nodeTypeDetails
      );

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
   * Analyze a workflow request to extract structured intent using Gemini
   */
  async analyzeWorkflowIntent(
    description: string,
    availableNodes: N8nNode[],
    customSaEmail?: string,
    customPrivateKey?: string
  ): Promise<WorkflowIntent | null> {
    let credentials: { saEmail: string; privateKey: string };
    try {
      credentials = this.resolveCredentials(customSaEmail, customPrivateKey);
    } catch {
      return null;
    }

    const prompt = this.buildIntentPrompt(description, availableNodes);

    try {
      const text = await this.callVertexAI(prompt, credentials.saEmail, credentials.privateKey);
      return this.parseIntentResponse(text);
    } catch (error) {
      console.warn('Gemini intent analysis failed:', error);
      return null;
    }
  }

  /** Call Vertex AI Gemini with retry logic for transient errors */
  private async callVertexAI(prompt: string, saEmail: string, privateKey: string): Promise<string> {
    const projectId = projectIdFromEmail(saEmail);
    // Some models (e.g. gemini-3.1-pro-preview) are only available via the global endpoint
    const isGlobal = VERTEX_GLOBAL_MODELS.has(VERTEX_MODEL);
    const location = isGlobal ? 'global' : (process.env.VERTEX_LOCATION || 'us-central1');
    const baseHost = isGlobal ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    const url = `https://${baseHost}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${VERTEX_MODEL}:generateContent`;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const token = await this.getBearerToken(saEmail, privateKey);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: this.structuredGenerationConfig,
          }),
        });

        const data = await res.json() as any;

        if (!res.ok) {
          const errMsg = data?.error?.message || `Vertex AI error (${res.status})`;
          if (res.status === 401) {
            this.tokenCache.delete(saEmail);
          }
          throw new Error(errMsg);
        }

        const text = data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text || '')
          .join('');

        if (!text) throw new Error('Vertex AI returned empty response');
        return text;

      } catch (err: any) {
        const msg = err.message || '';
        const isRetryable = msg.includes('429') || msg.includes('503') || msg.includes('500') ||
          msg.includes('rate limit') || msg.includes('quota') || msg.includes('overloaded') ||
          msg.includes('unavailable') || msg.includes('fetch failed') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED';

        if (isRetryable && attempt < this.MAX_RETRIES - 1) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`Vertex AI transient error (attempt ${attempt + 1}/${this.MAX_RETRIES}), retrying in ${backoffMs}ms:`, msg);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Vertex AI: max retries exceeded');
  }

  /**
   * Build the prompt for Gemini with context about n8n workflows
   * Enhanced with detailed node configurations for better parameter accuracy (Feature #269)
   * Includes learned patterns from previous workflow generations (Feature #274)
   */
  private buildPrompt(
    description: string,
    availableNodes: N8nNode[],
    nodeTypeDetails?: Map<string, NodeTypeDetails>,
    suggestedNodeTypes?: string[],
    learningGuidance?: string
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
      'n8n-nodes-base.googleDocs',
      'n8n-nodes-base.googleDrive',
      'n8n-nodes-base.googleBigQuery',
      'n8n-nodes-base.confluence',
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
      // AI/LLM nodes — MUST use chain+model pattern (Edit Fields → chainLlm → lmChatGoogleGemini)
      '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
      '@n8n/n8n-nodes-langchain.chainLlm',
      '@n8n/n8n-nodes-langchain.chainSummarization',
    ];

    const descriptionLower = description.toLowerCase();
    const suggestedSet = new Set((suggestedNodeTypes || []).map((node) => node.toLowerCase()));

    // Extra keyword aliases for scoring nodes that don't match by display name
    const nodeKeywordAliases: Record<string, string[]> = {
      'n8n-nodes-base.googleBigQuery': ['bigquery', 'big query', 'bq', 'gcp query'],
      'n8n-nodes-base.confluence': ['confluence', 'atlassian', 'wiki', 'wiki page'],
      'n8n-nodes-base.scheduleTrigger': ['schedule', 'weekly', 'daily', 'every week', 'once a week', 'cron'],
      '@n8n/n8n-nodes-langchain.chainLlm': ['summarize with ai', 'ai analysis', 'use ai', 'use gemini'],
    };

    const nodeContext = availableNodes.length > 0
      ? availableNodes
          .map((node) => {
            let score = 0;
            if (suggestedSet.has(node.name.toLowerCase())) score += 5;
            if (descriptionLower.includes(node.displayName.toLowerCase())) score += 2;
            if (descriptionLower.includes(node.name.split('.').pop()?.toLowerCase() || '')) score += 1;
            // Alias-based scoring for nodes with names that don't match common keywords
            const aliases = nodeKeywordAliases[node.name] || [];
            for (const alias of aliases) {
              if (descriptionLower.includes(alias)) { score += 4; break; }
            }
            return { node, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 40)
          .map(({ node }) => `- ${node.name}: ${node.displayName}${node.description ? ` - ${node.description.slice(0, 100)}` : ''}`)
          .join('\n')
      : commonNodes.map(n => `- ${n}`).join('\n');

    const allowedNodesSection = availableNodes.length > 0
      ? `\n## Allowed Node Types (MUST use these exact type names):\n${availableNodes
          .map((node) => `- ${node.name}`)
          .join('\n')}\n`
      : '';

    const suggestedNodesSection = suggestedNodeTypes && suggestedNodeTypes.length > 0
      ? `\n## Suggested Node Types (from MCP analysis):\n${suggestedNodeTypes
          .map((node) => `- ${node}`)
          .join('\n')}\n`
      : '';

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

## FIRST: Extract Key Information from the Description
Before generating the workflow, identify and extract:
- Slack Channel IDs (format: C followed by 10-11 alphanumeric characters, e.g., C0A1CEBJWJF)
- Sender emails or names (for email filtering)
- Time ranges (e.g., "last 3 days", "past week")
- Spreadsheet URLs or IDs
- Any specific parameter values mentioned

Use these extracted values DIRECTLY in the workflow parameters.

## Available n8n Nodes (partial list):
${nodeContext}
${allowedNodesSection}${suggestedNodesSection}
${nodeConfigSection}## Instructions:
1. Analyze the user's request carefully and understand ALL the steps they need
2. Create a complete workflow that implements ALL requested functionality
3. Use appropriate trigger nodes (manualTrigger, webhook, schedule) based on context
4. Chain nodes together properly with connections
5. For email operations, use Gmail nodes ONLY (no Microsoft Outlook)
6. For spreadsheet/document operations, use Google Sheets/Docs/Drive ONLY (no Microsoft Excel, no Airtable, no Notion)
   - EXCEPTION: Confluence (Atlassian) is an allowed documentation/wiki platform — use n8n-nodes-base.confluence
7. **AI Nodes — ONLY if explicitly requested:**
   - **DO NOT add AI/LLM nodes unless the user explicitly asks for AI, summarization, analysis, or uses words like "summarize", "analyze with AI", "use Gemini", "LLM", etc.**
   - If the user only asks to query a database and update a page — do NOT add AI nodes. Just use BigQuery + Code/Set + Confluence.
   - WHEN AI IS needed, use the chain+model pattern:
     a) Edit Fields node (n8n-nodes-base.set) to prepare input with "chatInput" field (string type)
     b) Basic LLM Chain node (@n8n/n8n-nodes-langchain.chainLlm) for AI processing
     c) Google Gemini Chat Model node (@n8n/n8n-nodes-langchain.lmChatGoogleGemini) as the AI model
   - Connection pattern: EditFields → chainLlm (via main connection) AND lmChatGoogleGemini → chainLlm (via ai_model connection)
   - NEVER use standalone AI nodes without this full pattern
   - NEVER use n8n-nodes-base.openAi
8. For Slack, use the Slack node with proper channel configuration
9. Position nodes horizontally with 200px spacing starting at x=250
10. **CRITICAL: Use the EXACT parameter names from the Node Configuration Reference above**
11. For options/enums, use the exact values listed (e.g., "post" not "POST" for Slack operation)
12. ONLY use node types from "Allowed Node Types". If a requested node is unavailable, choose the closest allowed Google ecosystem node and reflect any assumptions in the explanation.
13. **SERVICE RESTRICTION: Prefer Google ecosystem products** (Gmail, Google Sheets, Google Docs, Google Drive). If the user mentions Microsoft, Airtable, Notion, substitute with Google equivalent.
    - ALLOWED EXCEPTIONS: Confluence/Atlassian wiki (use n8n-nodes-base.confluence), BigQuery (use n8n-nodes-base.googleBigQuery)
14. **BigQuery nodes** (n8n-nodes-base.googleBigQuery): Use operation="executeQuery" with parameters: { "projectId": "...", "query": "SELECT ...", "location": "US" }. Credentials: googleApi.
15. **Confluence nodes** (n8n-nodes-base.confluence):
    - To GET a page: operation="get", resource="page", parameters: { "pageId": "PAGE_ID" }
    - To UPDATE a page with HTML: operation="update", resource="page", parameters: { "pageId": "PAGE_ID", "title": "...", "version": "={{ $json.version.number + 1 }}", "body": "HTML_CONTENT", "bodyType": "storage" }
    - ALWAYS fetch the current page version first (GET), then update with version+1
    - For interactive HTML tables in Confluence: use the Storage Format (XHTML-based). Build a <table> with search/filter using HTML macro if supported, or include a full self-contained HTML page with JavaScript search using the HTML macro.
    - Credentials: confluenceApi
${learningGuidance || ''}## Important Rules - READ CAREFULLY:
- ALWAYS create ALL nodes needed to complete the ENTIRE request
- If the user asks for multiple steps (e.g., "get emails, then mark them, then summarize, then send to slack"), create nodes for EACH step
- Use realistic parameter values based on the description
- For slack channel IDs mentioned (like C0A1CEBJWJF), use them directly in the "channel" parameter
- For email filtering (like "from janna trobilo last 3 days"), configure the appropriate query parameters

## CRITICAL VALIDATION RULES - FAILURE TO FOLLOW THESE WILL BREAK THE WORKFLOW:

1. **Parameter Values MUST Match Exactly**:
   - When a parameter has Options listed (e.g., "post", "update", "delete"), you MUST use the EXACT value from the list
   - Example: If options are "post", "update", "delete" - use "post", NOT "POST", NOT "Post", NOT "posting"
   - Example: If options are "Mark as Read", "Mark as Unread" - use "Mark as Unread", NOT "markUnread", NOT "unread"
   - Look at the Options list in Node Configuration Reference and copy the value EXACTLY

2. **AI/LLM Nodes MUST Use Chain+Model Pattern**:
   - ALWAYS create THREE nodes: Edit Fields (set chatInput) → Basic LLM Chain (@n8n/n8n-nodes-langchain.chainLlm) → Google Gemini Chat Model (@n8n/n8n-nodes-langchain.lmChatGoogleGemini)
   - The chainLlm node gets input from {{ $json.chatInput }} and MUST connect to lmChatGoogleGemini via "ai_model" connection type
   - NEVER use standalone OpenAI nodes or standalone Gemini nodes without the chain pattern
   - NEVER create an AI node without a prompt - it will fail

3. **Slack Nodes Require Channel**:
   - When using Slack with operation="post", the "channel" parameter is REQUIRED
   - Extract channel IDs from the description (format: C followed by alphanumeric, e.g., "C0A1CEBJWJF")
   - If a channel ID is mentioned in the description, use it EXACTLY in the "channel" parameter
   - NEVER leave the channel parameter empty - if no ID is found, use "#general" as fallback

4. **Gmail Operations Use Exact Names**:
   - For marking emails as unread, use operation="markUnread" (or check the exact option value in Node Configuration Reference)
   - For getting emails, use operation="getAll"
   - Always check the Options list and use the exact value

5. **Parameter Names Must Match Node Configuration**:
   - Use the exact parameter names from the Node Configuration Reference
   - Example: If the config shows "documentId" for Google Sheets, use "documentId", NOT "spreadsheetId"
   - Example: If the config shows "channel" for Slack, use "channel", NOT "channelId" or "channelName"

6. **Confluence Page Updates MUST follow this exact pattern**:
   - Step 1: GET the current page to retrieve version number (operation="get", resource="page")
   - Step 2: Use a Code or Set node to transform BigQuery results into an HTML table string with inline JavaScript for live search/filter
   - Step 3: UPDATE the page with: version="{{ $('Get Page').item.json.version.number + 1 }}", bodyType="storage", body=the HTML string
   - The HTML for an interactive table MUST include: <input> search box, <table> with <thead>/<tbody>, and inline <script> that filters rows on keyup
   - Example HTML template for interactive Confluence table:
     <html><body><input id="search" placeholder="Search..." onkeyup="..."/><table><thead><tr><th>Publisher</th><th>CSM</th></tr></thead><tbody>{{rows}}</tbody></table><script>document.getElementById('search').onkeyup=function(){var v=this.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(function(r){r.style.display=r.textContent.toLowerCase().includes(v)?'':'none'})}</script></body></html>

## Response Format:
Return ONLY a valid JSON object with this structure (no markdown, no explanations outside JSON):
{
  "explanation": "Brief explanation of the workflow",
  "workflow": {
    "name": "Descriptive workflow name (use clean, professional names - NO suffixes like '- Fixed', '- Updated', etc.)",
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

  private buildIntentPrompt(description: string, availableNodes: N8nNode[]): string {
    const allowedNodes = availableNodes.length > 0
      ? availableNodes.map((node) => `${node.name} | ${node.displayName}`).join('\n')
      : '';

    return `You are an expert n8n workflow analyst. Extract structured intent from the user request.

User request:
"${description}"

Allowed node types (use only these in requestedNodeTypes):
${allowedNodes}

Return ONLY valid JSON with this schema (no markdown):
{
  "sender": string | null,
  "days": number | null,
  "slackChannel": string | null,
  "spreadsheetId": string | null,
  "spreadsheetGid": string | null,
  "wantsMarkUnread": boolean,
  "wantsGeminiSummary": boolean,
  "wantsSlack": boolean,
  "wantsEmail": boolean,
  "wantsSpreadsheet": boolean,
  "wantsGoogleSheets": boolean,
  "requestedNodeTypes": string[]
}`;
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

  private parseIntentResponse(responseText: string): WorkflowIntent | null {
    try {
      const parsed = this.parseJsonResponse(responseText) as WorkflowIntent;
      if (!parsed || typeof parsed !== 'object') return null;

      const cleanString = (value: unknown) => (typeof value === 'string' ? value : null);
      const cleanNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
      const cleanBool = (value: unknown) => (typeof value === 'boolean' ? value : undefined);

      return {
        sender: cleanString(parsed.sender),
        days: cleanNumber(parsed.days),
        slackChannel: cleanString(parsed.slackChannel),
        spreadsheetId: cleanString(parsed.spreadsheetId),
        spreadsheetGid: cleanString(parsed.spreadsheetGid),
        wantsMarkUnread: cleanBool(parsed.wantsMarkUnread),
        wantsGeminiSummary: cleanBool(parsed.wantsGeminiSummary),
        wantsSlack: cleanBool(parsed.wantsSlack),
        wantsEmail: cleanBool(parsed.wantsEmail),
        wantsSpreadsheet: cleanBool(parsed.wantsSpreadsheet),
        wantsGoogleSheets: cleanBool(parsed.wantsGoogleSheets),
        requestedNodeTypes: Array.isArray(parsed.requestedNodeTypes)
          ? parsed.requestedNodeTypes.filter((node) => typeof node === 'string')
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private parseJsonResponse(responseText: string): unknown {
    let jsonStr = responseText;

    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
    }

    return JSON.parse(jsonStr);
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
   * Normalize workflow nodes to match available node types and versions
   */
  private normalizeWorkflow(
    workflow: N8nWorkflow,
    availableNodes: N8nNode[],
    nodeTypeDetails?: Map<string, NodeTypeDetails>
  ): N8nWorkflow {
    if (availableNodes.length === 0) {
      return workflow;
    }

    const availableMap = new Map(availableNodes.map((node) => [node.name, node]));
    const normalizedLookup = new Map<string, string>();

    const normalizeKey = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const node of availableNodes) {
      normalizedLookup.set(normalizeKey(node.name), node.name);
      normalizedLookup.set(normalizeKey(node.displayName), node.name);
      const short = node.name.split('.').pop();
      if (short) {
        normalizedLookup.set(normalizeKey(short), node.name);
      }
    }

    const fallbackType = availableMap.get('n8n-nodes-base.noOp')
      ? 'n8n-nodes-base.noOp'
      : availableMap.get('n8n-nodes-base.set')
      ? 'n8n-nodes-base.set'
      : availableNodes[0]?.name;

    const normalizedNodes = workflow.nodes.map((node, index) => {
      let normalizedType = node.type;
      if (!availableMap.has(normalizedType)) {
        const normalizedKey = normalizeKey(node.type || '');
        const byType = normalizedLookup.get(normalizedKey);
        const byName = normalizedLookup.get(normalizeKey(node.name || ''));
        normalizedType = byType || byName || fallbackType || node.type;
      }

      const typeDetails = nodeTypeDetails?.get(normalizedType);
      const availableNode = availableMap.get(normalizedType);

      return {
        ...node,
        id: node.id || `node_${index}`,
        type: normalizedType,
        typeVersion: typeDetails?.version || availableNode?.version || node.typeVersion || 1,
        parameters: typeof node.parameters === 'object' && node.parameters ? node.parameters : {},
      };
    });

    return {
      ...workflow,
      nodes: normalizedNodes,
      active: false,
    };
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
    if (lowerDesc.includes('email') || lowerDesc.includes('gmail') || lowerDesc.includes('mail')) {
      nodes.push({
        id: `node_${nodeIndex}`,
        name: 'Get Emails',
        type: 'n8n-nodes-base.gmail',
        typeVersion: 2,
        position: [250 + nodeIndex * 200, 300],
        parameters: {
          operation: 'getAll',
          limit: 50,
          filters: {
            q: description.match(/from\s+([a-zA-Z\s]+)/i)?.[1] || '',
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

    // Detect summarization — use chain+model pattern (Edit Fields → chainLlm → lmChatGoogleGemini)
    if (lowerDesc.includes('summary') || lowerDesc.includes('summarize') || lowerDesc.includes('gemini') || lowerDesc.includes('ai')) {
      const prevNodeName = nodes[nodes.length - 1].name;

      // Step 1: Edit Fields node to prepare chatInput
      nodes.push({
        id: `node_${nodeIndex}`,
        name: 'Prepare AI Input',
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        position: [250 + nodeIndex * 200, 300],
        parameters: {
          mode: 'manual',
          assignments: {
            assignments: [
              {
                id: 'chatInput',
                name: 'chatInput',
                value: '=Summarize the following content with key points and action items:\\n\\n{{ $json.snippet || $json.body || $json.text || JSON.stringify($json) }}',
                type: 'string',
              },
            ],
          },
        },
      });
      connections[prevNodeName] = {
        main: [[{ node: 'Prepare AI Input', type: 'main', index: 0 }]],
      };
      nodeIndex++;

      // Step 2: Basic LLM Chain node
      nodes.push({
        id: `node_${nodeIndex}`,
        name: 'Basic LLM Chain',
        type: '@n8n/n8n-nodes-langchain.chainLlm',
        typeVersion: 1,
        position: [250 + nodeIndex * 200, 300],
        parameters: {},
      });
      connections['Prepare AI Input'] = {
        main: [[{ node: 'Basic LLM Chain', type: 'main', index: 0 }]],
      };
      nodeIndex++;

      // Step 3: Google Gemini Chat Model (connected via ai_model)
      nodes.push({
        id: `node_${nodeIndex}`,
        name: 'Google Gemini Chat Model',
        type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
        typeVersion: 1,
        position: [250 + (nodeIndex - 1) * 200, 500],
        parameters: {
          model: 'gemini-pro',
        },
      });
      // ai_model connection from chainLlm to Gemini
      connections['Basic LLM Chain'] = {
        ...connections['Basic LLM Chain'],
        ai_model: [[{ node: 'Google Gemini Chat Model', type: 'ai_model', index: 0 }]],
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
