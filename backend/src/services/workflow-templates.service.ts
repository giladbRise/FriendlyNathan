/**
 * Workflow Templates Service
 * Provides pre-built workflow templates for common use cases
 * Templates are universal and work for all organizations
 */

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  descriptionTemplate: string;
  fillableFields: TemplateField[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  requiredCredentials: string[];
  tags: string[];
  preview: {
    nodes: string[];
    explanation: string;
  };
}

export interface TemplateField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'slack-channel' | 'number' | 'select';
  placeholder: string;
  required: boolean;
  options?: string[];
  validation?: string; // regex pattern
}

class WorkflowTemplatesService {
  private templates: WorkflowTemplate[] = [
    // EMAIL AUTOMATION
    {
      id: 'email-summary-slack',
      name: 'Email Summary to Slack',
      category: 'Email Automation',
      description: 'Get emails from a specific sender, summarize them with AI, and send the summary to Slack',
      descriptionTemplate: 'Get emails from {sender} in the last {days} days, summarize them using Gemini, and send the summary to Slack channel {channel}',
      fillableFields: [
        { name: 'sender', label: 'Sender Email/Name', type: 'text', placeholder: 'john@example.com or "John Doe"', required: true },
        { name: 'days', label: 'Number of Days', type: 'number', placeholder: '7', required: true },
        { name: 'channel', label: 'Slack Channel', type: 'slack-channel', placeholder: '#general or C0A1CEBJWJF', required: true }
      ],
      difficulty: 'beginner',
      estimatedTime: '2 minutes',
      requiredCredentials: ['Gmail', 'Slack', 'Google Gemini'],
      tags: ['email', 'slack', 'ai', 'summarization'],
      preview: {
        nodes: ['Manual Trigger', 'Gmail: Get Emails', 'Edit Fields', 'Basic LLM Chain', 'Google Gemini', 'Slack: Send Message'],
        explanation: 'Fetches emails → Formats for AI → Summarizes content → Sends to Slack'
      }
    },
    {
      id: 'email-to-spreadsheet',
      name: 'Emails to Spreadsheet',
      category: 'Email Automation',
      description: 'Track emails in a Google Spreadsheet for record keeping',
      descriptionTemplate: 'Get emails from {sender} in the last {days} days and save sender, subject, and date to Google Sheet {spreadsheet}',
      fillableFields: [
        { name: 'sender', label: 'Sender Email/Name', type: 'text', placeholder: 'john@example.com or leave empty for all', required: false },
        { name: 'days', label: 'Number of Days', type: 'number', placeholder: '7', required: true },
        { name: 'spreadsheet', label: 'Google Sheet URL/ID', type: 'url', placeholder: 'Spreadsheet URL or ID', required: true }
      ],
      difficulty: 'beginner',
      estimatedTime: '2 minutes',
      requiredCredentials: ['Gmail', 'Google Sheets'],
      tags: ['email', 'spreadsheet', 'tracking'],
      preview: {
        nodes: ['Manual Trigger', 'Gmail: Get Emails', 'Edit Fields', 'Google Sheets: Append'],
        explanation: 'Fetches emails → Extracts key fields → Saves to spreadsheet'
      }
    },

    // DATA COLLECTION
    {
      id: 'webhook-to-slack',
      name: 'Webhook to Slack Alert',
      category: 'Data Collection',
      description: 'Receive webhook data and send alerts to Slack',
      descriptionTemplate: 'When webhook is called at {path}, send the data to Slack channel {channel}',
      fillableFields: [
        { name: 'path', label: 'Webhook Path', type: 'text', placeholder: '/webhook or /alert', required: true },
        { name: 'channel', label: 'Slack Channel', type: 'slack-channel', placeholder: '#alerts', required: true }
      ],
      difficulty: 'beginner',
      estimatedTime: '1 minute',
      requiredCredentials: ['Slack'],
      tags: ['webhook', 'slack', 'alerts'],
      preview: {
        nodes: ['Webhook Trigger', 'Edit Fields', 'Slack: Send Message'],
        explanation: 'Receives webhook → Formats message → Posts to Slack'
      }
    },
    {
      id: 'form-to-spreadsheet',
      name: 'Form Submissions to Sheet',
      category: 'Data Collection',
      description: 'Save form submissions from webhooks to Google Sheets',
      descriptionTemplate: 'When form is submitted to webhook {path}, save the data to Google Sheet {spreadsheet}',
      fillableFields: [
        { name: 'path', label: 'Webhook Path', type: 'text', placeholder: '/form-submit', required: true },
        { name: 'spreadsheet', label: 'Google Sheet URL/ID', type: 'url', placeholder: 'Spreadsheet URL or ID', required: true }
      ],
      difficulty: 'beginner',
      estimatedTime: '2 minutes',
      requiredCredentials: ['Google Sheets'],
      tags: ['form', 'spreadsheet', 'webhook'],
      preview: {
        nodes: ['Webhook Trigger', 'Edit Fields', 'Google Sheets: Append'],
        explanation: 'Receives form data → Formats fields → Appends to sheet'
      }
    },

    // REPORTING
    {
      id: 'daily-report-email',
      name: 'Daily Report via Email',
      category: 'Reporting',
      description: 'Fetch data daily and email a report',
      descriptionTemplate: 'Every day at {time}, fetch data from {source}, analyze it with Gemini, and email a report to {email}',
      fillableFields: [
        { name: 'time', label: 'Time (24h format)', type: 'text', placeholder: '09:00', required: true, validation: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' },
        { name: 'source', label: 'Data Source URL', type: 'url', placeholder: 'https://api.example.com/data', required: true },
        { name: 'email', label: 'Recipient Email', type: 'email', placeholder: 'reports@example.com', required: true }
      ],
      difficulty: 'intermediate',
      estimatedTime: '3 minutes',
      requiredCredentials: ['Email Send', 'Google Gemini'],
      tags: ['schedule', 'reporting', 'email', 'ai'],
      preview: {
        nodes: ['Schedule Trigger', 'HTTP Request', 'Edit Fields', 'Basic LLM Chain', 'Google Gemini', 'Email Send'],
        explanation: 'Runs daily → Fetches data → AI analyzes → Sends email report'
      }
    },

    // MONITORING
    {
      id: 'api-monitor-alert',
      name: 'API Monitor & Alert',
      category: 'Monitoring',
      description: 'Monitor an API endpoint and alert on specific conditions',
      descriptionTemplate: 'Check {url} every {interval} minutes, if {condition}, send alert to Slack {channel}',
      fillableFields: [
        { name: 'url', label: 'API Endpoint', type: 'url', placeholder: 'https://api.example.com/status', required: true },
        { name: 'interval', label: 'Check Interval (minutes)', type: 'number', placeholder: '5', required: true },
        { name: 'condition', label: 'Alert Condition', type: 'text', placeholder: 'status is not "ok"', required: true },
        { name: 'channel', label: 'Alert Channel', type: 'slack-channel', placeholder: '#alerts', required: true }
      ],
      difficulty: 'intermediate',
      estimatedTime: '3 minutes',
      requiredCredentials: ['Slack'],
      tags: ['monitoring', 'api', 'slack', 'alerts'],
      preview: {
        nodes: ['Schedule Trigger', 'HTTP Request', 'Filter', 'Slack: Send Message'],
        explanation: 'Checks API periodically → Filters by condition → Alerts if matched'
      }
    },

    // AI PROCESSING
    {
      id: 'content-analyzer',
      name: 'Content Analyzer',
      category: 'AI Processing',
      description: 'Analyze content with AI and save results',
      descriptionTemplate: 'Get content from {source}, analyze with Gemini to {task}, and save results to {destination}',
      fillableFields: [
        { name: 'source', label: 'Content Source', type: 'select', placeholder: '', required: true, options: ['Gmail', 'Webhook', 'HTTP API', 'Google Sheets'] },
        { name: 'task', label: 'AI Task', type: 'select', placeholder: '', required: true, options: ['Summarize', 'Extract key points', 'Classify sentiment', 'Generate response'] },
        { name: 'destination', label: 'Save Results To', type: 'select', placeholder: '', required: true, options: ['Slack', 'Google Sheets', 'Email'] }
      ],
      difficulty: 'intermediate',
      estimatedTime: '3 minutes',
      requiredCredentials: ['Google Gemini'],
      tags: ['ai', 'analysis', 'processing'],
      preview: {
        nodes: ['Source Node', 'Edit Fields', 'Basic LLM Chain', 'Google Gemini', 'Destination Node'],
        explanation: 'Fetches content → AI processes → Saves results'
      }
    },

    // DATA SYNC
    {
      id: 'sheet-to-database',
      name: 'Spreadsheet to Database Sync',
      category: 'Data Sync',
      description: 'Sync Google Sheets data to a database',
      descriptionTemplate: 'Every {interval} minutes, read new rows from Google Sheet {spreadsheet} and insert into database {table}',
      fillableFields: [
        { name: 'interval', label: 'Sync Interval (minutes)', type: 'number', placeholder: '15', required: true },
        { name: 'spreadsheet', label: 'Google Sheet URL/ID', type: 'url', placeholder: 'Spreadsheet URL or ID', required: true },
        { name: 'table', label: 'Database Table Name', type: 'text', placeholder: 'users', required: true }
      ],
      difficulty: 'advanced',
      estimatedTime: '5 minutes',
      requiredCredentials: ['Google Sheets', 'PostgreSQL'],
      tags: ['sync', 'database', 'spreadsheet', 'schedule'],
      preview: {
        nodes: ['Schedule Trigger', 'Google Sheets: Read', 'Filter', 'Postgres: Insert'],
        explanation: 'Runs periodically → Reads new rows → Filters → Inserts to database'
      }
    },

    // NOTIFICATION
    {
      id: 'slack-daily-reminder',
      name: 'Daily Slack Reminder',
      category: 'Notifications',
      description: 'Send a daily reminder message to Slack',
      descriptionTemplate: 'Every day at {time}, send message "{message}" to Slack channel {channel}',
      fillableFields: [
        { name: 'time', label: 'Time (24h format)', type: 'text', placeholder: '09:00', required: true, validation: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' },
        { name: 'message', label: 'Reminder Message', type: 'text', placeholder: 'Time for standup!', required: true },
        { name: 'channel', label: 'Slack Channel', type: 'slack-channel', placeholder: '#team', required: true }
      ],
      difficulty: 'beginner',
      estimatedTime: '1 minute',
      requiredCredentials: ['Slack'],
      tags: ['notification', 'slack', 'schedule', 'reminder'],
      preview: {
        nodes: ['Schedule Trigger', 'Slack: Send Message'],
        explanation: 'Runs daily at specified time → Sends reminder to Slack'
      }
    },

    // AUTOMATION
    {
      id: 'auto-email-reply',
      name: 'Automated Email Response',
      category: 'Email Automation',
      description: 'Auto-reply to emails with AI-generated responses',
      descriptionTemplate: 'When I receive an email with subject containing "{keyword}", generate a response with Gemini and reply',
      fillableFields: [
        { name: 'keyword', label: 'Subject Keyword', type: 'text', placeholder: 'support', required: true }
      ],
      difficulty: 'advanced',
      estimatedTime: '4 minutes',
      requiredCredentials: ['Gmail', 'Google Gemini'],
      tags: ['email', 'automation', 'ai', 'response'],
      preview: {
        nodes: ['Email Trigger', 'Filter', 'Edit Fields', 'Basic LLM Chain', 'Google Gemini', 'Gmail: Reply'],
        explanation: 'Monitors emails → Filters by keyword → AI generates reply → Sends response'
      }
    }
  ];

  /**
   * Get all templates
   */
  getAllTemplates(): WorkflowTemplate[] {
    return this.templates;
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return this.templates.filter(t => t.category === category);
  }

  /**
   * Get template by ID
   */
  getTemplateById(id: string): WorkflowTemplate | null {
    return this.templates.find(t => t.id === id) || null;
  }

  /**
   * Get all unique categories
   */
  getCategories(): string[] {
    const categories = new Set(this.templates.map(t => t.category));
    return Array.from(categories).sort();
  }

  /**
   * Search templates by keyword
   */
  searchTemplates(keyword: string): WorkflowTemplate[] {
    const lower = keyword.toLowerCase();
    return this.templates.filter(t =>
      t.name.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.tags.some(tag => tag.includes(lower))
    );
  }

  /**
   * Fill template with user values
   */
  fillTemplate(templateId: string, values: Record<string, string>): string {
    const template = this.getTemplateById(templateId);
    if (!template) return '';

    let description = template.descriptionTemplate;
    for (const [key, value] of Object.entries(values)) {
      description = description.replace(`{${key}}`, value);
    }

    return description;
  }

  /**
   * Validate template field values
   */
  validateFields(templateId: string, values: Record<string, string>): { valid: boolean; errors: Record<string, string> } {
    const template = this.getTemplateById(templateId);
    if (!template) return { valid: false, errors: { template: 'Template not found' } };

    const errors: Record<string, string> = {};

    for (const field of template.fillableFields) {
      const value = values[field.name];

      // Check required
      if (field.required && (!value || value.trim() === '')) {
        errors[field.name] = `${field.label} is required`;
        continue;
      }

      // Check validation pattern
      if (value && field.validation) {
        const regex = new RegExp(field.validation);
        if (!regex.test(value)) {
          errors[field.name] = `${field.label} format is invalid`;
        }
      }

      // Type-specific validation
      if (value) {
        switch (field.type) {
          case 'email':
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              errors[field.name] = 'Invalid email format';
            }
            break;
          case 'url':
            if (!value.startsWith('http://') && !value.startsWith('https://') && !value.includes('.')) {
              errors[field.name] = 'Invalid URL format';
            }
            break;
          case 'number':
            if (isNaN(Number(value)) || Number(value) <= 0) {
              errors[field.name] = 'Must be a positive number';
            }
            break;
        }
      }
    }

    return { valid: Object.keys(errors).length === 0, errors };
  }
}

export const workflowTemplatesService = new WorkflowTemplatesService();
