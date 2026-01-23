import fs from 'fs';
import path from 'path';

interface NodePreference {
  preferredNode: string;
  preferredModel?: string;
  displayAs?: string;
  defaultOperation?: string;
  defaultResource?: string;
  fallbackChannel?: string;
  alternative?: string;
}

interface SmartDefaultPattern {
  propertyName?: string;
  propertyType?: string;
  nodeType?: string;
  extractFromDescription?: string;
  fallback?: string;
  contextualDefault?: string;
  defaultStrategy?: string;
}

interface WorkflowPreferences {
  version: string;
  nodePreferences: {
    ai?: {
      default: string;
      alternatives: string[];
      operations: Record<string, NodePreference>;
    };
    communication?: {
      slack?: NodePreference;
      email?: NodePreference;
    };
    storage?: {
      spreadsheet?: NodePreference;
    };
  };
  smartDefaults: {
    patterns: SmartDefaultPattern[];
  };
  validationRules: {
    required: {
      aiNodes?: {
        mustHavePrompt: boolean;
        promptMinLength: number;
      };
      slackNodes?: {
        mustHaveChannel: boolean;
        extractChannelFromDescription: boolean;
      };
    };
    corrections: {
      autoCorrectCasing: boolean;
      fuzzyMatchThreshold: number;
      learnFromCorrections: boolean;
    };
  };
  userGuidance: Record<string, string>;
}

/**
 * Workflow Preferences Service
 * Manages organization-wide preferences and best practices for workflow generation
 * This allows customization without hardcoding node-specific logic
 */
class WorkflowPreferencesService {
  private preferences: WorkflowPreferences;
  private preferencesPath: string;

  constructor() {
    this.preferencesPath = path.join(process.cwd(), 'src', 'config', 'workflow-preferences.json');
    this.preferences = this.loadPreferences();
  }

  private loadPreferences(): WorkflowPreferences {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const content = fs.readFileSync(this.preferencesPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn('Failed to load workflow preferences, using defaults:', error);
    }

    // Fallback defaults if file doesn't exist
    return {
      version: '1.0',
      nodePreferences: {
        ai: {
          default: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
          alternatives: ['n8n-nodes-base.openAi'],
          operations: {
            chat: {
              preferredNode: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
              displayAs: 'Google Gemini',
            },
          },
        },
      },
      smartDefaults: { patterns: [] },
      validationRules: {
        required: {},
        corrections: {
          autoCorrectCasing: true,
          fuzzyMatchThreshold: 0.7,
          learnFromCorrections: true,
        },
      },
      userGuidance: {},
    };
  }

  /**
   * Get preferred AI node for a given task
   */
  getPreferredAINode(task: 'chat' | 'summarize' | 'textGeneration' = 'chat'): {
    nodeType: string;
    displayName: string;
    defaultModel?: string;
  } {
    const aiPrefs = this.preferences.nodePreferences.ai;
    if (!aiPrefs) {
      return {
        nodeType: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
        displayName: 'Google Gemini',
      };
    }

    const operation = aiPrefs.operations[task];
    if (operation) {
      return {
        nodeType: operation.preferredNode,
        displayName: operation.displayAs || operation.preferredNode,
        defaultModel: operation.preferredModel,
      };
    }

    return {
      nodeType: aiPrefs.default,
      displayName: 'AI Model',
    };
  }

  /**
   * Check if a node type is an AI/LLM node based on preferences
   */
  isAINode(nodeType: string): boolean {
    const aiPrefs = this.preferences.nodePreferences.ai;
    if (!aiPrefs) return false;

    // Check if it's the default or an alternative
    if (nodeType === aiPrefs.default) return true;
    if (aiPrefs.alternatives.includes(nodeType)) return true;

    // Check if it's in any operation
    for (const operation of Object.values(aiPrefs.operations)) {
      if (operation.preferredNode === nodeType) return true;
    }

    return false;
  }

  /**
   * Get preferred Slack configuration
   */
  getSlackPreferences(): NodePreference | null {
    return this.preferences.nodePreferences.communication?.slack || null;
  }

  /**
   * Extract smart default for a parameter based on patterns
   */
  getSmartDefault(
    propertyName: string,
    propertyType: string,
    nodeType: string,
    description?: string
  ): any | null {
    const patterns = this.preferences.smartDefaults.patterns;

    for (const pattern of patterns) {
      // Check if pattern matches
      const nameMatch = !pattern.propertyName || pattern.propertyName === propertyName;
      const typeMatch = !pattern.propertyType || pattern.propertyType === propertyType;
      const nodeMatch = !pattern.nodeType || pattern.nodeType === nodeType;

      if (nameMatch && typeMatch && nodeMatch) {
        // Try to extract from description if pattern provided
        if (pattern.extractFromDescription && description) {
          const regex = new RegExp(pattern.extractFromDescription, 'i');
          const match = description.match(regex);
          if (match) {
            return match[0];
          }
        }

        // Return fallback
        if (pattern.fallback) {
          return pattern.fallback;
        }

        // Return contextual default marker
        if (pattern.contextualDefault) {
          return null; // Signal that contextual generation is needed
        }
      }
    }

    return null;
  }

  /**
   * Get validation rules for a specific node type
   */
  getValidationRules(nodeType: string): {
    mustHavePrompt?: boolean;
    promptMinLength?: number;
    mustHaveChannel?: boolean;
    extractChannelFromDescription?: boolean;
  } {
    const rules: any = {};

    // Check AI node rules
    if (this.isAINode(nodeType)) {
      const aiRules = this.preferences.validationRules.required.aiNodes;
      if (aiRules) {
        rules.mustHavePrompt = aiRules.mustHavePrompt;
        rules.promptMinLength = aiRules.promptMinLength;
      }
    }

    // Check Slack node rules
    if (nodeType === 'n8n-nodes-base.slack') {
      const slackRules = this.preferences.validationRules.required.slackNodes;
      if (slackRules) {
        rules.mustHaveChannel = slackRules.mustHaveChannel;
        rules.extractChannelFromDescription = slackRules.extractChannelFromDescription;
      }
    }

    return rules;
  }

  /**
   * Get user guidance message for a specific scenario
   */
  getUserGuidance(scenario: string): string | null {
    return this.preferences.userGuidance[scenario] || null;
  }

  /**
   * Get correction settings
   */
  getCorrectionSettings() {
    return this.preferences.validationRules.corrections;
  }

  /**
   * Get preferred node for a task type
   */
  getPreferredNode(category: string, subcategory?: string): string | null {
    const prefs = this.preferences.nodePreferences as any;
    if (!prefs[category]) return null;

    if (subcategory) {
      return prefs[category][subcategory]?.preferredNode || null;
    }

    return prefs[category].default || null;
  }

  /**
   * Update preferences programmatically (for admin interface)
   */
  updatePreferences(updates: Partial<WorkflowPreferences>): void {
    this.preferences = { ...this.preferences, ...updates };
    try {
      fs.writeFileSync(
        this.preferencesPath,
        JSON.stringify(this.preferences, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }

  /**
   * Get all preferences (for admin UI)
   */
  getAllPreferences(): WorkflowPreferences {
    return this.preferences;
  }
}

export const workflowPreferencesService = new WorkflowPreferencesService();
