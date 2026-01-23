/**
 * Workflow Gap Detector Service
 * Detects missing or incomplete elements in workflow descriptions
 * and provides suggestions to help users create complete workflows
 */

export interface Gap {
  type: 'missing_trigger' | 'missing_output' | 'vague_source' | 'missing_ai_details' | 'missing_credentials' | 'unclear_condition' | 'missing_data_transformation';
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestions: string[];
  autoFixable?: boolean;
}

export interface MissingStep {
  step: string;
  reason: string;
  nodeToAdd: string;
  autoFix: boolean;
}

class WorkflowGapDetectorService {
  /**
   * Detect gaps and missing elements in a workflow description
   */
  detectGaps(description: string): Gap[] {
    const gaps: Gap[] = [];
    const lowerDesc = description.toLowerCase();

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
          'When a webhook is called'
        ],
        autoFixable: true
      });
    }

    // Check for missing output
    if (!this.hasOutputKeywords(lowerDesc)) {
      gaps.push({
        type: 'missing_output',
        severity: 'high',
        message: 'Where should the results go?',
        suggestions: [
          'Send to Slack channel #general',
          'Save to Google Sheets',
          'Send email notification',
          'Update a database',
          'Call a webhook'
        ],
        autoFixable: false
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
          'Specific Slack channel by ID'
        ],
        autoFixable: false
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
          'Analyze sentiment'
        ],
        autoFixable: false
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
          'Exclude items where [condition]'
        ],
        autoFixable: false
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
          'Format as [type]'
        ],
        autoFixable: true
      });
    }

    return gaps;
  }

  /**
   * Suggest missing steps based on detected nodes and description
   */
  suggestMissingSteps(description: string, detectedNodes: string[]): MissingStep[] {
    const suggestions: MissingStep[] = [];
    const lowerDesc = description.toLowerCase();

    // If has Gmail input but no processing
    if (detectedNodes.includes('gmail') && !detectedNodes.includes('aggregate') && this.mentionsMultiple(lowerDesc)) {
      suggestions.push({
        step: 'Add data aggregation',
        reason: 'You may get multiple emails - combine them before processing',
        nodeToAdd: 'Item Lists (aggregate)',
        autoFix: true
      });
    }

    // If has AI but no Edit Fields input (chain+model pattern)
    if ((detectedNodes.includes('chainLlm') || this.mentionsAI(lowerDesc)) && !detectedNodes.includes('set')) {
      suggestions.push({
        step: 'Add Edit Fields node before AI',
        reason: 'AI chain needs input formatted as "chatInput" field',
        nodeToAdd: 'Edit Fields (Set)',
        autoFix: true
      });
    }

    // If mentions Slack but no channel specified
    if (detectedNodes.includes('slack') && !this.hasSlackChannel(lowerDesc)) {
      suggestions.push({
        step: 'Specify Slack channel',
        reason: 'Slack needs a target channel (e.g., #general or C0A1CEBJWJF)',
        nodeToAdd: 'Channel specification',
        autoFix: false
      });
    }

    // If has email trigger but no filtering
    if (detectedNodes.includes('gmail') && !detectedNodes.includes('filter') && this.needsFiltering(lowerDesc)) {
      suggestions.push({
        step: 'Add email filtering',
        reason: 'Filter emails by sender, subject, or date to get specific ones',
        nodeToAdd: 'Filter or Gmail query parameters',
        autoFix: true
      });
    }

    // If processes multiple items but no aggregation before AI
    if (this.mentionsAI(lowerDesc) && this.mentionsMultiple(lowerDesc) && !detectedNodes.includes('aggregate')) {
      suggestions.push({
        step: 'Aggregate items before AI processing',
        reason: 'AI should process all items together, not one by one',
        nodeToAdd: 'Aggregate or Item Lists',
        autoFix: true
      });
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
            fixes.push('Add trigger: Start this workflow manually when I click "Run"');
          }
          break;

        case 'missing_data_transformation':
          if (this.mentionsMultiple(lowerDesc)) {
            fixes.push('Combine all items into a single list before processing');
          }
          break;
      }
    }

    return fixes;
  }

  // Helper methods for detection

  private hasTriggerKeywords(description: string): boolean {
    const triggerKeywords = [
      'when i click', 'manual', 'manually',
      'when i receive', 'when someone', 'when a',
      'every day', 'every hour', 'schedule', 'daily', 'hourly',
      'webhook', 'trigger', 'form submit', 'on submit'
    ];
    return triggerKeywords.some(keyword => description.includes(keyword));
  }

  private hasOutputKeywords(description: string): boolean {
    const outputKeywords = [
      'send to', 'save to', 'save in', 'write to',
      'slack', 'email', 'notify', 'spreadsheet', 'sheet',
      'database', 'webhook', 'api', 'post to'
    ];
    return outputKeywords.some(keyword => description.includes(keyword));
  }

  private hasVagueSource(description: string): boolean {
    const vagueTerms = [
      'get emails', 'fetch data', 'retrieve',
      'check for', 'look for', 'find'
    ];
    const hasVague = vagueTerms.some(term => description.includes(term));

    const hasSpecific = [
      'from', 'sender:', 'last', 'days', 'hours',
      'subject:', 'containing', 'matching', 'where',
      'http://', 'https://', 'spreadsheet', 'channel'
    ].some(specific => description.includes(specific));

    return hasVague && !hasSpecific;
  }

  private mentionsAI(description: string): boolean {
    const aiKeywords = [
      'ai', 'gemini', 'openai', 'gpt', 'chatgpt',
      'summarize', 'summary', 'analyze', 'classify',
      'extract', 'generate', 'llm', 'language model'
    ];
    return aiKeywords.some(keyword => description.includes(keyword));
  }

  private hasAIDetails(description: string): boolean {
    const detailKeywords = [
      'summarize', 'extract', 'classify', 'analyze',
      'generate', 'answer', 'respond', 'translate',
      'sentiment', 'topics', 'key points'
    ];
    return detailKeywords.some(keyword => description.includes(keyword));
  }

  private mentionsFiltering(description: string): boolean {
    const filterKeywords = [
      'filter', 'only', 'where', 'if', 'when',
      'matching', 'specific', 'certain'
    ];
    return filterKeywords.some(keyword => description.includes(keyword));
  }

  private hasConditionDetails(description: string): boolean {
    const conditionPatterns = [
      /from\s+[a-z@.]+/i,
      /equals?\s+/i,
      /contains?\s+/i,
      /last\s+\d+\s+(day|hour|week)/i,
      /subject.*:/i,
      /status\s*=\s*/i
    ];
    return conditionPatterns.some(pattern => pattern.test(description));
  }

  private needsDataTransformation(description: string): boolean {
    const transformKeywords = [
      'all', 'multiple', 'each', 'every',
      'combine', 'merge', 'aggregate'
    ];
    return transformKeywords.some(keyword => description.includes(keyword));
  }

  private hasTransformationDetails(description: string): boolean {
    const detailKeywords = [
      'aggregate', 'combine into', 'merge all',
      'as one', 'single', 'together'
    ];
    return detailKeywords.some(keyword => description.includes(keyword));
  }

  private mentionsMultiple(description: string): boolean {
    const multipleKeywords = [
      'all', 'multiple', 'every', 'each',
      'all emails', 'all items', 'all rows'
    ];
    return multipleKeywords.some(keyword => description.includes(keyword));
  }

  private hasSlackChannel(description: string): boolean {
    // Check for Slack channel ID (C followed by alphanumeric)
    const hasChannelId = /C[A-Z0-9]{8,}/i.test(description);
    // Check for channel name
    const hasChannelName = /#[a-z0-9-]+/.test(description);
    return hasChannelId || hasChannelName;
  }

  private needsFiltering(description: string): boolean {
    const filteringIndicators = [
      'specific', 'from', 'only', 'last',
      'certain', 'matching'
    ];
    return filteringIndicators.some(indicator => description.includes(indicator));
  }
}

export const workflowGapDetectorService = new WorkflowGapDetectorService();
