/**
 * Workflow Gap Detector Service
 * Detects missing or incomplete elements in workflow descriptions
 * AND analyzes generated workflow structure for structural issues
 */

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

export interface Gap {
  type:
    | 'missing_trigger'
    | 'missing_output'
    | 'vague_source'
    | 'missing_ai_details'
    | 'missing_credentials'
    | 'unclear_condition'
    | 'missing_data_transformation'
    | 'orphaned_node'
    | 'broken_ai_chain'
    | 'missing_node_params'
    | 'disconnected_flow'
    | 'duplicate_trigger';
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestions: string[];
  autoFixable?: boolean;
  affectedNodes?: string[];
}

export interface MissingStep {
  step: string;
  reason: string;
  nodeToAdd: string;
  autoFix: boolean;
}

export interface ClarificationQuestion {
  question: string;
  context: string;
  options?: string[];
}

class WorkflowGapDetectorService {
  /**
   * Detect gaps in description AND optional workflow structure
   */
  detectGaps(description: string, workflow?: N8nWorkflow): Gap[] {
    const gaps: Gap[] = [];
    const lowerDesc = description.toLowerCase();

    // === DESCRIPTION-BASED GAPS ===

    // Check for missing trigger
    if (!this.hasTriggerKeywords(lowerDesc)) {
      gaps.push({
        type: 'missing_trigger',
        severity: 'high',
        message: 'How should this workflow start?',
        suggestions: [
          'When I click "Run" manually',
          'When I receive an email',
          'Every day at 9 AM',
          'When someone submits a form',
          'When a webhook is called',
        ],
        autoFixable: true,
      });
    }

    // Check for missing output
    if (!this.hasOutputKeywords(lowerDesc)) {
      gaps.push({
        type: 'missing_output',
        severity: 'high',
        message: 'Where should the results go?',
        suggestions: [
          'Save to Google Sheets',
          'Send email notification via Gmail',
          'Save to Google Drive',
          'Write to Google Docs',
        ],
        autoFixable: false,
      });
    }

    // Check for vague data sources
    if (this.hasVagueSource(lowerDesc)) {
      gaps.push({
        type: 'vague_source',
        severity: 'medium',
        message: 'Which specific data should I process?',
        suggestions: [
          'Emails from a specific sender (e.g., "from john@example.com")',
          'Emails with specific subject',
          'Emails from the last X days',
          'Specific spreadsheet by ID or URL',
        ],
        autoFixable: false,
      });
    }

    // Check for missing AI processing details
    if (this.mentionsAI(lowerDesc) && !this.hasAIDetails(lowerDesc)) {
      gaps.push({
        type: 'missing_ai_details',
        severity: 'medium',
        message: 'What should the AI do with the data?',
        suggestions: [
          'Summarize the content',
          'Extract key information',
          'Classify or categorize',
          'Generate a response',
          'Analyze sentiment',
        ],
        autoFixable: false,
      });
    }

    // Check for unclear conditions
    if (this.mentionsFiltering(lowerDesc) && !this.hasConditionDetails(lowerDesc)) {
      gaps.push({
        type: 'unclear_condition',
        severity: 'medium',
        message: 'What filtering condition should I use?',
        suggestions: [
          'Only items where [field] equals [value]',
          'Only items from the last [X] days',
          'Only items matching [pattern]',
          'Exclude items where [condition]',
        ],
        autoFixable: false,
      });
    }

    // Check for missing data transformation
    if (this.needsDataTransformation(lowerDesc) && !this.hasTransformationDetails(lowerDesc)) {
      gaps.push({
        type: 'missing_data_transformation',
        severity: 'low',
        message: 'How should I combine or transform the data?',
        suggestions: [
          'Combine all items into one',
          'Group by [field]',
          'Extract specific fields',
          'Format as [type]',
        ],
        autoFixable: true,
      });
    }

    // === WORKFLOW STRUCTURAL GAPS (only if workflow provided) ===
    if (workflow) {
      gaps.push(...this.detectStructuralGaps(workflow));
    }

    return gaps;
  }

  /**
   * Analyze the generated workflow structure for issues
   */
  private detectStructuralGaps(workflow: N8nWorkflow): Gap[] {
    const gaps: Gap[] = [];
    const nodeNames = new Set(workflow.nodes.map((n) => n.name));

    // 1. Orphaned nodes: nodes that have no incoming OR outgoing connections
    const connectedNodes = this.getConnectedNodeNames(workflow);
    const orphanedNodes = workflow.nodes.filter(
      (n) => !this.isTriggerNode(n) && !connectedNodes.has(n.name)
    );
    if (orphanedNodes.length > 0) {
      gaps.push({
        type: 'orphaned_node',
        severity: 'high',
        message: `${orphanedNodes.length} node(s) are not connected to any other nodes`,
        suggestions: [
          'Connect orphaned nodes into the workflow chain',
          'Remove unused nodes',
        ],
        autoFixable: true,
        affectedNodes: orphanedNodes.map((n) => n.name),
      });
    }

    // 2. Broken AI chain: chainLlm without ai_model connection
    const chainNodes = workflow.nodes.filter((n) =>
      n.type.includes('chainLlm')
    );
    for (const chainNode of chainNodes) {
      const hasAiModelConnection = this.hasAiModelInput(chainNode.name, workflow);
      if (!hasAiModelConnection) {
        gaps.push({
          type: 'broken_ai_chain',
          severity: 'high',
          message: `AI chain "${chainNode.name}" has no AI model connected via ai_model`,
          suggestions: [
            'Add Google Gemini Chat Model node and connect via ai_model',
          ],
          autoFixable: true,
          affectedNodes: [chainNode.name],
        });
      }
    }

    // 3. AI model node exists but isn't connected to any chain
    const aiModelNodes = workflow.nodes.filter(
      (n) =>
        n.type.includes('lmChatGoogleGemini') ||
        n.type.includes('lmChatGoogle') ||
        n.type.includes('lmChat')
    );
    for (const modelNode of aiModelNodes) {
      const isConnectedToChain = this.isNodeTargetedByAiModel(modelNode.name, workflow);
      if (!isConnectedToChain) {
        gaps.push({
          type: 'broken_ai_chain',
          severity: 'high',
          message: `AI model "${modelNode.name}" exists but is not connected to any LLM chain`,
          suggestions: [
            'Connect this model to a Basic LLM Chain node via ai_model connection',
          ],
          autoFixable: true,
          affectedNodes: [modelNode.name],
        });
      }
    }

    // 4. Missing required parameters on key node types
    const paramGaps = this.detectMissingParams(workflow);
    gaps.push(...paramGaps);

    // 5. Disconnected flow: trigger exists but doesn't connect to any nodes
    const triggerNodes = workflow.nodes.filter((n) => this.isTriggerNode(n));
    for (const trigger of triggerNodes) {
      const triggerConnections = workflow.connections[trigger.name];
      const hasOutgoing =
        triggerConnections?.main?.some((arr) => arr.length > 0) ?? false;
      if (!hasOutgoing) {
        gaps.push({
          type: 'disconnected_flow',
          severity: 'high',
          message: `Trigger "${trigger.name}" has no outgoing connections`,
          suggestions: [
            'Connect the trigger to the next node in the workflow',
          ],
          autoFixable: true,
          affectedNodes: [trigger.name],
        });
      }
    }

    // 6. Duplicate triggers: only one trigger allowed per workflow
    if (triggerNodes.length > 1) {
      gaps.push({
        type: 'duplicate_trigger',
        severity: 'high',
        message: `Workflow has ${triggerNodes.length} trigger nodes — only 1 is allowed`,
        suggestions: ['Remove extra trigger nodes, keep only the primary one'],
        autoFixable: true,
        affectedNodes: triggerNodes.map((n) => n.name),
      });
    }

    // 7. Connections reference non-existent nodes
    for (const [sourceName, conn] of Object.entries(workflow.connections)) {
      if (!nodeNames.has(sourceName)) {
        gaps.push({
          type: 'disconnected_flow',
          severity: 'high',
          message: `Connection from "${sourceName}" references a node that doesn't exist`,
          suggestions: ['Remove the orphaned connection or add the missing node'],
          autoFixable: true,
          affectedNodes: [sourceName],
        });
        continue;
      }
      // Check main connections target valid nodes
      for (const mainArr of conn.main || []) {
        for (const target of mainArr) {
          if (!nodeNames.has(target.node)) {
            gaps.push({
              type: 'disconnected_flow',
              severity: 'high',
              message: `Connection from "${sourceName}" targets non-existent node "${target.node}"`,
              suggestions: ['Fix the connection target or add the missing node'],
              autoFixable: true,
              affectedNodes: [sourceName, target.node],
            });
          }
        }
      }
      // Check ai_model connections target valid nodes
      for (const aiArr of conn.ai_model || []) {
        for (const target of aiArr) {
          if (!nodeNames.has(target.node)) {
            gaps.push({
              type: 'broken_ai_chain',
              severity: 'high',
              message: `AI model connection from "${sourceName}" targets non-existent node "${target.node}"`,
              suggestions: ['Fix the ai_model connection target'],
              autoFixable: true,
              affectedNodes: [sourceName, target.node],
            });
          }
        }
      }
    }

    return gaps;
  }

  /**
   * Get all node names that appear in any connection (source or target)
   */
  private getConnectedNodeNames(workflow: N8nWorkflow): Set<string> {
    const connected = new Set<string>();
    for (const [sourceName, conn] of Object.entries(workflow.connections)) {
      connected.add(sourceName);
      for (const mainArr of conn.main || []) {
        for (const target of mainArr) {
          connected.add(target.node);
        }
      }
      for (const aiArr of (conn as any).ai_model || []) {
        for (const target of aiArr) {
          connected.add(target.node);
        }
      }
    }
    return connected;
  }

  /**
   * Check if a chain node has an ai_model connection coming into it
   */
  private hasAiModelInput(chainNodeName: string, workflow: N8nWorkflow): boolean {
    for (const conn of Object.values(workflow.connections)) {
      const aiModelConns = (conn as any).ai_model;
      if (aiModelConns) {
        for (const arr of aiModelConns) {
          if (arr.some((t: any) => t.node === chainNodeName)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if an AI model node is referenced in any ai_model connection
   */
  private isNodeTargetedByAiModel(modelNodeName: string, workflow: N8nWorkflow): boolean {
    // Check if any connection's ai_model array references this model
    // The pattern is: connections[modelNodeName].ai_model targets the chain
    // OR connections[someNode].ai_model has modelNodeName as a source
    const modelConnections = workflow.connections[modelNodeName];
    if (modelConnections?.ai_model?.some((arr) => arr.length > 0)) {
      return true;
    }
    // Also check if this model is a target in any ai_model connection
    for (const conn of Object.values(workflow.connections)) {
      const aiModelConns = (conn as any).ai_model;
      if (aiModelConns) {
        for (const arr of aiModelConns) {
          if (arr.some((t: any) => t.node === modelNodeName)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Detect missing required parameters on known node types
   */
  private detectMissingParams(workflow: N8nWorkflow): Gap[] {
    const gaps: Gap[] = [];

    for (const node of workflow.nodes) {
      const shortType = node.type.split('.').pop() || '';

      // Gmail: must have operation
      if (shortType === 'gmail' || shortType === 'gmailTrigger') {
        if (shortType === 'gmail' && !node.parameters.operation) {
          gaps.push({
            type: 'missing_node_params',
            severity: 'medium',
            message: `Gmail node "${node.name}" missing "operation" parameter`,
            suggestions: ['Set operation to "getAll", "get", "send", "draft", etc.'],
            autoFixable: true,
            affectedNodes: [node.name],
          });
        }
      }

      // Google Sheets: must have documentId and sheetName
      if (shortType === 'googleSheets' || shortType === 'googleSheetsTrigger') {
        if (shortType === 'googleSheets') {
          if (!node.parameters.documentId && !node.parameters.sheetId) {
            gaps.push({
              type: 'missing_node_params',
              severity: 'medium',
              message: `Google Sheets node "${node.name}" missing spreadsheet reference`,
              suggestions: ['Add documentId parameter or sheetId to identify the spreadsheet'],
              autoFixable: false,
              affectedNodes: [node.name],
            });
          }
        }
      }

      // Edit Fields (Set): should have assignments
      if (shortType === 'set') {
        if (
          !node.parameters.assignments &&
          !node.parameters.values &&
          !node.parameters.options
        ) {
          gaps.push({
            type: 'missing_node_params',
            severity: 'medium',
            message: `Edit Fields node "${node.name}" has no field assignments`,
            suggestions: [
              'Add assignments to set field values (e.g., chatInput for AI chains)',
            ],
            autoFixable: true,
            affectedNodes: [node.name],
          });
        }
      }

      // Chain LLM: should have prompt or text
      if (shortType === 'chainLlm') {
        if (!node.parameters.prompt && !node.parameters.text && !node.parameters.messages) {
          gaps.push({
            type: 'missing_node_params',
            severity: 'medium',
            message: `LLM Chain "${node.name}" has no prompt configured`,
            suggestions: [
              'Add a prompt parameter with instructions for the AI',
              'Use {{ $json.chatInput }} to reference the Edit Fields input',
            ],
            autoFixable: true,
            affectedNodes: [node.name],
          });
        }
      }
    }

    return gaps;
  }

  private isTriggerNode(node: WorkflowNode): boolean {
    return (
      node.type.includes('Trigger') ||
      node.type.includes('trigger') ||
      node.type === 'n8n-nodes-base.manualTrigger' ||
      node.type === 'n8n-nodes-base.webhook'
    );
  }

  /**
   * Suggest missing steps based on detected nodes, description, AND workflow structure
   */
  suggestMissingSteps(
    description: string,
    detectedNodes: string[],
    workflow?: N8nWorkflow
  ): MissingStep[] {
    const suggestions: MissingStep[] = [];
    const lowerDesc = description.toLowerCase();

    // If has Gmail input but no processing
    if (
      detectedNodes.includes('gmail') &&
      !detectedNodes.includes('aggregate') &&
      this.mentionsMultiple(lowerDesc)
    ) {
      suggestions.push({
        step: 'Add data aggregation',
        reason: 'You may get multiple emails - combine them before processing',
        nodeToAdd: 'Item Lists (aggregate)',
        autoFix: true,
      });
    }

    // If has AI but no Edit Fields input (chain+model pattern)
    if (
      (detectedNodes.includes('chainLlm') || this.mentionsAI(lowerDesc)) &&
      !detectedNodes.includes('set')
    ) {
      suggestions.push({
        step: 'Add Edit Fields node before AI',
        reason: 'AI chain needs input formatted as "chatInput" field',
        nodeToAdd: 'Edit Fields (Set)',
        autoFix: true,
      });
    }

    // If has email trigger but no filtering
    if (
      detectedNodes.includes('gmail') &&
      !detectedNodes.includes('filter') &&
      this.needsFiltering(lowerDesc)
    ) {
      suggestions.push({
        step: 'Add email filtering',
        reason: 'Filter emails by sender, subject, or date to get specific ones',
        nodeToAdd: 'Filter or Gmail query parameters',
        autoFix: true,
      });
    }

    // If processes multiple items but no aggregation before AI
    if (
      this.mentionsAI(lowerDesc) &&
      this.mentionsMultiple(lowerDesc) &&
      !detectedNodes.includes('aggregate')
    ) {
      suggestions.push({
        step: 'Aggregate items before AI processing',
        reason: 'AI should process all items together, not one by one',
        nodeToAdd: 'Aggregate or Item Lists',
        autoFix: true,
      });
    }

    // === BIGQUERY + CONFLUENCE (via httpRequest) WORKFLOW GAPS ===
    // NOTE: n8n-nodes-base.confluence does NOT exist. Confluence must use httpRequest.
    const hasBigQuery = detectedNodes.includes('googleBigQuery');
    const hasCode = detectedNodes.includes('code');
    const needsBigQuery = lowerDesc.includes('bigquery') || lowerDesc.includes('big query') || lowerDesc.includes('bq ');
    const needsConfluence = lowerDesc.includes('confluence') || lowerDesc.includes('wiki') || lowerDesc.includes('atlassian');

    // BigQuery present but no Code node to transform results → Confluence Storage Format HTML
    if (hasBigQuery && !hasCode && needsConfluence) {
      suggestions.push({
        step: 'Add Code node to transform BigQuery results into Confluence Storage Format HTML table',
        reason: 'BigQuery returns JSON rows — need a Code node to build Confluence Storage Format HTML with search/filter and the full updatePayload for the Confluence REST API PUT',
        nodeToAdd: 'Code node (build Confluence Storage Format HTML + updatePayload)',
        autoFix: true,
      });
    }

    // Fake confluence node detected — must be replaced with httpRequest
    if (workflow) {
      const hasFakeConfluenceNode = workflow.nodes.some(n => n.type === 'n8n-nodes-base.confluence');
      if (hasFakeConfluenceNode) {
        suggestions.push({
          step: 'Replace n8n-nodes-base.confluence with httpRequest calling Atlassian REST API v2',
          reason: 'n8n-nodes-base.confluence does not exist in n8n. Must use httpRequest GET + PUT to https://risecodes.atlassian.net/wiki/api/v2/pages/576028681 with jiraSoftwareCloudApi credentials',
          nodeToAdd: 'httpRequest GET + httpRequest PUT (jiraSoftwareCloudApi auth, Atlassian REST API v2)',
          autoFix: true,
        });
      }
    }

    // Confluence via httpRequest — check GET exists before PUT
    if (needsConfluence && workflow) {
      const httpNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
      const hasAtlassianGet = httpNodes.some(n => {
        const url = String(n.parameters?.url || '');
        const method = String(n.parameters?.method || 'GET').toUpperCase();
        return url.includes('atlassian.net') && method === 'GET';
      });
      const hasAtlassianPut = httpNodes.some(n => {
        const url = String(n.parameters?.url || '');
        const method = String(n.parameters?.method || '').toUpperCase();
        return url.includes('atlassian.net') && method === 'PUT';
      });
      if (hasAtlassianPut && !hasAtlassianGet) {
        suggestions.push({
          step: 'Add httpRequest GET before PUT to fetch current Confluence page version',
          reason: 'Confluence API v2 PUT requires version.number+1 — must GET current version first',
          nodeToAdd: 'httpRequest GET https://risecodes.atlassian.net/wiki/api/v2/pages/576028681 (jiraSoftwareCloudApi auth)',
          autoFix: true,
        });
      }
      if (!hasAtlassianGet && !hasAtlassianPut && !workflow.nodes.some(n => n.type === 'n8n-nodes-base.confluence')) {
        suggestions.push({
          step: 'Add httpRequest nodes for Confluence GET and PUT',
          reason: 'Confluence update requires two httpRequest nodes: GET to fetch version, PUT to update with version+1',
          nodeToAdd: 'httpRequest GET + httpRequest PUT to https://risecodes.atlassian.net/wiki/api/v2/pages/576028681',
          autoFix: true,
        });
      }
    }

    // Description mentions BigQuery but no BigQuery node generated
    if (needsBigQuery && !hasBigQuery) {
      suggestions.push({
        step: 'Add Google BigQuery node to run the SQL query',
        reason: 'User asked for BigQuery but no googleBigQuery node was generated',
        nodeToAdd: 'n8n-nodes-base.googleBigQuery (operation=executeQuery)',
        autoFix: true,
      });
    }

    // === WORKFLOW STRUCTURE-BASED SUGGESTIONS ===
    if (workflow) {
      // If structural gaps were found, suggest fixes
      const structuralGaps = this.detectStructuralGaps(workflow);

      for (const gap of structuralGaps) {
        if (gap.type === 'broken_ai_chain' && gap.autoFixable) {
          suggestions.push({
            step: 'Fix AI chain connection',
            reason: gap.message,
            nodeToAdd: 'Google Gemini Chat Model + ai_model connection',
            autoFix: true,
          });
        }

        if (gap.type === 'orphaned_node' && gap.affectedNodes) {
          suggestions.push({
            step: `Connect orphaned node(s): ${gap.affectedNodes.join(', ')}`,
            reason: 'These nodes are disconnected from the workflow',
            nodeToAdd: 'Connection wiring',
            autoFix: true,
          });
        }

        if (gap.type === 'disconnected_flow' && gap.autoFixable) {
          suggestions.push({
            step: 'Fix disconnected workflow flow',
            reason: gap.message,
            nodeToAdd: 'Connection repair',
            autoFix: true,
          });
        }

        if (gap.type === 'missing_node_params' && gap.autoFixable) {
          suggestions.push({
            step: `Add missing parameters to ${gap.affectedNodes?.[0] || 'node'}`,
            reason: gap.message,
            nodeToAdd: 'Parameter configuration',
            autoFix: true,
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Generate auto-fix suggestions for the description
   */
  generateAutoFixes(description: string, gaps: Gap[]): string[] {
    const fixes: string[] = [];
    const lowerDesc = description.toLowerCase();

    for (const gap of gaps) {
      if (!gap.autoFixable) continue;

      switch (gap.type) {
        case 'missing_trigger':
          if (!this.hasTriggerKeywords(lowerDesc)) {
            fixes.push(
              'Add trigger: Start this workflow manually when I click "Run"'
            );
          }
          break;

        case 'missing_data_transformation':
          if (this.mentionsMultiple(lowerDesc)) {
            fixes.push('Combine all items into a single list before processing');
          }
          break;

        case 'orphaned_node':
          fixes.push(
            `Connect orphaned nodes into the workflow: ${gap.affectedNodes?.join(', ') || 'unknown'}`
          );
          break;

        case 'broken_ai_chain':
          fixes.push(
            'Add Google Gemini Chat Model and connect via ai_model to the LLM chain'
          );
          break;

        case 'disconnected_flow':
          fixes.push('Wire disconnected nodes into the workflow flow');
          break;

        case 'missing_node_params':
          fixes.push(
            `Add required parameters to ${gap.affectedNodes?.[0] || 'node'}`
          );
          break;

        case 'duplicate_trigger':
          fixes.push('Remove duplicate trigger nodes — keep only one');
          break;
      }
    }

    return fixes;
  }

  /**
   * Detect ambiguous or underspecified requests that need clarification
   * Returns questions the user should answer for a better workflow
   */
  detectAmbiguities(description: string): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];
    const lower = description.toLowerCase();

    // 1. Ambiguous frequency: "regularly" / "periodically" without specifics
    if (
      (lower.includes('regularly') ||
        lower.includes('periodically') ||
        lower.includes('from time to time') ||
        lower.includes('often')) &&
      !this.hasSpecificSchedule(lower)
    ) {
      questions.push({
        question: 'How often should this workflow run?',
        context: 'You mentioned running it regularly but didn\'t specify a frequency.',
        options: ['Every hour', 'Every day at 9 AM', 'Every Monday', 'Every month on the 1st'],
      });
    }

    // 2. "Send notification" without specifying channel
    if (
      (lower.includes('notification') ||
        lower.includes('notify') ||
        lower.includes('alert me')) &&
      !lower.includes('email') &&
      !lower.includes('gmail') &&
      !lower.includes('sheet') &&
      !lower.includes('docs')
    ) {
      questions.push({
        question: 'How should I send the notification?',
        context: 'You want to be notified but didn\'t specify the channel.',
        options: ['Send an email via Gmail', 'Add a row to Google Sheets', 'Write to Google Docs'],
      });
    }

    // 3. "Process" / "handle" data without specifying what to do
    if (
      (lower.includes('process') ||
        lower.includes('handle') ||
        lower.includes('deal with') ||
        lower.includes('take care of')) &&
      !this.hasAIDetails(lower) &&
      !lower.includes('forward') &&
      !lower.includes('copy') &&
      !lower.includes('move') &&
      !lower.includes('delete')
    ) {
      questions.push({
        question: 'What should I do with the data?',
        context: 'You mentioned processing data but didn\'t specify the action.',
        options: [
          'Summarize with AI',
          'Extract key information',
          'Forward to another service',
          'Save/archive to Google Sheets',
        ],
      });
    }

    // 4. Multiple data sources mentioned without priority
    const sources: string[] = [];
    if (lower.includes('email') || lower.includes('gmail') || lower.includes('inbox')) sources.push('email');
    if (lower.includes('sheet') || lower.includes('spreadsheet')) sources.push('sheets');
    if (lower.includes('drive') || lower.includes('file')) sources.push('drive');
    if (lower.includes('docs') || lower.includes('document')) sources.push('docs');
    if (sources.length > 2) {
      questions.push({
        question: 'Which data source should be the starting point?',
        context: `You mentioned ${sources.join(', ')} — which one triggers the workflow?`,
        options: sources.map((s) => `Start from ${s}`),
      });
    }

    // 5. "Important" / "urgent" emails without defining criteria
    if (
      (lower.includes('important') || lower.includes('urgent') || lower.includes('priority')) &&
      (lower.includes('email') || lower.includes('gmail')) &&
      !this.hasConditionDetails(lower)
    ) {
      questions.push({
        question: 'How should I identify important emails?',
        context: 'You want to filter important emails but didn\'t define the criteria.',
        options: [
          'From specific senders',
          'With specific subject keywords',
          'Marked as important in Gmail',
          'Received in the last 24 hours',
        ],
      });
    }

    // 6. Generic "data" without specifying what kind
    if (
      lower.includes('data') &&
      !lower.includes('email') &&
      !lower.includes('sheet') &&
      !lower.includes('file') &&
      !lower.includes('drive') &&
      !lower.includes('doc') &&
      !lower.includes('form')
    ) {
      questions.push({
        question: 'What kind of data are you working with?',
        context: 'You mentioned "data" — could you be more specific?',
        options: [
          'Emails from Gmail',
          'Rows from Google Sheets',
          'Files from Google Drive',
          'Data from a webhook/API',
        ],
      });
    }

    return questions;
  }

  private hasSpecificSchedule(description: string): boolean {
    return (
      /every\s+\d+\s+(minute|hour|day|week|month)/i.test(description) ||
      /at\s+\d{1,2}(:\d{2})?\s*(am|pm)?/i.test(description) ||
      /daily/i.test(description) ||
      /hourly/i.test(description) ||
      /weekly/i.test(description) ||
      /monthly/i.test(description) ||
      /cron/i.test(description)
    );
  }

  // Helper methods for detection

  private hasTriggerKeywords(description: string): boolean {
    const triggerKeywords = [
      'when i click',
      'manual',
      'manually',
      'when i receive',
      'when someone',
      'when a',
      'every day',
      'every hour',
      'every week',
      'every month',
      'schedule',
      'daily',
      'hourly',
      'weekly',
      'monthly',
      'webhook',
      'trigger',
      'form submit',
      'on submit',
      'cron',
      'interval',
      'recurring',
    ];
    return triggerKeywords.some((keyword) => description.includes(keyword));
  }

  private hasOutputKeywords(description: string): boolean {
    const outputKeywords = [
      'send to',
      'save to',
      'save in',
      'write to',
      'email',
      'notify',
      'spreadsheet',
      'sheet',
      'database',
      'webhook',
      'api',
      'post to',
      'google sheets',
      'google docs',
      'google drive',
      'gmail',
      'drive',
      'docs',
      'respond',
      'reply',
      'store',
      'output',
      'upload',
      'log',
    ];
    return outputKeywords.some((keyword) => description.includes(keyword));
  }

  private hasVagueSource(description: string): boolean {
    const vagueTerms = [
      'get emails',
      'fetch data',
      'retrieve',
      'check for',
      'look for',
      'find',
    ];
    const hasVague = vagueTerms.some((term) => description.includes(term));

    const hasSpecific = [
      'from',
      'sender:',
      'last',
      'days',
      'hours',
      'subject:',
      'containing',
      'matching',
      'where',
      'http://',
      'https://',
      'spreadsheet',
      'channel',
    ].some((specific) => description.includes(specific));

    return hasVague && !hasSpecific;
  }

  private mentionsAI(description: string): boolean {
    const aiKeywords = [
      'ai',
      'gemini',
      'summarize',
      'summary',
      'analyze',
      'classify',
      'extract',
      'generate',
      'llm',
      'language model',
    ];
    return aiKeywords.some((keyword) => description.includes(keyword));
  }

  private hasAIDetails(description: string): boolean {
    const detailKeywords = [
      'summarize',
      'extract',
      'classify',
      'analyze',
      'generate',
      'answer',
      'respond',
      'translate',
      'sentiment',
      'topics',
      'key points',
    ];
    return detailKeywords.some((keyword) => description.includes(keyword));
  }

  private mentionsFiltering(description: string): boolean {
    const filterKeywords = [
      'filter',
      'only',
      'where',
      'if',
      'when',
      'matching',
      'specific',
      'certain',
    ];
    return filterKeywords.some((keyword) => description.includes(keyword));
  }

  private hasConditionDetails(description: string): boolean {
    const conditionPatterns = [
      /from\s+[a-z@.]+/i,
      /equals?\s+/i,
      /contains?\s+/i,
      /last\s+\d+\s+(day|hour|week)/i,
      /subject.*:/i,
      /status\s*=\s*/i,
    ];
    return conditionPatterns.some((pattern) => pattern.test(description));
  }

  private needsDataTransformation(description: string): boolean {
    const transformKeywords = [
      'all',
      'multiple',
      'each',
      'every',
      'combine',
      'merge',
      'aggregate',
    ];
    return transformKeywords.some((keyword) => description.includes(keyword));
  }

  private hasTransformationDetails(description: string): boolean {
    const detailKeywords = [
      'aggregate',
      'combine into',
      'merge all',
      'as one',
      'single',
      'together',
    ];
    return detailKeywords.some((keyword) => description.includes(keyword));
  }

  private mentionsMultiple(description: string): boolean {
    const multipleKeywords = [
      'all',
      'multiple',
      'every',
      'each',
      'all emails',
      'all items',
      'all rows',
    ];
    return multipleKeywords.some((keyword) => description.includes(keyword));
  }

  private needsFiltering(description: string): boolean {
    const filteringIndicators = [
      'specific',
      'from',
      'only',
      'last',
      'certain',
      'matching',
    ];
    return filteringIndicators.some((indicator) =>
      description.includes(indicator)
    );
  }
}

export const workflowGapDetectorService = new WorkflowGapDetectorService();
