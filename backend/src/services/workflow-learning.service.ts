import fs from 'fs';
import path from 'path';

interface LearningPattern {
  id: string;
  issuePattern: string;
  fixApplied: string;
  description: string;
  nodeTypes: string[];
  count: number;
  lastSeen: Date;
  createdAt: Date;
}

interface LearningData {
  patterns: LearningPattern[];
  version: string;
}

/**
 * Workflow Learning Service
 * Stores and retrieves common workflow issues and their fixes
 * to improve future workflow generation
 */
class WorkflowLearningService {
  private learningFilePath: string;
  private data: LearningData;

  constructor() {
    this.learningFilePath = path.join(process.cwd(), 'workflow-learning.json');
    this.data = this.loadData();
  }

  private loadData(): LearningData {
    try {
      if (fs.existsSync(this.learningFilePath)) {
        const content = fs.readFileSync(this.learningFilePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn('Failed to load learning data, starting fresh:', error);
    }

    return {
      patterns: [],
      version: '1.0',
    };
  }

  private saveData(): void {
    try {
      fs.writeFileSync(this.learningFilePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save learning data:', error);
    }
  }

  /**
   * Record a new learning pattern from workflow fixes
   */
  recordLearning(issue: string, fix: string, description: string, nodeTypes: string[]): void {
    // Create a simple pattern key based on issue
    const patternKey = this.createPatternKey(issue, nodeTypes);

    // Check if we already have this pattern
    const existing = this.data.patterns.find((p) => p.id === patternKey);

    if (existing) {
      // Update existing pattern
      existing.count++;
      existing.lastSeen = new Date();
      existing.fixApplied = fix; // Update with latest fix
    } else {
      // Create new pattern
      this.data.patterns.push({
        id: patternKey,
        issuePattern: issue,
        fixApplied: fix,
        description,
        nodeTypes,
        count: 1,
        lastSeen: new Date(),
        createdAt: new Date(),
      });
    }

    this.saveData();
  }

  /**
   * Get relevant learning patterns for a workflow generation
   */
  getRelevantPatterns(description: string, nodeTypes: string[]): LearningPattern[] {
    const descLower = description.toLowerCase();

    return this.data.patterns
      .filter((pattern) => {
        // Check if any of the pattern's node types are in the current request
        const hasMatchingNodeType = pattern.nodeTypes.some((nt) =>
          nodeTypes.some((requestNt) => requestNt.includes(nt) || nt.includes(requestNt))
        );

        // Check if issue pattern keywords appear in description
        const keywords = pattern.issuePattern.toLowerCase().split(' ').slice(0, 5);
        const hasMatchingKeyword = keywords.some((kw) => descLower.includes(kw));

        return hasMatchingNodeType || hasMatchingKeyword;
      })
      .sort((a, b) => b.count - a.count) // Sort by frequency
      .slice(0, 10); // Return top 10 most relevant
  }

  /**
   * Get common learnings as guidance text
   */
  getCommonLearningsGuidance(): string {
    if (this.data.patterns.length === 0) {
      return '';
    }

    const topPatterns = this.data.patterns
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const guidance = topPatterns
      .map((p) => `- When ${p.issuePattern.toLowerCase()}, ${p.fixApplied.toLowerCase()}`)
      .join('\n');

    return `\nCommon Workflow Patterns Learned (apply these when relevant):\n${guidance}\n`;
  }

  /**
   * Create a unique pattern key
   */
  private createPatternKey(issue: string, nodeTypes: string[]): string {
    const issueKey = issue.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 50);
    const nodeKey = nodeTypes.join('_').replace(/[^a-z0-9_]/g, '').slice(0, 30);
    return `${issueKey}_${nodeKey}`;
  }

  /**
   * Get statistics about learning data
   */
  getStats(): { totalPatterns: number; totalLearnings: number; topIssues: string[] } {
    const totalLearnings = this.data.patterns.reduce((sum, p) => sum + p.count, 0);
    const topIssues = this.data.patterns
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((p) => `${p.issuePattern} (${p.count}x)`);

    return {
      totalPatterns: this.data.patterns.length,
      totalLearnings,
      topIssues,
    };
  }
}

export const workflowLearningService = new WorkflowLearningService();
