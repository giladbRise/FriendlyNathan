/**
 * Workflow Logger Service
 * Comprehensive logging for workflow generation to help debug issues
 * where generated workflows don't match user expectations
 */

import * as fs from 'fs';
import * as path from 'path';

// Log levels
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

// Log entry structure
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  generationId: string;
  category: string;
  message: string;
  data?: any;
}

// Workflow generation analysis
interface GenerationAnalysis {
  requestedServices: string[];
  detectedNodeTypes: string[];
  generatedNodeTypes: string[];
  missingServices: string[];
  explanation: string;
}

/**
 * WorkflowLoggerService - logs all workflow generation activities
 */
export class WorkflowLoggerService {
  private static instance: WorkflowLoggerService;
  private logBuffer: LogEntry[] = [];
  private logFilePath: string;
  private maxBufferSize = 100;
  private flushInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logFilePath = path.join(logsDir, 'workflow-generation.log');

    // Start periodic flush
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  public static getInstance(): WorkflowLoggerService {
    if (!WorkflowLoggerService.instance) {
      WorkflowLoggerService.instance = new WorkflowLoggerService();
    }
    return WorkflowLoggerService.instance;
  }

  /**
   * Log a message
   */
  log(
    level: LogLevel,
    generationId: string,
    category: string,
    message: string,
    data?: any
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      generationId,
      category,
      message,
      data: data ? this.sanitizeData(data) : undefined,
    };

    // Add to buffer
    this.logBuffer.push(entry);

    // Also log to console with color coding
    this.logToConsole(entry);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  /**
   * Convenience methods
   */
  debug(generationId: string, category: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, generationId, category, message, data);
  }

  info(generationId: string, category: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, generationId, category, message, data);
  }

  warn(generationId: string, category: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, generationId, category, message, data);
  }

  error(generationId: string, category: string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, generationId, category, message, data);
  }

  /**
   * Log the start of workflow generation
   */
  logGenerationStart(
    generationId: string,
    userId: string,
    description: string,
    n8nUrl: string,
    hasGeminiKey: boolean
  ): void {
    this.info(generationId, 'GENERATION_START', 'Workflow generation started', {
      userId,
      description,
      descriptionLength: description.length,
      n8nUrl: n8nUrl.replace(/\/api.*/, ''), // Truncate API path
      hasGeminiKey,
      startTime: new Date().toISOString(),
    });

    // Analyze what services the user is requesting
    const analysis = this.analyzeUserRequest(description);
    this.info(generationId, 'REQUEST_ANALYSIS', 'User request analyzed', analysis);
  }

  /**
   * Log node discovery results
   */
  logNodeDiscovery(
    generationId: string,
    nodeCount: number,
    fromCache: boolean,
    nodeTypes: string[]
  ): void {
    this.info(generationId, 'NODE_DISCOVERY', 'Node discovery completed', {
      nodeCount,
      fromCache,
      sampleNodeTypes: nodeTypes.slice(0, 20), // First 20 nodes
    });
  }

  /**
   * Log detected relevant node types based on description
   */
  logRelevantNodeTypes(generationId: string, nodeTypes: string[]): void {
    this.info(generationId, 'RELEVANT_NODES', 'Detected relevant node types from description', {
      nodeTypes,
      count: nodeTypes.length,
    });
  }

  /**
   * Log the generated workflow
   */
  logGeneratedWorkflow(
    generationId: string,
    workflow: any,
    method: 'AI' | 'RULE_BASED',
    explanation?: string
  ): void {
    const nodeTypes = workflow.nodes?.map((n: any) => n.type) || [];
    const nodeNames = workflow.nodes?.map((n: any) => n.name) || [];

    this.info(generationId, 'WORKFLOW_GENERATED', 'Workflow generated', {
      method,
      workflowName: workflow.name,
      nodeCount: workflow.nodes?.length || 0,
      nodeTypes,
      nodeNames,
      explanation: explanation || 'N/A',
      connections: Object.keys(workflow.connections || {}),
    });

    // Log full workflow JSON at debug level
    this.debug(generationId, 'WORKFLOW_JSON', 'Full workflow JSON', {
      workflow: JSON.stringify(workflow, null, 2),
    });
  }

  /**
   * Log credential detection
   */
  logCredentialsDetected(generationId: string, credentials: any[]): void {
    this.info(generationId, 'CREDENTIALS', 'Credentials detected', {
      count: credentials.length,
      types: credentials.map((c: any) => c.type || c.displayName),
    });
  }

  /**
   * Log workflow creation in n8n
   */
  logN8nCreation(
    generationId: string,
    success: boolean,
    workflowId?: string,
    error?: string
  ): void {
    if (success) {
      this.info(generationId, 'N8N_CREATION', 'Workflow created in n8n', {
        workflowId,
        success: true,
      });
    } else {
      this.error(generationId, 'N8N_CREATION', 'Failed to create workflow in n8n', {
        error,
        success: false,
      });
    }
  }

  /**
   * Log generation completion with analysis
   */
  logGenerationComplete(
    generationId: string,
    description: string,
    generatedWorkflow: any,
    durationMs: number,
    success: boolean
  ): void {
    const analysis = this.compareRequestToGenerated(description, generatedWorkflow);

    this.info(generationId, 'GENERATION_COMPLETE', 'Workflow generation completed', {
      success,
      durationMs,
      analysis,
    });

    // If there are missing services, log a warning
    if (analysis.missingServices.length > 0) {
      this.warn(generationId, 'MISSING_SERVICES', 'Some requested services were not included in the workflow', {
        missingServices: analysis.missingServices,
        requestedServices: analysis.requestedServices,
        generatedNodes: analysis.generatedNodeTypes,
      });
    }
  }

  /**
   * Analyze what the user is requesting
   */
  private analyzeUserRequest(description: string): { requestedServices: string[]; keywords: string[] } {
    const lowerDesc = description.toLowerCase();
    const requestedServices: string[] = [];
    const keywords: string[] = [];

    // Service detection mapping
    const serviceKeywords: Record<string, string[]> = {
      'Email/Gmail': ['email', 'gmail', 'inbox', 'mail', 'outlook', 'imap'],
      'Slack': ['slack', 'slack message', 'slack channel'],
      'Google Sheets': ['google sheets', 'spreadsheet', 'google sheet', 'sheets'],
      'Excel': ['excel', 'xlsx', 'xls', 'microsoft excel'],
      'HTTP Request': ['http', 'api', 'request', 'webhook', 'rest', 'fetch'],
      'AI/LLM': ['ai', 'gemini', 'openai', 'gpt', 'llm', 'summarize', 'summary', 'analyze', 'generate text'],
      'Database': ['database', 'postgres', 'mysql', 'mongodb', 'sql'],
      'Airtable': ['airtable'],
      'Notion': ['notion'],
      'Discord': ['discord'],
      'Telegram': ['telegram'],
      'Twitter/X': ['twitter', 'tweet', 'x.com'],
      'GitHub': ['github', 'repo', 'repository', 'git'],
      'Jira': ['jira', 'issue', 'ticket'],
      'Trello': ['trello', 'board', 'card'],
      'Conditional': ['if', 'condition', 'when', 'branch', 'otherwise', 'else'],
      'Loop': ['each', 'every', 'loop', 'iterate', 'batch', 'all items'],
      'Filter': ['filter', 'remove', 'exclude', 'only'],
      'Transform': ['transform', 'convert', 'process', 'modify'],
      'Code': ['code', 'javascript', 'script', 'custom'],
      'Schedule': ['schedule', 'cron', 'timer', 'daily', 'hourly'],
      'Merge': ['merge', 'combine', 'join'],
    };

    // Detect requested services
    for (const [service, serviceKeywordList] of Object.entries(serviceKeywords)) {
      for (const keyword of serviceKeywordList) {
        if (lowerDesc.includes(keyword)) {
          if (!requestedServices.includes(service)) {
            requestedServices.push(service);
          }
          if (!keywords.includes(keyword)) {
            keywords.push(keyword);
          }
        }
      }
    }

    return { requestedServices, keywords };
  }

  /**
   * Compare user request to generated workflow
   */
  private compareRequestToGenerated(description: string, workflow: any): GenerationAnalysis {
    const { requestedServices } = this.analyzeUserRequest(description);
    const generatedNodeTypes = workflow.nodes?.map((n: any) => n.type) || [];

    // Map node types to services
    const nodeTypeToService: Record<string, string> = {
      'n8n-nodes-base.gmail': 'Email/Gmail',
      'n8n-nodes-base.emailSend': 'Email/Gmail',
      'n8n-nodes-base.microsoftOutlook': 'Email/Gmail',
      'n8n-nodes-base.slack': 'Slack',
      'n8n-nodes-base.googleSheets': 'Google Sheets',
      'n8n-nodes-base.microsoftExcel': 'Excel',
      'n8n-nodes-base.spreadsheetFile': 'Excel',
      'n8n-nodes-base.httpRequest': 'HTTP Request',
      'n8n-nodes-base.webhook': 'HTTP Request',
      'n8n-nodes-base.openAi': 'AI/LLM',
      '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': 'AI/LLM',
      '@n8n/n8n-nodes-langchain.chainLlm': 'AI/LLM',
      '@n8n/n8n-nodes-langchain.chainSummarization': 'AI/LLM',
      'n8n-nodes-base.code': 'Code',
      'n8n-nodes-base.postgres': 'Database',
      'n8n-nodes-base.mySql': 'Database',
      'n8n-nodes-base.mongoDb': 'Database',
      'n8n-nodes-base.airtable': 'Airtable',
      'n8n-nodes-base.notion': 'Notion',
      'n8n-nodes-base.discord': 'Discord',
      'n8n-nodes-base.telegram': 'Telegram',
      'n8n-nodes-base.twitter': 'Twitter/X',
      'n8n-nodes-base.github': 'GitHub',
      'n8n-nodes-base.jira': 'Jira',
      'n8n-nodes-base.trello': 'Trello',
      'n8n-nodes-base.if': 'Conditional',
      'n8n-nodes-base.switch': 'Conditional',
      'n8n-nodes-base.splitInBatches': 'Loop',
      'n8n-nodes-base.filter': 'Filter',
      'n8n-nodes-base.set': 'Transform',
      'n8n-nodes-base.schedule': 'Schedule',
      'n8n-nodes-base.merge': 'Merge',
    };

    // Find generated services
    const generatedServices: string[] = [];
    for (const nodeType of generatedNodeTypes) {
      const service = nodeTypeToService[nodeType];
      if (service && !generatedServices.includes(service)) {
        generatedServices.push(service);
      }
    }

    // Find missing services
    const missingServices = requestedServices.filter(s => !generatedServices.includes(s));

    // Generate explanation
    let explanation = '';
    if (missingServices.length === 0) {
      explanation = 'All requested services were included in the generated workflow.';
    } else {
      explanation = `The following requested services were not included: ${missingServices.join(', ')}. ` +
        `This may be due to: 1) Missing node type support, 2) AI not understanding the request, or ` +
        `3) Keywords not being recognized.`;
    }

    return {
      requestedServices,
      detectedNodeTypes: generatedNodeTypes,
      generatedNodeTypes: generatedServices,
      missingServices,
      explanation,
    };
  }

  /**
   * Sanitize data to remove sensitive information
   */
  private sanitizeData(data: any): any {
    if (!data) return data;

    const sensitiveKeys = ['apiKey', 'api_key', 'password', 'secret', 'token', 'apiKeyEncrypted'];
    const sanitized = { ...data };

    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  /**
   * Log to console with color coding
   */
  private logToConsole(entry: LogEntry): void {
    const colors = {
      [LogLevel.DEBUG]: '\x1b[90m', // Gray
      [LogLevel.INFO]: '\x1b[36m',  // Cyan
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';
    const color = colors[entry.level];

    const shortId = entry.generationId.slice(0, 8);
    console.log(
      `${color}[${entry.timestamp}] [${entry.level}] [${shortId}] [${entry.category}]${reset} ${entry.message}`,
      entry.data ? JSON.stringify(entry.data, null, 2) : ''
    );
  }

  /**
   * Flush log buffer to file
   */
  flush(): void {
    if (this.logBuffer.length === 0) return;

    try {
      const logLines = this.logBuffer.map(entry =>
        JSON.stringify(entry)
      ).join('\n') + '\n';

      fs.appendFileSync(this.logFilePath, logLines);
      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to flush workflow logs:', error);
    }
  }

  /**
   * Get recent logs for a generation
   */
  async getLogsForGeneration(generationId: string): Promise<LogEntry[]> {
    const logs: LogEntry[] = [];

    // Read from in-memory buffer first
    logs.push(...this.logBuffer.filter(l => l.generationId === generationId));

    // Read from file
    try {
      if (fs.existsSync(this.logFilePath)) {
        const content = fs.readFileSync(this.logFilePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as LogEntry;
            if (entry.generationId === generationId) {
              logs.push(entry);
            }
          } catch {
            // Skip invalid lines
          }
        }
      }
    } catch (error) {
      console.error('Failed to read workflow logs:', error);
    }

    return logs;
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

// Export singleton instance
export const workflowLogger = WorkflowLoggerService.getInstance();
