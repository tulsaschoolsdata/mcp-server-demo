import {
  Pattern,
  ProjectContext,
  WorkflowStep,
  WorkflowSummary,
  IntentMatch,
} from '../types.js';
import { WorkflowEngine } from '../engines/WorkflowEngine.js';
import { PatternMatcher } from '../engines/PatternMatcher.js';
import { CodeAnalyzer } from '../engines/CodeAnalyzer.js';
import { TemplateEngine } from '../engines/TemplateEngine.js';

// Types
export interface IdentifyIntentInput {
  prompt: string;
  projectPath?: string;
}

export interface StartWorkflowInput {
  patternId: string;
  projectPath: string;
}

export interface AnswerWorkflowStepInput {
  workflowId: string;
  stepId: string;
  answer: string | string[] | boolean;
}

export interface ExecuteWorkflowInput {
  workflowId: string;
  dryRun?: boolean;
}

export interface CancelWorkflowInput {
  workflowId: string;
}

/**
 * Workflow tools for managing guided code generation
 */
export class WorkflowTools {
  private workflowEngine: WorkflowEngine;
  private patternMatcher: PatternMatcher;
  private codeAnalyzer: CodeAnalyzer;
  private templateEngine: TemplateEngine;
  private patterns: Pattern[] = [];
  private libraryPath: string;

  constructor(libraryPath: string) {
    this.libraryPath = libraryPath;
    this.workflowEngine = new WorkflowEngine();
    this.patternMatcher = new PatternMatcher();
    this.codeAnalyzer = new CodeAnalyzer();
    this.templateEngine = new TemplateEngine(libraryPath);
  }

  /**
   * Load patterns from library
   */
  async loadPatterns(patterns: Pattern[]): Promise<void> {
    this.patterns = patterns;
    this.patternMatcher.loadPatterns(patterns);
  }

  /**
   * Identify intent from user prompt
   */
  async identifyIntent(input: IdentifyIntentInput): Promise<{
    matched: boolean;
    patternId?: string;
    patternName?: string;
    confidence?: number;
    alternatives?: Array<{ patternId: string; name: string; confidence: number }>;
    clarifyingQuestion?: {
      question: string;
      options: Array<{ patternId: string; label: string }>;
    };
    suggestions?: string[];
  }> {
    const match = this.patternMatcher.identifyIntent(input.prompt);

    if (!match) {
      // Suggest related patterns
      const suggestions = this.patternMatcher
        .searchPatterns(input.prompt, 3)
        .map((p) => p.name);

      return {
        matched: false,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
    }

    const pattern = this.patternMatcher.getPattern(match.patternId);

    // If confidence is low or there are alternatives, ask for clarification
    if (match.confidence < 0.7 && match.alternativePatterns) {
      const candidates: IntentMatch[] = [
        { patternId: match.patternId, confidence: match.confidence, matchedTriggers: match.matchedTriggers },
        ...match.alternativePatterns.map(alt => ({ ...alt, matchedTriggers: [] as string[] })),
      ];

      const clarifying = this.patternMatcher.generateClarifyingQuestions(
        input.prompt,
        candidates
      );

      return {
        matched: true,
        patternId: match.patternId,
        patternName: pattern?.name,
        confidence: match.confidence,
        clarifyingQuestion: clarifying,
      };
    }

    const alternatives = match.alternativePatterns?.map((alt) => {
      const p = this.patternMatcher.getPattern(alt.patternId);
      return {
        patternId: alt.patternId,
        name: p?.name || alt.patternId,
        confidence: alt.confidence,
      };
    });

    return {
      matched: true,
      patternId: match.patternId,
      patternName: pattern?.name,
      confidence: match.confidence,
      alternatives,
    };
  }

  /**
   * Start a workflow for a pattern
   */
  async startWorkflow(input: StartWorkflowInput): Promise<{
    success: boolean;
    workflowId?: string;
    patternName?: string;
    currentStep?: WorkflowStep;
    context?: {
      railsVersion?: string;
      reactVersion?: string;
      cssFramework?: string;
      modelCount: number;
      componentCount: number;
    };
    error?: string;
  }> {
    const pattern = this.patternMatcher.getPattern(input.patternId);

    if (!pattern) {
      return {
        success: false,
        error: `Pattern not found: ${input.patternId}`,
      };
    }

    // Detect project context
    const context = await this.codeAnalyzer.detectProjectContext(input.projectPath);

    // Start workflow
    const { workflowId, firstStep } = this.workflowEngine.startWorkflow(
      pattern,
      context
    );

    return {
      success: true,
      workflowId,
      patternName: pattern.name,
      currentStep: firstStep || undefined,
      context: {
        railsVersion: context.railsVersion,
        reactVersion: context.reactVersion,
        cssFramework: context.cssFramework,
        modelCount: context.models.length,
        componentCount: context.components.length,
      },
    };
  }

  /**
   * Answer a workflow step
   */
  async answerStep(input: AnswerWorkflowStepInput): Promise<{
    success: boolean;
    completed: boolean;
    nextStep?: WorkflowStep;
    summary?: WorkflowSummary;
    validationError?: string;
    error?: string;
  }> {
    const state = this.workflowEngine.getWorkflowState(input.workflowId);

    if (!state) {
      return {
        success: false,
        completed: false,
        error: 'Workflow not found',
      };
    }

    const pattern = this.patternMatcher.getPattern(state.patternId);

    if (!pattern) {
      return {
        success: false,
        completed: false,
        error: 'Pattern not found',
      };
    }

    const result = this.workflowEngine.answerStep(
      input.workflowId,
      pattern.workflow,
      input.stepId,
      input.answer
    );

    if (result.validationError) {
      return {
        success: false,
        completed: false,
        validationError: result.validationError,
      };
    }

    if (result.completed) {
      // Generate summary
      const templates = await this.getPatternTemplates(pattern);
      const summary = this.workflowEngine.generateSummary(
        input.workflowId,
        pattern,
        templates
      );

      return {
        success: true,
        completed: true,
        summary: summary || undefined,
      };
    }

    return {
      success: true,
      completed: false,
      nextStep: result.nextStep,
    };
  }

  /**
   * Get templates for a pattern
   */
  private async getPatternTemplates(pattern: Pattern): Promise<any[]> {
    // This would load templates from the library
    // For now, return empty array
    return [];
  }

  /**
   * Execute a completed workflow
   */
  async executeWorkflow(input: ExecuteWorkflowInput): Promise<{
    success: boolean;
    generatedFiles?: Array<{ path: string; content: string }>;
    instructions?: string[];
    error?: string;
  }> {
    const state = this.workflowEngine.getWorkflowState(input.workflowId);

    if (!state) {
      return {
        success: false,
        error: 'Workflow not found',
      };
    }

    if (state.status !== 'ready') {
      return {
        success: false,
        error: 'Workflow is not ready for execution',
      };
    }

    const pattern = this.patternMatcher.getPattern(state.patternId);

    if (!pattern) {
      return {
        success: false,
        error: 'Pattern not found',
      };
    }

    const variables = this.workflowEngine.getTemplateVariables(input.workflowId);
    const generatedFiles: Array<{ path: string; content: string }> = [];

    // Get templates and render them
    const templates = await this.getPatternTemplates(pattern);

    for (const template of templates) {
      try {
        const rendered = await this.templateEngine.renderTemplate(template, variables);

        if (!input.dryRun) {
          // In production, we'd write files here
          // For now, just collect them
        }

        generatedFiles.push({
          path: rendered.path,
          content: rendered.content,
        });
      } catch (error) {
        const err = error as Error;
        return {
          success: false,
          error: `Failed to render template ${template.id}: ${err.message}`,
        };
      }
    }

    // Mark workflow as completed
    if (!input.dryRun) {
      this.workflowEngine.completeWorkflow(input.workflowId);
    }

    return {
      success: true,
      generatedFiles,
      instructions: pattern.instructions,
    };
  }

  /**
   * Cancel an active workflow
   */
  cancelWorkflow(input: CancelWorkflowInput): { success: boolean; error?: string } {
    const state = this.workflowEngine.getWorkflowState(input.workflowId);

    if (!state) {
      return { success: false, error: 'Workflow not found' };
    }

    this.workflowEngine.cancelWorkflow(input.workflowId);

    return { success: true };
  }

  /**
   * Get current workflow state
   */
  getWorkflowState(workflowId: string): {
    exists: boolean;
    status?: string;
    currentStepIndex?: number;
    answers?: Record<string, unknown>;
  } {
    const state = this.workflowEngine.getWorkflowState(workflowId);

    if (!state) {
      return { exists: false };
    }

    return {
      exists: true,
      status: state.status,
      currentStepIndex: state.currentStepIndex,
      answers: state.answers,
    };
  }

  /**
   * Get tool definitions for MCP registration
   */
  static getToolDefinitions() {
    return [
      {
        name: 'identify_intent',
        description: 'Analyze user prompt to identify which pattern/workflow matches their intent',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'User prompt to analyze',
            },
            projectPath: {
              type: 'string',
              description: 'Optional path to project for context',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'start_workflow',
        description: 'Start a guided workflow for a specific pattern',
        inputSchema: {
          type: 'object',
          properties: {
            patternId: {
              type: 'string',
              description: 'ID of the pattern to use',
            },
            projectPath: {
              type: 'string',
              description: 'Path to the project',
            },
          },
          required: ['patternId', 'projectPath'],
        },
      },
      {
        name: 'answer_workflow_step',
        description: 'Answer the current step in a workflow',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'ID of the active workflow',
            },
            stepId: {
              type: 'string',
              description: 'ID of the step being answered',
            },
            answer: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
                { type: 'boolean' },
              ],
              description: 'Answer to the question',
            },
          },
          required: ['workflowId', 'stepId', 'answer'],
        },
      },
      {
        name: 'execute_workflow',
        description: 'Execute a completed workflow to generate code',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'ID of the workflow to execute',
            },
            dryRun: {
              type: 'boolean',
              description: 'If true, show what would be generated without creating files',
            },
          },
          required: ['workflowId'],
        },
      },
      {
        name: 'cancel_workflow',
        description: 'Cancel an active workflow',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'ID of the workflow to cancel',
            },
          },
          required: ['workflowId'],
        },
      },
    ];
  }
}
