import axios from 'axios';
import { io } from '../index';
import { geminiService, WorkflowIntent } from './gemini.service';
import { randomUUID } from 'crypto';
import { workflowLogger } from './workflow-logger.service';
import { n8nMcpService } from './mcpN8n.service';
import { workflowGeneratorService } from './workflowGenerator.service';
import { workflowLearningService } from './workflow-learning.service';
import { workflowGapDetectorService, ClarificationQuestion } from './workflow-gap-detector.service';
import prisma from '../lib/prisma';

// Cache TTL in milliseconds (1 hour)
const NODE_CACHE_TTL_MS = 60 * 60 * 1000;
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const MAX_PREVIEW_CACHE_SIZE = 100;

/**
 * Generate a unique workflow name based on description keywords
 * Format: [Type] Workflow - [Date] [Time] #[RandomSuffix]
 * Examples:
 *   - "Email Workflow - 2026-01-20 16:45 #abc123"
 *   - "Slack + HTTP Workflow - 2026-01-20 16:45 #xyz789"
 */
function generateUniqueWorkflowName(description: string): string {
  const lowerDesc = description.toLowerCase();
  const keywords: string[] = [];

  // Detect main services/actions from description
  if (lowerDesc.includes('email') || lowerDesc.includes('gmail')) keywords.push('Email');
  if (lowerDesc.includes('slack')) keywords.push('Slack');
  if (lowerDesc.includes('http') || lowerDesc.includes('webhook') || lowerDesc.includes('api')) keywords.push('HTTP');
  if (lowerDesc.includes('google sheet') || lowerDesc.includes('spreadsheet')) keywords.push('Sheets');
  if (lowerDesc.includes('google doc') || lowerDesc.includes('document')) keywords.push('Docs');
  if (lowerDesc.includes('google drive') || lowerDesc.includes('drive')) keywords.push('Drive');
  if (lowerDesc.includes('ai') || lowerDesc.includes('gemini') || lowerDesc.includes('summarize') || lowerDesc.includes('summary')) keywords.push('AI');
  if (lowerDesc.includes('schedule') || lowerDesc.includes('cron')) keywords.push('Scheduled');
  if (lowerDesc.includes('database') || lowerDesc.includes('postgres') || lowerDesc.includes('mysql')) keywords.push('DB');

  // Build prefix from keywords (max 3)
  const prefix = keywords.length > 0
    ? keywords.slice(0, 3).join(' + ')
    : 'Custom';

  // Get current date and time
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // 2026-01-20
  const timeStr = now.toTimeString().slice(0, 5); // 16:45

  // Generate a random suffix for uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 8); // abc123

  return `${prefix} Workflow - ${dateStr} ${timeStr} #${randomSuffix}`;
}

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
  options?: Array<{ name: string; value: string | number | boolean; description?: string }>;
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
const previewCache = new Map<string, { workflow: N8nWorkflow; createdAt: number; originalDescription?: string }>();

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
  'n8n-nodes-base.microsoftExcel': {
    type: 'microsoftExcelOAuth2Api',
    displayName: 'Microsoft Excel OAuth2',
    instructions: 'Set up OAuth 2.0 credentials in Azure for Excel access.',
    steps: [
      'Register an app in Azure Active Directory',
      'Add Microsoft Graph permissions for Files.ReadWrite',
      'Create a client secret',
      'Use client ID and secret in n8n Microsoft Excel credentials',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/microsoft/',
  },
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': {
    type: 'googlePalmApi',
    displayName: 'Google Gemini API',
    instructions: 'Create an API key in Google AI Studio for Gemini.',
    steps: [
      'Go to makersuite.google.com (Google AI Studio)',
      'Create or select an API key',
      'Copy the API key',
      'Use it in n8n Google PaLM/Gemini credentials',
    ],
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/google/',
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

    // Try MCP server first for node discovery
    if (n8nMcpService.isAvailable()) {
      try {
        const mcpResult = await n8nMcpService.listNodes(baseUrl, apiKey);
        let nodes: N8nNode[] = mcpResult.nodes.map((node) => ({
          name: node.name,
          displayName: node.displayName,
          description: node.description,
          version: node.version,
          group: node.category ? [node.category] : undefined,
          credentials: (node.credentialTypes || []).map((cred) => typeof cred === 'string' ? cred : cred.name),
        }));

        if (nodes.length === 0) {
          try {
            const nodeTypes = await n8nMcpService.getNodeTypes(baseUrl, apiKey);
            if (nodeTypes.success && nodeTypes.nodeTypes.length > 0) {
              nodes = nodeTypes.nodeTypes.map((nodeType) => ({
                name: nodeType.name,
                displayName: nodeType.displayName || nodeType.name,
                description: nodeType.description,
                version: nodeType.version || 1,
                group: nodeType.category ? [nodeType.category] : undefined,
                credentials: (nodeType.credentials || []).map((cred) => cred.name),
              }));
            }
          } catch (error: any) {
            console.warn('MCP node type lookup failed:', error?.message || error);
          }
        }

        if (nodes.length > 0) {
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
        }
      } catch (error: any) {
        console.warn('MCP node discovery failed, falling back to direct API:', error?.message || error);
      }
    }

    // Fetch from n8n directly
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
   * Preview a workflow without creating it in n8n
   */
  async previewWorkflow(
    n8nUrl: string,
    n8nApiKey: string,
    description: string,
    vertexSaEmail?: string,
    vertexPrivateKey?: string
  ): Promise<{
    previewId: string;
    workflow: N8nWorkflow;
    nodeCount: number;
    explanation?: string;
    credentials: CredentialRequirement[];
    originalDescription: string;
    clarifications?: ClarificationQuestion[];
  }> {

    const discoveryResult = await this.discoverNodes(n8nUrl, n8nApiKey);
    const hasVertexCredentials = !!((vertexSaEmail && vertexPrivateKey) || geminiService.isAvailable());
    const previewId = randomUUID();

    workflowLogger.logGenerationStart(
      previewId,
      'public',
      description,
      n8nUrl,
      hasVertexCredentials
    );
    workflowLogger.logNodeDiscovery(
      previewId,
      discoveryResult.nodeCount,
      discoveryResult.fromCache,
      discoveryResult.nodes.map(n => n.name).slice(0, 30)
    );
    if (discoveryResult.nodeCount === 0) {
      workflowLogger.warn(previewId, 'NODE_DISCOVERY_EMPTY', 'No nodes discovered from n8n instance', {
        n8nUrl,
      });
    }
    const localNodeTypes = this.detectRelevantNodeTypes(description);
    const catalogNodeTypes = this.detectRelevantNodeTypesFromAvailableNodes(
      description,
      discoveryResult.nodes
    );
    const mcpSuggestedTypes = await this.getMcpSuggestedNodeTypes(description, n8nUrl, n8nApiKey);
    let relevantNodeTypes = this.mergeRelevantNodeTypes(
      [...localNodeTypes, ...catalogNodeTypes, ...mcpSuggestedTypes],
      discoveryResult.nodes
    );
    workflowLogger.logRelevantNodeTypes(previewId, relevantNodeTypes);

    let aiIntent: WorkflowIntent | null = null;
    if (hasVertexCredentials) {
      try {
        aiIntent = await geminiService.analyzeWorkflowIntent(
          description,
          discoveryResult.nodes,
          vertexSaEmail,
          vertexPrivateKey
        );
        if (aiIntent) {
          workflowLogger.info(previewId, 'INTENT_ANALYSIS', 'AI intent extracted successfully', {
            sender: aiIntent.sender,
            days: aiIntent.days,
            slackChannel: aiIntent.slackChannel,
            wantsEmail: aiIntent.wantsEmail,
            wantsSlack: aiIntent.wantsSlack,
            wantsGeminiSummary: aiIntent.wantsGeminiSummary,
            requestedNodeTypes: aiIntent.requestedNodeTypes?.length || 0,
          });
        } else {
          workflowLogger.warn(previewId, 'INTENT_ANALYSIS_NULL', 'AI intent analysis returned null — falling back to regex parsing', {
            description: description.slice(0, 200),
          });
        }
      } catch (intentError: any) {
        workflowLogger.warn(previewId, 'INTENT_ANALYSIS_FAILED', `AI intent analysis failed: ${intentError?.message || intentError}`, {
          description: description.slice(0, 200),
        });
        aiIntent = null;
      }
      if (aiIntent?.requestedNodeTypes && aiIntent.requestedNodeTypes.length > 0) {
        relevantNodeTypes = this.mergeRelevantNodeTypes(
          [...relevantNodeTypes, ...aiIntent.requestedNodeTypes],
          discoveryResult.nodes
        );
      }
    }
    const nodeTypeDetails = await workflowGeneratorService.fetchNodeTypeDetails(
      n8nUrl,
      n8nApiKey,
      relevantNodeTypes
    );
    let workflow: N8nWorkflow;
    let aiExplanation: string | undefined;
    let generationMethod: 'AI' | 'RULE_BASED' = 'RULE_BASED';

    if (hasVertexCredentials) {
      try {
        // Get relevant learned patterns to guide generation
        const learningGuidance = workflowLearningService.getCommonLearningsGuidance();

        // Log learning stats for visibility
        const learningStats = workflowLearningService.getStats();
        if (learningStats.totalPatterns > 0) {
          workflowLogger.info(previewId, 'LEARNING', 'Using learned patterns for generation', {
            totalPatterns: learningStats.totalPatterns,
            totalLearnings: learningStats.totalLearnings,
            topIssues: learningStats.topIssues,
          });
        }

        const aiResult = await geminiService.generateWorkflow(
          description,
          discoveryResult.nodes,
          vertexSaEmail,
          vertexPrivateKey,
          nodeTypeDetails,
          relevantNodeTypes,
          learningGuidance
        );
        workflow = aiResult.workflow;
        aiExplanation = aiResult.explanation;
        generationMethod = 'AI';
      } catch (error: any) {
        workflow = this.generateWorkflowFromDescription(description);
      }
    } else {
      workflow = this.generateWorkflowFromDescription(description);
    }

    workflow = this.enforceWorkflowRequirements(description, workflow, discoveryResult.nodes, nodeTypeDetails, aiIntent);
    workflow = this.sanitizeWorkflowParameters(workflow, nodeTypeDetails);
    workflow = this.ensureAINodeParameters(workflow, description);
    const validationResult = this.validateWorkflow(workflow);
    if (!validationResult.valid) {
      workflowLogger.error(previewId, 'VALIDATION', 'Workflow validation failed', {
        error: validationResult.error,
      });
      throw new Error(`Invalid workflow: ${validationResult.error}`);
    }

    const credentials = this.detectCredentials(workflow.nodes);
    workflowLogger.logGeneratedWorkflow(previewId, workflow, generationMethod, aiExplanation);
    workflowLogger.logCredentialsDetected(previewId, credentials);

    // Verify and auto-fix workflow with Gemini if API key is available
    if (hasVertexCredentials) {
      const MAX_FIX_ITERATIONS = 2;
      let currentWorkflow = workflow;
      const originalWorkflowName = workflow.name; // Preserve original name
      let iteration = 0;
      let allFixesApplied: string[] = [];

      try {
        workflowLogger.info(previewId, 'VERIFICATION', 'Verifying workflow with Gemini AI');

        while (iteration < MAX_FIX_ITERATIONS) {
          const verification = await geminiService.verifyWorkflow(currentWorkflow, description, vertexSaEmail, vertexPrivateKey);

          workflowLogger.info(previewId, 'VERIFICATION_RESULT', `AI verification iteration ${iteration + 1}`, {
            isValid: verification.isValid,
            issuesCount: verification.issues.length,
            suggestionsCount: verification.suggestions.length,
          });

          // If workflow is valid or no issues to fix, we're done
          if (verification.isValid && verification.issues.length === 0 && verification.suggestions.length === 0) {
            workflowLogger.info(previewId, 'VERIFICATION_PASSED', 'Workflow passed validation');
            break;
          }

          // If we have issues or suggestions, try to fix them
          if (verification.issues.length > 0 || verification.suggestions.length > 0) {
            workflowLogger.info(previewId, 'AUTO_FIX', `Attempting to fix ${verification.issues.length} issues and apply ${verification.suggestions.length} suggestions`);

            const fixResult = await geminiService.fixWorkflow(
              currentWorkflow,
              description,
              verification.issues,
              verification.suggestions,
              discoveryResult.nodes,
              nodeTypeDetails,
              vertexSaEmail,
              vertexPrivateKey
            );

            if (fixResult.fixesApplied.length > 0) {
              workflowLogger.info(previewId, 'FIXES_APPLIED', 'Applied fixes to workflow', {
                fixes: fixResult.fixesApplied,
              });

              // Store learnings
              const usedNodeTypes = fixResult.workflow.nodes.map((n) => n.type);
              verification.issues.forEach((issue, idx) => {
                const fix = fixResult.fixesApplied[idx] || 'Applied correction';
                workflowLearningService.recordLearning(issue, fix, description, usedNodeTypes);
              });
              verification.suggestions.forEach((suggestion, idx) => {
                const fix = fixResult.fixesApplied[verification.issues.length + idx] || 'Applied improvement';
                workflowLearningService.recordLearning(suggestion, fix, description, usedNodeTypes);
              });

              allFixesApplied.push(...fixResult.fixesApplied);
              currentWorkflow = fixResult.workflow;
              iteration++;
            } else {
              // No fixes were applied, stop trying
              workflowLogger.warn(previewId, 'NO_FIXES_APPLIED', 'Could not apply fixes, using current workflow');
              break;
            }
          } else {
            break;
          }
        }

        // Update workflow with the fixed version
        workflow = currentWorkflow;

        // Restore original workflow name (Gemini may have changed it)
        workflow.name = originalWorkflowName;

        if (allFixesApplied.length > 0) {
          workflowLogger.info(previewId, 'AUTO_FIX_COMPLETE', 'Workflow auto-fix complete', {
            totalFixes: allFixesApplied.length,
            iterations: iteration,
            fixes: allFixesApplied,
          });

          // Update explanation to mention improvements
          if (aiExplanation) {
            aiExplanation += `\n\n🔧 Auto-improvements applied: ${allFixesApplied.length} enhancement(s) made to optimize the workflow.`;
          }
        }

      } catch (verifyError: any) {
        workflowLogger.warn(previewId, 'VERIFICATION_FAILED', 'Failed to verify/fix workflow', {
          error: verifyError?.message,
        });
      }
    }

    // Auto-improvement loop: Keep improving workflow until no more fixable issues
    let improvementCount = 0;
    const maxImprovements = 3; // Prevent infinite loops
    const originalWorkflowName = workflow.name; // Preserve original name throughout improvements

    while (improvementCount < maxImprovements) {
      const detectedNodeTypes = workflow.nodes.map(n => {
        const shortType = n.type.split('.').pop() || '';
        return shortType;
      });
      const missingSteps = workflowGapDetectorService.suggestMissingSteps(description, detectedNodeTypes, workflow);

      // Check if there are any auto-fixable missing steps
      const autoFixableSteps = missingSteps.filter(step => step.autoFix);

      if (autoFixableSteps.length === 0) {
        // No more auto-fixable issues, we're done
        workflowLogger.info(previewId, 'AUTO_IMPROVEMENT_COMPLETE', `Workflow auto-improved ${improvementCount} times`, {
          finalNodeCount: workflow.nodes.length,
        });
        break;
      }

      // Apply auto-fixes by regenerating with enhanced description
      let enhancedDescription = description;
      for (const step of autoFixableSteps) {
        workflowLogger.info(previewId, 'AUTO_IMPROVING', `Applying fix: ${step.step}`, {
          reason: step.reason,
        });

        // Add specific instructions based on the missing step
        if (step.nodeToAdd.includes('Edit Fields')) {
          enhancedDescription += '. Add Edit Fields node before AI to format input as chatInput field.';
        } else if (step.nodeToAdd.includes('aggregate') || step.nodeToAdd.includes('Item Lists')) {
          enhancedDescription += '. Combine all items into one before processing.';
        }
      }

      // Regenerate workflow with enhanced description via Gemini
      if (hasVertexCredentials) {
        try {
          const learningGuidance = workflowLearningService.getCommonLearningsGuidance();
          const improvedResult = await geminiService.generateWorkflow(
            enhancedDescription,
            discoveryResult.nodes,
            vertexSaEmail,
            vertexPrivateKey,
            nodeTypeDetails,
            relevantNodeTypes,
            learningGuidance
          );
          workflow = improvedResult.workflow;
          workflow.name = originalWorkflowName; // Restore original name after improvement
          improvementCount++;
          workflowLogger.info(previewId, 'AUTO_IMPROVEMENT_APPLIED', `Improvement ${improvementCount} applied`, {
            nodeCount: workflow.nodes.length,
          });
        } catch (error: any) {
          workflowLogger.warn(previewId, 'AUTO_IMPROVEMENT_FAILED', 'Failed to apply auto-improvement', {
            error: error.message,
          });
          break;
        }
      } else {
        // Can't auto-improve without AI, break out
        break;
      }
    }

    workflowLogger.info(previewId, 'PREVIEW_READY', 'Workflow preview generated', {
      nodeCount: workflow.nodes.length,
      credentials: credentials.map((cred) => cred.type),
      improvementsMade: improvementCount,
    });
    this.storePreview(workflow, previewId, description);

    // Detect ambiguities in the original description to help users refine
    const clarifications = workflowGapDetectorService.detectAmbiguities(description);
    if (clarifications.length > 0) {
      workflowLogger.info(previewId, 'CLARIFICATIONS', `${clarifications.length} clarification question(s) detected`, {
        questions: clarifications.map(q => q.question),
      });
    }

    return {
      previewId,
      workflow,
      nodeCount: workflow.nodes.length,
      explanation: improvementCount > 0
        ? `${aiExplanation} 🔧 Auto-improvements applied: ${improvementCount} enhancement(s) made to optimize the workflow.`
        : aiExplanation,
      credentials,
      originalDescription: description,
      clarifications: clarifications.length > 0 ? clarifications : undefined,
    };
  }

  /**
   * Create a workflow in n8n from a provided JSON
   */
  async createWorkflowFromPreview(
    n8nUrl: string,
    n8nApiKey: string,
    previewId: string
  ): Promise<{ success: boolean; n8nWorkflowId?: string; n8nWorkflowUrl?: string; nodesUsed?: number; error?: string; workflow?: N8nWorkflow; originalDescription?: string }> {
    workflowLogger.info(previewId, 'PREVIEW_CREATE', 'Creating workflow from preview', {
      n8nUrl,
    });
    const preview = this.getPreview(previewId);
    if (!preview) {
      workflowLogger.error(previewId, 'PREVIEW', 'Preview not found or expired', { previewId });
      return { success: false, error: 'Preview not found or expired' };
    }

    const { workflow, originalDescription } = preview;
    const validationResult = this.validateWorkflow(workflow);
    if (!validationResult.valid) {
      workflowLogger.error(previewId, 'VALIDATION', 'Workflow validation failed', {
        error: validationResult.error,
      });
      return { success: false, error: validationResult.error || 'Invalid workflow' };
    }

    const result = await this.createWorkflowInN8n(n8nUrl, n8nApiKey, workflow, 1);
    workflowLogger.logN8nCreation(
      previewId,
      result.success,
      result.n8nWorkflowId,
      result.error,
      result.errorDetails
    );
    if (!result.success) {
      // Don't delete preview — user can retry deployment
      return { success: false, error: result.error };
    }

    // Deploy succeeded — clean up the preview cache entry
    this.deletePreview(previewId);

    return {
      success: true,
      n8nWorkflowId: result.n8nWorkflowId,
      n8nWorkflowUrl: result.n8nWorkflowUrl,
      nodesUsed: workflow.nodes.length,
      workflow: workflow,
      originalDescription: originalDescription,
    };
  }

  private storePreview(workflow: N8nWorkflow, previewId?: string, originalDescription?: string): string {
    this.cleanupExpiredPreviews();
    // Evict oldest entries if cache is full
    if (previewCache.size >= MAX_PREVIEW_CACHE_SIZE) {
      const entriesToDelete = previewCache.size - MAX_PREVIEW_CACHE_SIZE + 1;
      const iterator = previewCache.keys();
      for (let i = 0; i < entriesToDelete; i++) {
        const key = iterator.next().value;
        if (key) previewCache.delete(key);
      }
    }
    const id = previewId || randomUUID();
    previewCache.set(id, { workflow, createdAt: Date.now(), originalDescription });
    return id;
  }

  private getPreview(previewId: string): { workflow: N8nWorkflow; createdAt: number; originalDescription?: string } | null {
    const preview = previewCache.get(previewId);
    if (!preview) return null;
    if (Date.now() - preview.createdAt > PREVIEW_TTL_MS) {
      previewCache.delete(previewId);
      return null;
    }
    // Don't delete on retrieval — allow retries if deploy fails.
    // Preview is cleaned up by TTL expiration or explicit deletePreview().
    return preview;
  }

  private deletePreview(previewId: string): void {
    previewCache.delete(previewId);
  }

  private cleanupExpiredPreviews(): void {
    const now = Date.now();
    for (const [previewId, preview] of previewCache.entries()) {
      if (now - preview.createdAt > PREVIEW_TTL_MS) {
        previewCache.delete(previewId);
      }
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
    vertexSaEmail?: string,
    vertexPrivateKey?: string
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

    // Run generation asynchronously (catch to prevent unhandled rejection)
    this.runGeneration(generationId, n8nUrl, n8nApiKey, description, socketId, startTime, vertexSaEmail, vertexPrivateKey)
      .catch((error) => {
        console.error(`Generation ${generationId} failed with unhandled error:`, error);
        this.emitProgress(socketId, generationId, 'Generation failed unexpectedly', 0);
        activeGenerations.delete(generationId);
      });

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
    vertexSaEmail?: string,
    vertexPrivateKey?: string
  ) {
    const hasVertexCredentials = !!((vertexSaEmail && vertexPrivateKey) || geminiService.isAvailable());
    let workflow: N8nWorkflow | undefined;

    // Log generation start
    workflowLogger.logGenerationStart(
      generationId,
      'public', // No user ID for public workflow
      description,
      n8nUrl,
      hasVertexCredentials
    );

    try {
      // Check for cancellation
      if (this.isCancelled(generationId)) {
        workflowLogger.info(generationId, 'CANCELLED', 'Generation cancelled before start');
        activeGenerations.delete(generationId);
        return;
      }

      // Step 1: Discover nodes
      this.emitProgress(socketId, generationId, 'Discovering available nodes...', 15);
      const discoveryResult = await this.discoverNodes(n8nUrl, n8nApiKey);

      // Log node discovery
      workflowLogger.logNodeDiscovery(
        generationId,
        discoveryResult.nodeCount,
        discoveryResult.fromCache,
        discoveryResult.nodes.map(n => n.name).slice(0, 30)
      );
      if (discoveryResult.nodeCount === 0) {
        workflowLogger.warn(generationId, 'NODE_DISCOVERY_EMPTY', 'No nodes discovered from n8n instance', {
          n8nUrl,
        });
      }

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

      // Detect relevant node types from description and MCP suggestions
      const localNodeTypes = this.detectRelevantNodeTypes(description);
      const catalogNodeTypes = this.detectRelevantNodeTypesFromAvailableNodes(
        description,
        discoveryResult.nodes
      );
      const mcpSuggestedTypes = await this.getMcpSuggestedNodeTypes(description, n8nUrl, n8nApiKey);
      let relevantNodeTypes = this.mergeRelevantNodeTypes(
        [...localNodeTypes, ...catalogNodeTypes, ...mcpSuggestedTypes],
        discoveryResult.nodes
      );
      workflowLogger.logRelevantNodeTypes(generationId, relevantNodeTypes);

      let aiIntent: WorkflowIntent | null = null;
      if (hasVertexCredentials) {
        aiIntent = await geminiService.analyzeWorkflowIntent(
          description,
          discoveryResult.nodes,
          vertexSaEmail,
          vertexPrivateKey
        );
        if (aiIntent?.requestedNodeTypes && aiIntent.requestedNodeTypes.length > 0) {
          relevantNodeTypes = this.mergeRelevantNodeTypes(
            [...relevantNodeTypes, ...aiIntent.requestedNodeTypes],
            discoveryResult.nodes
          );
        }
      }

      const nodeTypeDetails = await workflowGeneratorService.fetchNodeTypeDetails(
        n8nUrl,
        n8nApiKey,
        relevantNodeTypes
      );

      await this.delay(300);

      if (this.isCancelled(generationId)) {
        activeGenerations.delete(generationId);
        return;
      }

      this.emitProgress(socketId, generationId, 'Generating workflow...', 40);

      // Use Gemini AI if available
      let generationMethod: 'AI' | 'RULE_BASED' = 'RULE_BASED';
      let aiExplanation: string | undefined;

      if (hasVertexCredentials) {
        try {
          this.emitProgress(socketId, generationId, 'Using AI to understand your request...', 45);
          workflowLogger.info(generationId, 'AI_GENERATION', 'Starting AI-based workflow generation');

          const aiResult = await geminiService.generateWorkflow(
            description,
            discoveryResult.nodes,
            vertexSaEmail,
            vertexPrivateKey,
            nodeTypeDetails,
            relevantNodeTypes
          );
          workflow = aiResult.workflow;
          generationMethod = 'AI';
          aiExplanation = aiResult.explanation;

          workflowLogger.info(generationId, 'AI_SUCCESS', 'AI generation completed', {
            nodeCount: aiResult.nodeCount,
            explanation: aiResult.explanation,
          });
        } catch (aiError: any) {
          workflowLogger.warn(generationId, 'AI_FALLBACK', 'AI generation failed, falling back to rule-based', {
            error: aiError.message,
          });
          console.warn('AI generation failed, falling back to rule-based:', aiError.message);
          this.emitProgress(socketId, generationId, 'Using rule-based generation...', 45);
          workflow = this.generateWorkflowFromDescription(description);
          generationMethod = 'RULE_BASED';
        }
      } else {
        this.emitProgress(socketId, generationId, 'Generating workflow...', 45);
        workflowLogger.info(generationId, 'RULE_BASED', 'Using rule-based generation (no AI key)');
        workflow = this.generateWorkflowFromDescription(description);
        generationMethod = 'RULE_BASED';
      }

      workflow = this.enforceWorkflowRequirements(description, workflow, discoveryResult.nodes, nodeTypeDetails, aiIntent);
      workflow = this.sanitizeWorkflowParameters(workflow, nodeTypeDetails);
      workflow = this.ensureAINodeParameters(workflow, description);

      // Log generated workflow
      workflowLogger.logGeneratedWorkflow(generationId, workflow, generationMethod, aiExplanation);

      if (this.isCancelled(generationId)) {
        activeGenerations.delete(generationId);
        return;
      }

      // Step 3: Detect credentials
      this.emitProgress(socketId, generationId, 'Detecting required credentials...', 50);
      const credentials = this.detectCredentials(workflow.nodes);
      workflowLogger.logCredentialsDetected(generationId, credentials);

      // Step 4: Validate workflow
      this.emitProgress(socketId, generationId, 'Validating workflow...', 55);
      const validationResult = this.validateWorkflow(workflow);
      if (!validationResult.valid) {
        workflowLogger.error(generationId, 'VALIDATION', 'Workflow validation failed', {
          error: validationResult.error,
        });
        throw new Error(`Invalid workflow: ${validationResult.error}`);
      }
      workflowLogger.info(generationId, 'VALIDATION', 'Workflow validation passed');

      // Step 5: Create in n8n
      this.emitProgress(socketId, generationId, 'Creating workflow in n8n...', 60);
      workflowLogger.info(generationId, 'N8N_CREATE', 'Sending workflow to n8n API');

      const n8nResult = await this.createWorkflowInN8n(n8nUrl, n8nApiKey, workflow, 3, socketId, generationId, vertexSaEmail, vertexPrivateKey);

      // Log n8n creation result
      workflowLogger.logN8nCreation(
        generationId,
        n8nResult.success,
        n8nResult.n8nWorkflowId,
        n8nResult.error,
        n8nResult.errorDetails
      );

      if (!n8nResult.success) {
        throw new Error(n8nResult.error || 'Failed to create workflow in n8n');
      }

      // Success!
      this.emitProgress(socketId, generationId, 'Workflow created successfully!', 100);

      const durationMs = Date.now() - startTime;
      workflowLogger.logGenerationComplete(generationId, description, workflow, durationMs, true);

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
      // Log the error
      workflowLogger.error(generationId, 'GENERATION_ERROR', 'Workflow generation failed', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      });
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

  private validateWorkflow(workflow: N8nWorkflow): { valid: boolean; error?: string; warnings?: string[] } {
    const warnings: string[] = [];

    if (!workflow.name) return { valid: false, error: 'Workflow must have a name' };
    if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      return { valid: false, error: 'Workflow must have at least one node' };
    }
    if (typeof workflow.connections !== 'object') {
      return { valid: false, error: 'Workflow must have connections object' };
    }

    const nodeNames = new Set<string>();
    for (const node of workflow.nodes) {
      if (!node.id || !node.name || !node.type) {
        return { valid: false, error: 'Invalid node: missing required fields' };
      }
      nodeNames.add(node.name);
    }

    // Validate connections reference existing nodes
    for (const [sourceName, conn] of Object.entries(workflow.connections)) {
      if (!nodeNames.has(sourceName)) {
        warnings.push(`Connection source "${sourceName}" references non-existent node`);
        continue;
      }
      const validateTargets = (targets: Array<Array<{ node: string; type: string; index: number }>>, connType: string) => {
        for (const branch of targets) {
          for (const target of branch) {
            if (!nodeNames.has(target.node)) {
              warnings.push(`${connType} connection from "${sourceName}" targets non-existent node "${target.node}"`);
            }
          }
        }
      };
      if (conn.main) validateTargets(conn.main, 'main');
      if ((conn as any).ai_model) validateTargets((conn as any).ai_model, 'ai_model');
    }

    // Validate ai_model connections target AI model nodes
    const aiModelNodeTypes = new Set([
      '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
      '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      '@n8n/n8n-nodes-langchain.lmChatAnthropic',
      '@n8n/n8n-nodes-langchain.lmChatOllama',
    ]);
    const nodeTypeMap = new Map(workflow.nodes.map((n) => [n.name, n.type]));
    for (const [sourceName, conn] of Object.entries(workflow.connections)) {
      if ((conn as any).ai_model) {
        for (const branch of (conn as any).ai_model) {
          for (const target of branch) {
            const targetType = nodeTypeMap.get(target.node);
            if (targetType && !aiModelNodeTypes.has(targetType)) {
              warnings.push(`ai_model connection from "${sourceName}" targets non-AI-model node "${target.node}" (${targetType})`);
            }
          }
        }
      }
    }

    // Validate chainLlm nodes have ai_model connections
    for (const node of workflow.nodes) {
      if (node.type === '@n8n/n8n-nodes-langchain.chainLlm') {
        const conn = workflow.connections[node.name];
        const hasModelConn = (conn as any)?.ai_model?.some((branch: any[]) => branch.length > 0);
        if (!hasModelConn) {
          warnings.push(`Basic LLM Chain node "${node.name}" has no ai_model connection — workflow will fail`);
        }
      }
    }

    // Validate required parameters for critical node types
    for (const node of workflow.nodes) {
      if (node.type === 'n8n-nodes-base.slack' && node.parameters?.operation === 'post') {
        if (!node.parameters?.channel) {
          warnings.push(`Slack node "${node.name}" missing required "channel" parameter`);
        }
      }
      if (node.type === 'n8n-nodes-base.gmail' && !node.parameters?.operation) {
        warnings.push(`Gmail node "${node.name}" missing "operation" parameter`);
      }
    }

    if (warnings.length > 0) {
      console.warn('Workflow validation warnings:', warnings);
    }

    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Detect which node types are likely needed based on description keywords
   * This helps log what was requested vs what was generated
   */
  private detectRelevantNodeTypes(description: string): string[] {
    const lowerDesc = description.toLowerCase();
    const nodeTypes: Set<string> = new Set();

    // Comprehensive keyword to node type mapping
    const keywordMap: Array<{ keywords: string[]; nodeType: string }> = [
      // Triggers
      { keywords: ['webhook', 'http trigger', 'incoming'], nodeType: 'n8n-nodes-base.webhook' },
      { keywords: ['schedule', 'cron', 'timer', 'every day', 'every hour', 'daily', 'hourly', 'weekly'], nodeType: 'n8n-nodes-base.scheduleTrigger' },

      // HTTP & API
      { keywords: ['http', 'request', 'api call', 'fetch', 'url', 'rest api', 'endpoint'], nodeType: 'n8n-nodes-base.httpRequest' },

      // Communication — Google ecosystem only
      { keywords: ['slack', 'message slack', 'slack channel', 'slack message'], nodeType: 'n8n-nodes-base.slack' },
      { keywords: ['gmail', 'email', 'inbox', 'mail', 'outlook'], nodeType: 'n8n-nodes-base.gmail' },
      { keywords: ['send email', 'smtp', 'mail send'], nodeType: 'n8n-nodes-base.emailSend' },

      // Google Workspace — Sheets, Docs, Drive only (no Excel, Airtable, Notion)
      { keywords: ['google sheet', 'spreadsheet', 'sheets', 'google sheets', 'excel', 'xlsx', 'xls'], nodeType: 'n8n-nodes-base.googleSheets' },
      { keywords: ['google doc', 'document', 'docs'], nodeType: 'n8n-nodes-base.googleDocs' },
      { keywords: ['google drive', 'drive', 'file storage'], nodeType: 'n8n-nodes-base.googleDrive' },
      { keywords: ['csv file', 'csv', 'spreadsheet file'], nodeType: 'n8n-nodes-base.spreadsheetFile' },

      // AI/LLM Nodes — ONLY when explicitly requested (DO NOT trigger on generic words like "summary" or "query")
      { keywords: ['use ai', 'use gemini', 'google ai', 'palm', 'bard', 'openai', 'gpt', 'chatgpt', 'artificial intelligence', 'llm', 'language model', 'chat ai', 'ai analysis', 'ai summary', 'summarize with ai', 'analyze with ai'], nodeType: '@n8n/n8n-nodes-langchain.chainLlm' },
      { keywords: ['use ai', 'use gemini', 'google ai', 'palm', 'bard', 'openai', 'gpt', 'chatgpt', 'llm', 'ai analysis', 'ai summary', 'summarize with ai'], nodeType: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini' },
      { keywords: ['summarize with ai', 'ai summarization', 'ai summary'], nodeType: '@n8n/n8n-nodes-langchain.chainSummarization' },

      // Databases — only postgres/mysql when not BigQuery context
      { keywords: ['postgres', 'postgresql', 'pg database'], nodeType: 'n8n-nodes-base.postgres' },
      { keywords: ['mysql', 'mariadb'], nodeType: 'n8n-nodes-base.mySql' },
      { keywords: ['mongodb', 'mongo', 'nosql'], nodeType: 'n8n-nodes-base.mongoDb' },
      { keywords: ['bigquery', 'big query', 'bq query', 'bq table', 'gcp query', 'google bigquery'], nodeType: 'n8n-nodes-base.googleBigQuery' },

      // Collaboration & Documentation
      { keywords: ['confluence', 'atlassian', 'wiki page', 'confluence page'], nodeType: 'n8n-nodes-base.confluence' },

      // Logic & Flow Control
      { keywords: ['if', 'condition', 'branch', 'when', 'conditional'], nodeType: 'n8n-nodes-base.if' },
      { keywords: ['filter', 'remove', 'exclude', 'only', 'keep'], nodeType: 'n8n-nodes-base.filter' },
      { keywords: ['merge', 'combine', 'join', 'merge data'], nodeType: 'n8n-nodes-base.merge' },
      { keywords: ['code', 'javascript', 'script', 'custom code', 'function'], nodeType: 'n8n-nodes-base.code' },
    ];

    // Match keywords in description
    for (const { keywords, nodeType } of keywordMap) {
      for (const keyword of keywords) {
        if (lowerDesc.includes(keyword)) {
          nodeTypes.add(nodeType);
          break;
        }
      }
    }

    return Array.from(nodeTypes);
  }

  private detectRelevantNodeTypesFromAvailableNodes(
    description: string,
    availableNodes: N8nNode[]
  ): string[] {
    if (!availableNodes.length) return [];
    const lowerDesc = description.toLowerCase();
    const matches = new Set<string>();

    for (const node of availableNodes) {
      const displayName = node.displayName?.toLowerCase() || '';
      const shortName = node.name.split('.').pop()?.toLowerCase() || '';

      if (displayName && lowerDesc.includes(displayName)) {
        matches.add(node.name);
        continue;
      }
      if (shortName && lowerDesc.includes(shortName)) {
        matches.add(node.name);
        continue;
      }

      const tokens = displayName.split(/\s+/).filter(Boolean);
      if (tokens.length > 1 && tokens.every((token) => lowerDesc.includes(token))) {
        matches.add(node.name);
      }
    }

    return Array.from(matches);
  }

  private parseWorkflowIntent(description: string): {
    sender?: string;
    days?: number;
    wantsMarkUnread: boolean;
    wantsGeminiSummary: boolean;
    wantsSlack: boolean;
    slackChannel?: string;
    wantsEmail: boolean;
    wantsSpreadsheet: boolean;
    wantsGoogleSheets: boolean;
    spreadsheetId?: string;
    spreadsheetGid?: string;
  } {
    const lowerDesc = description.toLowerCase();
    const senderMatch = description.match(/from\s+([a-zA-Z\s]+?)(?:\s+in|\s+last|\s+past|$)/i);
    const daysMatch = description.match(/last\s+(\d+)\s+days?/i);
    const channelMatch = description.match(/C[A-Z0-9]{8,}/i);
    const sheetMatch = description.match(/https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
    const gidMatch = description.match(/gid=(\d+)/i);
    const wantsSpreadsheet = lowerDesc.includes('spreadsheet') || lowerDesc.includes('sheet') || lowerDesc.includes('excel') || !!sheetMatch;
    const wantsGoogleSheets = lowerDesc.includes('google sheets') || lowerDesc.includes('google sheet') || !!sheetMatch;

    return {
      sender: senderMatch?.[1]?.trim(),
      days: daysMatch ? Number(daysMatch[1]) : undefined,
      wantsMarkUnread: lowerDesc.includes('unread') && lowerDesc.includes('mark'),
      wantsGeminiSummary: lowerDesc.includes('summar') && lowerDesc.includes('gemini'),
      wantsSlack: lowerDesc.includes('slack'),
      slackChannel: channelMatch?.[0],
      wantsEmail: lowerDesc.includes('email') || lowerDesc.includes('gmail') || lowerDesc.includes('outlook'),
      wantsSpreadsheet,
      wantsGoogleSheets,
      spreadsheetId: sheetMatch?.[1],
      spreadsheetGid: gidMatch?.[1],
    };
  }

  private enforceWorkflowRequirements(
    description: string,
    workflow: N8nWorkflow,
    availableNodes: N8nNode[],
    nodeTypeDetails?: Map<string, NodeTypeDetails>,
    aiIntent?: WorkflowIntent | null
  ): N8nWorkflow {
    const parsedIntent = this.parseWorkflowIntent(description);
    const intent: typeof parsedIntent & WorkflowIntent = {
      ...parsedIntent,
      sender: aiIntent?.sender ?? parsedIntent.sender,
      days: aiIntent?.days ?? parsedIntent.days,
      slackChannel: aiIntent?.slackChannel ?? parsedIntent.slackChannel,
      spreadsheetId: aiIntent?.spreadsheetId ?? parsedIntent.spreadsheetId,
      spreadsheetGid: aiIntent?.spreadsheetGid ?? parsedIntent.spreadsheetGid,
      wantsMarkUnread: parsedIntent.wantsMarkUnread || aiIntent?.wantsMarkUnread === true,
      wantsGeminiSummary: parsedIntent.wantsGeminiSummary || aiIntent?.wantsGeminiSummary === true,
      wantsSlack: parsedIntent.wantsSlack || aiIntent?.wantsSlack === true,
      wantsEmail: parsedIntent.wantsEmail || aiIntent?.wantsEmail === true,
      wantsSpreadsheet: parsedIntent.wantsSpreadsheet || aiIntent?.wantsSpreadsheet === true,
      wantsGoogleSheets: parsedIntent.wantsGoogleSheets || aiIntent?.wantsGoogleSheets === true,
      requestedNodeTypes: aiIntent?.requestedNodeTypes,
    };
    const availableSet = new Set(availableNodes.map((node) => node.name));
    const nodes = [...workflow.nodes];
    const nameSet = new Set(nodes.map((node) => node.name));
    const idSet = new Set(nodes.map((node) => node.id));

    const getUniqueName = (base: string) => {
      let name = base;
      let i = 1;
      while (nameSet.has(name)) {
        name = `${base} ${i++}`;
      }
      nameSet.add(name);
      return name;
    };

    const getUniqueId = () => {
      let id = `node_${nodes.length + 1}`;
      while (idSet.has(id)) {
        id = `node_${nodes.length + Math.floor(Math.random() * 1000)}`;
      }
      idSet.add(id);
      return id;
    };

    const pickAvailable = (types: string[]) => types.find((type) => availableSet.has(type));

    const findNode = (types: string[], operation?: string) => nodes.find((node) => {
      if (!types.includes(node.type)) return false;
      if (!operation) return true;
      return node.parameters?.operation === operation;
    });

    const prioritizeTypes = (preferred: string | undefined, types: string[]) => {
      if (!preferred) return types;
      return [preferred, ...types.filter((type) => type !== preferred)];
    };

    const pickOperation = (details: NodeTypeDetails | undefined): string | undefined => {
      if (!details?.properties) return undefined;
      const operationProp = details.properties.find((prop) => prop.name === 'operation' && prop.options);
      if (!operationProp?.options) return undefined;

      const lowerDesc = description.toLowerCase();
      const candidates = [
        { keywords: ['create', 'add', 'insert'], values: ['create', 'add'] },
        { keywords: ['update', 'edit', 'modify'], values: ['update'] },
        { keywords: ['delete', 'remove'], values: ['delete', 'remove'] },
        { keywords: ['list', 'get all', 'fetch all'], values: ['getAll', 'list'] },
        { keywords: ['get', 'fetch', 'read'], values: ['get', 'read'] },
        { keywords: ['search', 'find'], values: ['search', 'query'] },
        { keywords: ['send', 'notify'], values: ['send', 'sendMessage'] },
        { keywords: ['post'], values: ['post'] },
      ];

      const optionValues = operationProp.options
        .map((opt) => String(opt.value))
        .filter(Boolean);

      for (const candidate of candidates) {
        if (candidate.keywords.some((keyword) => lowerDesc.includes(keyword))) {
          const match = optionValues.find((value) =>
            candidate.values.some((expected) => value.toLowerCase() === expected.toLowerCase())
          );
          if (match) return match;
        }
      }

      return optionValues[0];
    };

    const hasProperty = (nodeType: string, propertyName: string): boolean => {
      const details = nodeTypeDetails?.get(nodeType);
      return !!details?.properties?.some((prop) => prop.name === propertyName);
    };

    const ensureResource = (node: WorkflowNode, resourceValue: string) => {
      const hasDetails = nodeTypeDetails && nodeTypeDetails.size > 0;
      const shouldDefault = !hasDetails && (node.type.includes('gmail') || node.type.includes('slack'));
      if (node.parameters.resource === undefined && (shouldDefault || hasProperty(node.type, 'resource'))) {
        node.parameters.resource = resourceValue;
      }
    };

    const applyEmailQuery = (emailNode: WorkflowNode, query: string) => {
      if (!query) return;
      const hasDetails = nodeTypeDetails && nodeTypeDetails.size > 0;
      if (!hasDetails || hasProperty(emailNode.type, 'filters')) {
        const existingFilters = emailNode.parameters.filters || {};
        emailNode.parameters.filters = { ...existingFilters, q: query };
        return;
      }
      if (hasProperty(emailNode.type, 'options')) {
        const existingOptions = emailNode.parameters.options || {};
        emailNode.parameters.options = { ...existingOptions, query };
        return;
      }
      emailNode.parameters.query = query;
    };

    const normalizeEmailQuery = (query: string, sender?: string | null) => {
      if (!query || !sender) return query;
      const escaped = sender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fromPattern = new RegExp(`from:(\"?${escaped}\"?)`, 'gi');
      return query.replace(fromPattern, '').replace(/\s+/g, ' ').trim();
    };

    const extractRequestedNodeTypes = () => {
      const aiRequested = (aiIntent?.requestedNodeTypes || [])
        .filter((node) => typeof node === 'string')
        .filter((node) => availableSet.size === 0 || availableSet.has(node));

      if (availableNodes.length === 0) {
        return Array.from(new Set([...aiRequested, ...this.detectRelevantNodeTypes(description)]));
      }
      const lowerDesc = description.toLowerCase();
      const scored: Array<{ name: string; score: number }> = [];

      for (const node of availableNodes) {
        let score = 0;
        const displayName = node.displayName?.toLowerCase() || '';
        const shortName = node.name.split('.').pop()?.toLowerCase() || '';

        if (displayName && lowerDesc.includes(displayName)) score += 3;
        if (shortName && lowerDesc.includes(shortName)) score += 2;

        const tokens = displayName.split(/\s+/).filter(Boolean);
        if (tokens.length > 1 && tokens.every((token) => lowerDesc.includes(token))) {
          score += 1;
        }

        if (score >= 2) {
          scored.push({ name: node.name, score });
        }
      }

      const scoredNodes = scored.sort((a, b) => b.score - a.score).map((entry) => entry.name);
      return Array.from(new Set([...aiRequested, ...scoredNodes]));
    };

    const requestedNodeTypes = extractRequestedNodeTypes();

    const ensureNode = (
      types: string[],
      name: string,
      parameters: Record<string, any> = {},
      operation?: string
    ) => {
      let node = findNode(types, operation);
      if (node) {
        node.name = node.name || name;
        node.parameters = { ...(node.parameters || {}), ...parameters };
        return node;
      }

      const type = pickAvailable(types) || types[0];
      node = {
        id: getUniqueId(),
        name: getUniqueName(name),
        type,
        typeVersion: 1,
        position: [250, 300],
        parameters,
      };
      nodes.push(node);
      return node;
    };

    // ===================================================================
    // AUGMENT-FIRST STRATEGY: Preserve AI-generated workflow structure.
    // Only add missing required nodes and fix critical parameter gaps.
    // Never discard nodes or rebuild connections from scratch.
    // ===================================================================

    const connections = { ...workflow.connections };

    // --- 1. Ensure a trigger node exists ---
    const triggerTypes = ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.webhook', 'n8n-nodes-base.schedule', 'n8n-nodes-base.cron'];
    const hasTrigger = nodes.some((node) => triggerTypes.includes(node.type));
    if (!hasTrigger) {
      const triggerNode = ensureNode(triggerTypes, 'Start');
      triggerNode.position = [50, 300];
      // Connect trigger to the first non-trigger node
      const firstNode = nodes.find((n) => n !== triggerNode);
      if (firstNode) {
        connections[triggerNode.name] = {
          main: [[{ node: firstNode.name, type: 'main', index: 0 }]],
        };
      }
    }

    // --- 2. Enrich existing email nodes with extracted parameters ---
    if (intent.wantsEmail || intent.sender || intent.days) {
      const emailTypes = ['n8n-nodes-base.gmail', 'n8n-nodes-base.microsoftOutlook', 'n8n-nodes-base.imap', 'n8n-nodes-base.emailReadImap'];
      const emailNodes = nodes.filter((n) => emailTypes.includes(n.type));

      // Only add a new email node if AI didn't create one and intent requires it
      if (emailNodes.length === 0 && intent.wantsEmail) {
        const preferredEmailType = requestedNodeTypes.find((type) => emailTypes.includes(type));
        ensureNode(prioritizeTypes(preferredEmailType, emailTypes), 'Get Emails', {
          operation: 'getAll',
          limit: 50,
        });
      }

      // Enrich ALL email nodes with query parameters from intent
      const queryParts: string[] = [];
      if (intent.sender) queryParts.push(`from:"${intent.sender}"`);
      if (intent.days) queryParts.push(`newer_than:${intent.days}d`);

      for (const emailNode of nodes.filter((n) => emailTypes.includes(n.type))) {
        // Set default operation if missing
        if (emailNode.parameters.operation === undefined) {
          const emailDetails = nodeTypeDetails?.get(emailNode.type);
          emailNode.parameters.operation = pickOperation(emailDetails) || 'getAll';
        }
        if (emailNode.parameters.limit === undefined) {
          emailNode.parameters.limit = 50;
        }
        // Apply query filters
        if (queryParts.length > 0 && emailNode.parameters.operation !== 'markUnread') {
          const senderValue = intent.sender?.trim();
          const existingQuery = String(emailNode.parameters.filters?.q || emailNode.parameters.options?.query || emailNode.parameters.query || '');
          const cleanedQuery = normalizeEmailQuery(existingQuery, senderValue);
          const mergedQuery = queryParts.reduce((acc, part) => {
            if (acc.toLowerCase().includes(part.toLowerCase())) return acc;
            return acc ? `${acc} ${part}` : part;
          }, cleanedQuery);
          applyEmailQuery(emailNode, mergedQuery);
        }
        ensureResource(emailNode, 'message');
      }
    }

    // --- 3. Ensure mark-unread node exists if requested ---
    if (intent.wantsMarkUnread) {
      const hasMarkNode = nodes.some((n) => n.type === 'n8n-nodes-base.gmail' && n.parameters?.operation === 'markUnread');
      if (!hasMarkNode) {
        ensureNode(['n8n-nodes-base.gmail'], 'Mark as Unread', {
          operation: 'markUnread',
          messageId: '={{ $json.id }}',
        }, 'markUnread');
      }
    }

    // --- 4. Ensure Slack node has channel parameter ---
    if (intent.wantsSlack) {
      const slackNodes = nodes.filter((n) => n.type === 'n8n-nodes-base.slack');
      if (slackNodes.length === 0) {
        ensureNode(['n8n-nodes-base.slack'], 'Send to Slack', {
          operation: 'post',
          channel: intent.slackChannel || '#general',
          text: '={{ $json.summary || $json.text || $json.response || JSON.stringify($json) }}',
        }, 'post');
      } else {
        // Fill missing channel on existing Slack nodes
        for (const slackNode of slackNodes) {
          if (!slackNode.parameters.channel) {
            slackNode.parameters.channel = intent.slackChannel || '#general';
          }
          if (!slackNode.parameters.operation) {
            slackNode.parameters.operation = 'post';
          }
          ensureResource(slackNode, 'message');
        }
      }
    }

    // --- 5. Ensure spreadsheet nodes have required parameters ---
    if (intent.wantsSpreadsheet || intent.wantsGoogleSheets) {
      const sheetTypes = ['n8n-nodes-base.googleSheets', 'n8n-nodes-base.spreadsheetFile'];
      const sheetNodes = nodes.filter((n) => sheetTypes.includes(n.type));
      if (sheetNodes.length === 0 && (intent.wantsSpreadsheet || intent.wantsGoogleSheets)) {
        ensureNode(sheetTypes, 'Update Spreadsheet', {
          operation: 'append',
          dataMode: 'autoMapInputData',
        });
      }
      for (const sheetNode of nodes.filter((n) => sheetTypes.includes(n.type))) {
        if (!sheetNode.parameters.operation) sheetNode.parameters.operation = 'append';
        if (intent.spreadsheetId && !sheetNode.parameters.documentId) {
          sheetNode.parameters.documentId = { __rl: true, mode: 'id', value: intent.spreadsheetId };
        }
        if (intent.spreadsheetGid && !sheetNode.parameters.sheetId) {
          sheetNode.parameters.sheetId = Number(intent.spreadsheetGid);
        }
        if (!sheetNode.parameters.sheetName) {
          sheetNode.parameters.sheetName = { __rl: true, mode: 'name', value: 'Sheet1' };
        }
      }
    }

    // --- 6. Ensure AI chain+model pattern is complete ---
    const chainLlmNodes = nodes.filter((n) => n.type === '@n8n/n8n-nodes-langchain.chainLlm');
    const geminiModelNodes = nodes.filter((n) => n.type === '@n8n/n8n-nodes-langchain.lmChatGoogleGemini');

    for (const chainNode of chainLlmNodes) {
      // Check if this chain node already has an ai_model connection
      const chainConns = connections[chainNode.name];
      const hasModelConn = chainConns?.ai_model && chainConns.ai_model.length > 0 && chainConns.ai_model[0].length > 0;
      if (!hasModelConn) {
        // Find or create a Gemini model node
        let modelNode = geminiModelNodes.find((m) => {
          // Prefer one not already connected to another chain
          return !Object.values(connections).some((c) =>
            c.ai_model?.some((branch) => branch.some((t) => t.node === m.name))
          );
        }) || (geminiModelNodes.length === 0 ? ensureNode(
          ['@n8n/n8n-nodes-langchain.lmChatGoogleGemini'],
          'Google Gemini Chat Model',
          { model: 'gemini-pro' }
        ) : geminiModelNodes[0]);

        // Position model node below the chain node
        modelNode.position = [chainNode.position[0], chainNode.position[1] + 200];

        connections[chainNode.name] = {
          ...connections[chainNode.name],
          ai_model: [[{ node: modelNode.name, type: 'ai_model', index: 0 }]],
        };
      }
    }

    // --- 7. Ensure Gemini summary nodes exist if requested but AI didn't create them ---
    if (intent.wantsGeminiSummary && chainLlmNodes.length === 0) {
      // AI didn't create a chain+model pattern — add the full pattern
      const editFieldsNode = ensureNode(['n8n-nodes-base.set'], 'Prepare AI Input', {
        mode: 'manual',
        assignments: {
          assignments: [{
            id: 'chatInput',
            name: 'chatInput',
            value: '=Summarize the following content with key points and action items:\\n\\n{{ $json.snippet || $json.body || $json.text || JSON.stringify($json) }}',
            type: 'string',
          }],
        },
      });

      const chainNode = ensureNode(['@n8n/n8n-nodes-langchain.chainLlm'], 'Basic LLM Chain', {});
      const modelNode = ensureNode(['@n8n/n8n-nodes-langchain.lmChatGoogleGemini'], 'Google Gemini Chat Model', { model: 'gemini-pro' });
      modelNode.position = [chainNode.position[0], chainNode.position[1] + 200];

      connections[editFieldsNode.name] = {
        ...connections[editFieldsNode.name],
        main: [[{ node: chainNode.name, type: 'main', index: 0 }]],
      };
      connections[chainNode.name] = {
        ...connections[chainNode.name],
        ai_model: [[{ node: modelNode.name, type: 'ai_model', index: 0 }]],
      };
    }

    // --- 8. Return the augmented workflow — keep ALL original nodes ---
    return {
      ...workflow,
      nodes,
      connections,
      active: false,
    };
  }

  private sanitizeWorkflowParameters(
    workflow: N8nWorkflow,
    nodeTypeDetails?: Map<string, NodeTypeDetails>
  ): N8nWorkflow {
    if (!nodeTypeDetails || nodeTypeDetails.size === 0) {
      return workflow;
    }

    const sanitizedNodes = workflow.nodes.map((node) => {
      const details = nodeTypeDetails.get(node.type);
      if (!details?.properties || details.properties.length === 0) {
        return node;
      }
      const allowed = new Set(details.properties.map((prop) => prop.name));
      const sanitizedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(node.parameters || {})) {
        if (allowed.has(key)) {
          sanitizedParams[key] = value;
        }
      }
      return { ...node, parameters: sanitizedParams };
    });

    return { ...workflow, nodes: sanitizedNodes };
  }

  /**
   * Ensure AI/LLM nodes always have required parameters like prompts
   */
  private ensureAINodeParameters(workflow: N8nWorkflow, description: string): N8nWorkflow {
    const AI_NODE_TYPES = [
      '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
      '@n8n/n8n-nodes-langchain.chainLlm',
      '@n8n/n8n-nodes-langchain.chainSummarization',
    ];

    const enhancedNodes = workflow.nodes.map((node) => {
      if (!AI_NODE_TYPES.includes(node.type)) {
        return node;
      }

      const parameters = node.parameters || {};

      // For lmChatGoogleGemini — model node in chain+model pattern
      if (node.type === '@n8n/n8n-nodes-langchain.lmChatGoogleGemini') {
        if (!parameters.model) {
          parameters.model = 'gemini-pro';
        }
        return { ...node, parameters };
      }

      // For chainSummarization — ensure it has proper configuration
      if (node.type === '@n8n/n8n-nodes-langchain.chainSummarization') {
        if (!parameters.type) {
          parameters.type = 'stuff';
        }
        return { ...node, parameters };
      }

      // For chainLlm — receives input via {{ $json.chatInput }}
      if (node.type === '@n8n/n8n-nodes-langchain.chainLlm') {
        if (!parameters.prompt && !parameters.promptTemplate) {
          const defaultPrompt = this.generateDefaultAIPrompt(description, node.name);
          parameters.prompt = defaultPrompt;
        }
        return { ...node, parameters };
      }

      return node;
    });

    return { ...workflow, nodes: enhancedNodes };
  }

  /**
   * Generate a default AI prompt based on workflow context
   */
  private generateDefaultAIPrompt(description: string, _nodeName: string): string {
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('summarize') || lowerDesc.includes('summary')) {
      return 'Summarize the following text in a clear and concise way:\n\n{{ $json.text || $json.content || JSON.stringify($json) }}';
    }

    if (lowerDesc.includes('analyze') || lowerDesc.includes('analysis')) {
      return 'Analyze the following data and provide insights:\n\n{{ JSON.stringify($json) }}';
    }

    if (lowerDesc.includes('extract') || lowerDesc.includes('information')) {
      return 'Extract key information from the following:\n\n{{ $json.text || JSON.stringify($json) }}';
    }

    // Default generic prompt
    return 'Process the following input:\n\n{{ $json.text || $json.content || JSON.stringify($json) }}';
  }

  /**
   * Use MCP server to suggest relevant node types based on the description
   */
  private async getMcpSuggestedNodeTypes(
    description: string,
    n8nUrl: string,
    apiKey: string
  ): Promise<string[]> {
    if (!n8nMcpService.isAvailable()) return [];

    try {
      const result = await n8nMcpService.suggestWorkflow(description, n8nUrl, apiKey);
      if (result.success && Array.isArray(result.suggestedNodes)) {
        return result.suggestedNodes;
      }
    } catch (error: any) {
      console.warn('MCP suggestion failed:', error?.message || error);
    }

    return [];
  }

  /**
   * Merge suggested node types and filter by availability on the instance
   */
  private mergeRelevantNodeTypes(nodeTypes: string[], availableNodes: N8nNode[]): string[] {
    const availableSet = new Set(availableNodes.map((node) => node.name));
    const merged = new Set<string>();

    for (const nodeType of nodeTypes) {
      if (!nodeType) continue;
      if (availableSet.size === 0 || availableSet.has(nodeType)) {
        merged.add(nodeType);
      }
    }

    const essentials = ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.set'];
    for (const essential of essentials) {
      if (availableSet.size === 0 || availableSet.has(essential)) {
        merged.add(essential);
      }
    }

    return Array.from(merged);
  }

  /**
   * Generate workflow from description using rule-based approach
   */
  private generateWorkflowFromDescription(description: string): N8nWorkflow {
    const lowerDesc = description.toLowerCase();
    const workflowName = generateUniqueWorkflowName(description);

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
    const workflowName = generateUniqueWorkflowName(description);
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
    generationId?: string,
    vertexSaEmail?: string,
    vertexPrivateKey?: string
  ): Promise<{ success: boolean; n8nWorkflowId?: string; n8nWorkflowUrl?: string; error?: string; errorDetails?: any }> {
    const baseUrl = n8nUrl.replace(/\/$/, '');
    let lastError: any = null;

    // Remove 'active' field as it's read-only and ensure settings exists
    const { active: _active, ...workflowWithoutActive } = workflow;

    // Ensure settings exists (required by n8n API)
    if (!workflowWithoutActive.settings) {
      workflowWithoutActive.settings = {
        saveManualExecutions: true,
        saveExecutionProgress: false,
        saveDataSuccessExecution: 'all',
        saveDataErrorExecution: 'all',
      };
    }

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

        // For 4xx client errors: try AI-based fix before giving up
        if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          // Don't try to fix auth errors
          if (error.response.status === 401 || error.response.status === 403) {
            break;
          }

          // Attempt AI-based fix for 400 Bad Request (validation errors)
          if (error.response.status === 400 && attempt === 1) {
            const n8nError = error.response?.data?.message || JSON.stringify(error.response?.data || 'Validation error');
            console.warn(`n8n rejected workflow (400). Attempting AI fix based on error: ${n8nError}`);
            if (socketId && generationId) {
              this.emitProgress(socketId, generationId, 'Fixing workflow based on n8n feedback...', 70);
            }
            try {
              const fixResult = await geminiService.fixWorkflow(
                workflow,
                `Fix this workflow — n8n returned error: ${n8nError}`,
                [`n8n API returned 400: ${n8nError}`],
                ['Fix the validation error so n8n accepts the workflow'],
                [],
                undefined,
                vertexSaEmail,
                vertexPrivateKey
              );
              if (fixResult.fixesApplied.length > 0) {
                // Update workflow for next attempt with the fixed version
                const { active: _a, ...fixedWithoutActive } = fixResult.workflow;
                Object.assign(workflowWithoutActive, fixedWithoutActive);
                console.log('AI fix applied, retrying n8n creation. Fixes:', fixResult.fixesApplied);
                continue; // Retry with fixed workflow
              }
            } catch (fixError) {
              console.warn('AI fix attempt failed:', fixError);
            }
          }
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

    const errorDetails = lastError?.response
      ? { status: lastError.response.status, data: lastError.response.data }
      : undefined;
    if (lastError?.response?.status === 401) {
      return { success: false, error: 'Invalid n8n API key', errorDetails };
    }
    if (lastError?.response?.status === 403) {
      return { success: false, error: 'Access denied to n8n instance', errorDetails };
    }

    return {
      success: false,
      error: lastError?.response?.data?.message || lastError?.message || 'Failed to create workflow',
      errorDetails,
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
