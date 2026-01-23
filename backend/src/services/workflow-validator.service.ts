import { workflowLearningService } from './workflow-learning.service';
import { workflowPreferencesService } from './workflow-preferences.service';

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

interface ValidationIssue {
  node: string;
  field: string;
  issue: string;
  fix: string;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  correctedNodes: string[];
}

/**
 * Workflow Validator Service
 * Validates and auto-corrects workflow nodes based on n8n node type details
 * Feature #275: Auto-correct common workflow generation issues
 */
class WorkflowValidatorService {
  /**
   * Validate and correct a workflow's nodes
   */
  validateAndCorrect(
    nodes: WorkflowNode[],
    nodeTypeDetails?: Map<string, NodeTypeDetails>
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    const correctedNodes: string[] = [];

    if (!nodeTypeDetails || nodeTypeDetails.size === 0) {
      return { valid: true, issues: [], correctedNodes: [] };
    }

    for (const node of nodes) {
      const details = nodeTypeDetails.get(node.type);
      if (!details || !details.properties) {
        continue;
      }

      const nodeIssues = this.validateNode(node, details);
      if (nodeIssues.length > 0) {
        issues.push(...nodeIssues);
        correctedNodes.push(node.name);

        // Record learnings for future improvements
        for (const issue of nodeIssues) {
          workflowLearningService.recordLearning(
            issue.issue,
            issue.fix,
            `Auto-corrected ${node.type}`,
            [node.type]
          );
        }
      }
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      correctedNodes: Array.from(new Set(correctedNodes)),
    };
  }

  /**
   * Validate and correct a single node
   */
  private validateNode(node: WorkflowNode, details: NodeTypeDetails): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Apply preference-based validation rules
    const validationRules = workflowPreferencesService.getValidationRules(node.type);

    // AI/LLM nodes: Check if prompt is required by preferences
    if (validationRules.mustHavePrompt) {
      const promptIssue = this.ensureRequiredField(
        node,
        details,
        ['prompt', 'text', 'message', 'input', 'systemMessage'],
        'AI prompt',
        validationRules.promptMinLength
      );
      if (promptIssue) {
        issues.push(promptIssue);
      }
    }

    // Slack nodes: Check if channel is required by preferences
    if (validationRules.mustHaveChannel) {
      const channelIssue = this.ensureRequiredField(
        node,
        details,
        ['channel'],
        'Slack channel',
        1
      );
      if (channelIssue) {
        issues.push(channelIssue);
      }
    }

    // Google Sheets - format documentId properly
    if (node.type === 'n8n-nodes-base.googleSheets') {
      const sheetsIssue = this.correctGoogleSheetsParams(node);
      if (sheetsIssue) {
        issues.push(sheetsIssue);
      }
    }

    // Validate all parameters against node type details
    for (const prop of details.properties || []) {
      if (!node.parameters.hasOwnProperty(prop.name)) {
        continue;
      }

      const value = node.parameters[prop.name];

      // Check if value is valid for option/enum fields
      if (prop.options && prop.options.length > 0) {
        const validValues = prop.options.map(o => o.value);
        const issue = this.correctOptionValue(node, prop, value, validValues);
        if (issue) {
          issues.push(issue);
        }
      }

      // Check required fields
      if (prop.required && (value === undefined || value === null || value === '')) {
        issues.push({
          node: node.name,
          field: prop.name,
          issue: `Required field "${prop.displayName}" is missing`,
          fix: `Set to default value: ${JSON.stringify(prop.default)}`,
          severity: 'error',
        });

        if (prop.default !== undefined) {
          node.parameters[prop.name] = prop.default;
        }
      }
    }

    return issues;
  }

  /**
   * Generic method to ensure a required field exists
   * Works with any node type based on preferences and MCP data
   */
  private ensureRequiredField(
    node: WorkflowNode,
    details: NodeTypeDetails,
    fieldNames: string[],
    displayName: string,
    minLength?: number
  ): ValidationIssue | null {
    // Check if any of the field names exist and have a value
    const hasValue = fieldNames.some(field => {
      const value = node.parameters[field];
      if (!value) return false;
      if (typeof value === 'string') {
        return value.trim().length >= (minLength || 1);
      }
      return true;
    });

    if (hasValue) {
      return null;
    }

    // Find the appropriate field from node properties
    const matchingProp = details.properties?.find(p =>
      fieldNames.some(fn => fn.toLowerCase() === p.name.toLowerCase())
    );

    const fieldName = matchingProp?.name || fieldNames[0];

    // Generate a contextual value based on node name and type
    const contextualValue = this.generateContextualValue(
      node.name,
      node.type,
      fieldName,
      displayName
    );

    node.parameters[fieldName] = contextualValue;

    return {
      node: node.name,
      field: fieldName,
      issue: `${displayName} missing`,
      fix: `Added contextual value: "${contextualValue.slice(0, 50)}..."`,
      severity: 'warning',
    };
  }

  /**
   * Generate a contextual value for a missing field
   * This replaces hardcoded prompt/channel generation with something generic
   */
  private generateContextualValue(
    nodeName: string,
    nodeType: string,
    fieldName: string,
    displayName: string
  ): string {
    const lowerName = nodeName.toLowerCase();

    // For prompt-like fields
    if (['prompt', 'text', 'message', 'input'].includes(fieldName.toLowerCase())) {
      if (lowerName.includes('summar')) {
        return 'Please provide a concise summary of the input data, highlighting key points.';
      }
      if (lowerName.includes('email')) {
        return 'Analyze the email content and extract main topics and action items.';
      }
      if (lowerName.includes('report')) {
        return 'Generate a comprehensive report based on the provided data.';
      }
      if (lowerName.includes('analyz') || lowerName.includes('analyse')) {
        return 'Analyze the input data and provide insights and conclusions.';
      }
      return 'Process the input data and provide a relevant response.';
    }

    // For channel-like fields
    if (fieldName.toLowerCase() === 'channel') {
      const slackPrefs = workflowPreferencesService.getSlackPreferences();
      return slackPrefs?.fallbackChannel || '#general';
    }

    // Generic fallback
    return `Generated ${displayName}`;
  }


  /**
   * Correct Google Sheets parameters to use URL mode when ID is provided
   */
  private correctGoogleSheetsParams(node: WorkflowNode): ValidationIssue | null {
    // Check if using documentId with a raw ID
    const docId = node.parameters.documentId;

    if (!docId) {
      return null;
    }

    // If it's already an object with mode, it's properly formatted
    if (typeof docId === 'object' && docId.mode) {
      return null;
    }

    // If it's a string ID, convert to proper format
    if (typeof docId === 'string') {
      // Check if it looks like a spreadsheet ID (not a full URL)
      if (!docId.includes('://') && !docId.includes('spreadsheets/d/')) {
        // Keep as ID but structure it properly
        node.parameters.documentId = {
          __rl: true,
          mode: 'id',
          value: docId,
        };

        return {
          node: node.name,
          field: 'documentId',
          issue: 'Spreadsheet ID should be structured for n8n resource locator',
          fix: 'Converted to proper resource locator format',
          severity: 'warning',
        };
      }
    }

    return null;
  }


  /**
   * Correct an option/enum value to match valid options
   */
  private correctOptionValue(
    node: WorkflowNode,
    prop: NodeProperty,
    value: any,
    validValues: any[]
  ): ValidationIssue | null {
    if (validValues.includes(value)) {
      return null; // Value is valid
    }

    // Try to find a matching valid value
    const correctedValue = this.findBestMatch(value, validValues, prop.options || []);

    if (correctedValue === null) {
      return {
        node: node.name,
        field: prop.name,
        issue: `Invalid value "${value}" for ${prop.displayName}`,
        fix: `Valid options are: ${validValues.join(', ')}`,
        severity: 'warning',
      };
    }

    // Apply the correction
    node.parameters[prop.name] = correctedValue;

    return {
      node: node.name,
      field: prop.name,
      issue: `Invalid value "${value}" for ${prop.displayName}`,
      fix: `Auto-corrected to: "${correctedValue}"`,
      severity: 'warning',
    };
  }

  /**
   * Find the best matching valid value
   */
  private findBestMatch(
    invalidValue: any,
    validValues: any[],
    options: Array<{ name: string; value: string }>
  ): any | null {
    const invalidStr = String(invalidValue).toLowerCase();

    // Try exact case-insensitive match
    for (const valid of validValues) {
      if (String(valid).toLowerCase() === invalidStr) {
        return valid;
      }
    }

    // Try matching against option names (display names)
    for (const opt of options) {
      if (opt.name.toLowerCase() === invalidStr ||
          opt.name.toLowerCase().replace(/\s+/g, '') === invalidStr.replace(/\s+/g, '')) {
        return opt.value;
      }
    }

    // Try partial match
    for (const valid of validValues) {
      const validStr = String(valid).toLowerCase();
      if (validStr.includes(invalidStr) || invalidStr.includes(validStr)) {
        return valid;
      }
    }

    // Try matching option names partially
    for (const opt of options) {
      const optName = opt.name.toLowerCase();
      if (optName.includes(invalidStr) || invalidStr.includes(optName.replace(/\s+/g, ''))) {
        return opt.value;
      }
    }

    return null;
  }
}

export const workflowValidatorService = new WorkflowValidatorService();
