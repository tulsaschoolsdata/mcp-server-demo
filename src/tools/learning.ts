import {
  Contribution,
  Pattern,
  Template,
  Snippet,
} from '../types.js';
import { ContributionEngine } from '../engines/ContributionEngine.js';
import { CodeAnalyzer } from '../engines/CodeAnalyzer.js';

// Types
export interface AnalyzeImplementationInput {
  projectPath: string;
  changedFiles?: string[];
}

export interface ProposeContributionInput {
  type: 'pattern' | 'template' | 'snippet';
  content: Pattern | Template | Snippet;
}

export interface ListPendingContributionsInput {
  type?: 'all' | 'pattern' | 'template' | 'snippet';
}

export interface GetContributionInput {
  contributionId: string;
}

export interface ApproveContributionInput {
  contributionId: string;
  reviewNotes?: string;
}

export interface RejectContributionInput {
  contributionId: string;
  reason: string;
}

/**
 * Learning tools for managing contributions
 */
export class LearningTools {
  private contributionEngine: ContributionEngine;
  private codeAnalyzer: CodeAnalyzer;

  constructor(libraryPath: string) {
    this.contributionEngine = new ContributionEngine(libraryPath);
    this.codeAnalyzer = new CodeAnalyzer();
  }

  /**
   * Initialize the learning engine
   */
  async initialize(): Promise<void> {
    await this.contributionEngine.initialize();
  }

  /**
   * Analyze implementation and propose contributions
   */
  async analyzeImplementation(input: AnalyzeImplementationInput): Promise<{
    success: boolean;
    proposedContributions?: Array<{
      id: string;
      type: string;
      name: string;
      description: string;
      confidence: number;
    }>;
    error?: string;
  }> {
    try {
      const result = await this.codeAnalyzer.analyzeCodebase(input.projectPath);
      const contributions = await this.contributionEngine.proposeFromAnalysis(result);

      return {
        success: true,
        proposedContributions: contributions.map((c) => ({
          id: c.id,
          type: c.type,
          name: this.getContentName(c),
          description: this.getContentDescription(c),
          confidence: c.metadata.qualityScore || 0,
        })),
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Get name from contribution content
   */
  private getContentName(contribution: Contribution): string {
    const content = contribution.content as Pattern | Template | Snippet;
    return content.name || contribution.id;
  }

  /**
   * Get description from contribution content
   */
  private getContentDescription(contribution: Contribution): string {
    const content = contribution.content as Pattern | Template | Snippet;
    return content.description || '';
  }

  /**
   * Propose a manual contribution
   */
  async proposeContribution(input: ProposeContributionInput): Promise<{
    success: boolean;
    contributionId?: string;
    error?: string;
  }> {
    try {
      const contribution = await this.contributionEngine.proposeManual(
        input.type,
        input.content
      );

      return {
        success: true,
        contributionId: contribution.id,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * List pending contributions
   */
  async listPendingContributions(input: ListPendingContributionsInput): Promise<{
    success: boolean;
    contributions?: Array<{
      id: string;
      type: string;
      name: string;
      status: string;
      createdAt: string;
      source: string;
      qualityScore?: number;
    }>;
    error?: string;
  }> {
    try {
      let contributions = await this.contributionEngine.listPending();

      if (input.type && input.type !== 'all') {
        contributions = contributions.filter((c) => c.type === input.type);
      }

      return {
        success: true,
        contributions: contributions.map((c) => ({
          id: c.id,
          type: c.type,
          name: this.getContentName(c),
          status: c.status,
          createdAt: c.createdAt.toString(),
          source: c.source.type,
          qualityScore: c.metadata.qualityScore,
        })),
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Get a specific contribution
   */
  async getContribution(input: GetContributionInput): Promise<{
    success: boolean;
    contribution?: {
      id: string;
      type: string;
      status: string;
      content: unknown;
      source: {
        type: string;
        projectPath?: string;
        files: string[];
      };
      metadata: {
        extractedFrom: string;
        similarity?: number;
        usageCount?: number;
        qualityScore?: number;
      };
      createdAt: string;
      reviewedAt?: string;
      reviewNotes?: string;
    };
    error?: string;
  }> {
    try {
      const contribution = await this.contributionEngine.getContribution(
        input.contributionId
      );

      if (!contribution) {
        return {
          success: false,
          error: 'Contribution not found',
        };
      }

      return {
        success: true,
        contribution: {
          id: contribution.id,
          type: contribution.type,
          status: contribution.status,
          content: contribution.content,
          source: contribution.source,
          metadata: contribution.metadata,
          createdAt: contribution.createdAt.toString(),
          reviewedAt: contribution.reviewedAt?.toString(),
          reviewNotes: contribution.reviewNotes,
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Approve a contribution
   */
  async approveContribution(input: ApproveContributionInput): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const result = await this.contributionEngine.approveContribution(
      input.contributionId,
      input.reviewNotes
    );

    if (result.success) {
      return {
        success: true,
        message: `Contribution ${input.contributionId} approved and added to library`,
      };
    }

    return {
      success: false,
      error: result.error,
    };
  }

  /**
   * Reject a contribution
   */
  async rejectContribution(input: RejectContributionInput): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const result = await this.contributionEngine.rejectContribution(
      input.contributionId,
      input.reason
    );

    if (result.success) {
      return {
        success: true,
        message: `Contribution ${input.contributionId} rejected`,
      };
    }

    return {
      success: false,
      error: result.error,
    };
  }

  /**
   * Get contribution statistics
   */
  async getContributionStats(): Promise<{
    success: boolean;
    stats?: {
      pending: number;
      approved: number;
      rejected: number;
      byType: Record<string, number>;
    };
    error?: string;
  }> {
    try {
      const stats = await this.contributionEngine.getStatistics();

      return {
        success: true,
        stats,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Get tool definitions for MCP registration
   */
  static getToolDefinitions() {
    return [
      {
        name: 'analyze_implementation',
        description: 'Analyze a completed implementation and propose new patterns/templates/snippets for the library',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Path to the project' },
            changedFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of changed files to focus on',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'propose_contribution',
        description: 'Propose a new pattern, template, or snippet for the library',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['pattern', 'template', 'snippet'],
              description: 'Type of contribution',
            },
            content: {
              type: 'object',
              description: 'Content of the contribution',
            },
          },
          required: ['type', 'content'],
        },
      },
      {
        name: 'review_contributions',
        description: 'List pending contributions for review',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['all', 'pattern', 'template', 'snippet'],
              description: 'Filter by type',
            },
          },
        },
      },
      {
        name: 'get_contribution',
        description: 'Get details of a specific contribution',
        inputSchema: {
          type: 'object',
          properties: {
            contributionId: { type: 'string', description: 'Contribution ID' },
          },
          required: ['contributionId'],
        },
      },
      {
        name: 'approve_contribution',
        description: 'Approve a contribution and add it to the library',
        inputSchema: {
          type: 'object',
          properties: {
            contributionId: { type: 'string', description: 'Contribution ID' },
            reviewNotes: { type: 'string', description: 'Review notes' },
          },
          required: ['contributionId'],
        },
      },
      {
        name: 'reject_contribution',
        description: 'Reject a contribution',
        inputSchema: {
          type: 'object',
          properties: {
            contributionId: { type: 'string', description: 'Contribution ID' },
            reason: { type: 'string', description: 'Reason for rejection' },
          },
          required: ['contributionId', 'reason'],
        },
      },
      {
        name: 'contribution_stats',
        description: 'Get statistics about contributions',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }
}
