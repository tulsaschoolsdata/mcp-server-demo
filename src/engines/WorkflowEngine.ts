import {
  Pattern,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowState,
  WorkflowOption,
  ProjectContext,
  WorkflowStepResponse,
  WorkflowSummary,
  Template,
} from '../types.js';
import { generateId } from '../utils/helpers.js';

/**
 * Workflow Engine manages the state machine for pattern workflows
 */
export class WorkflowEngine {
  private activeWorkflows: Map<string, WorkflowState> = new Map();

  /**
   * Start a new workflow for a pattern
   */
  startWorkflow(
    pattern: Pattern,
    context: ProjectContext
  ): { workflowId: string; firstStep: WorkflowStep | null } {
    const workflowId = generateId('wf');

    const state: WorkflowState = {
      id: workflowId,
      patternId: pattern.id,
      currentStepIndex: 0,
      answers: {},
      context,
      status: 'in_progress',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.activeWorkflows.set(workflowId, state);

    const firstStep = this.getNextStep(state, pattern.workflow);

    return { workflowId, firstStep };
  }

  /**
   * Get the current state of a workflow
   */
  getWorkflowState(workflowId: string): WorkflowState | undefined {
    return this.activeWorkflows.get(workflowId);
  }

  /**
   * Process an answer to a workflow step
   */
  answerStep(
    workflowId: string,
    workflow: WorkflowDefinition,
    stepId: string,
    answer: unknown
  ): WorkflowStepResponse {
    const state = this.activeWorkflows.get(workflowId);
    if (!state) {
      return {
        completed: false,
        validationError: 'Workflow not found',
      };
    }

    const currentStep = workflow.steps[state.currentStepIndex];
    if (!currentStep || currentStep.id !== stepId) {
      return {
        completed: false,
        validationError: `Invalid step: expected ${currentStep?.id}, got ${stepId}`,
      };
    }

    // Validate the answer
    const validationError = this.validateAnswer(currentStep, answer);
    if (validationError) {
      return { completed: false, validationError };
    }

    // Store the answer
    state.answers[stepId] = answer;
    state.currentStepIndex++;
    state.updatedAt = new Date();

    // Get next step (skipping conditional steps that don't apply)
    const nextStep = this.getNextStep(state, workflow);

    if (nextStep) {
      return { completed: false, nextStep };
    }

    // Workflow complete
    state.status = 'ready';
    return { completed: true };
  }

  /**
   * Get the next applicable step
   */
  private getNextStep(
    state: WorkflowState,
    workflow: WorkflowDefinition
  ): WorkflowStep | null {
    while (state.currentStepIndex < workflow.steps.length) {
      const step = workflow.steps[state.currentStepIndex];

      // Check condition
      if (step.condition) {
        const shouldShow = this.evaluateCondition(step.condition, state);
        if (!shouldShow) {
          state.currentStepIndex++;
          continue;
        }
      }

      // Apply context-aware recommendations
      return this.enhanceStepWithRecommendations(step, state.context);
    }

    return null;
  }

  /**
   * Enhance a step with context-aware recommendations
   */
  private enhanceStepWithRecommendations(
    step: WorkflowStep,
    context: ProjectContext
  ): WorkflowStep {
    if (!step.options) return step;

    const enhancedOptions = step.options.map((option) => {
      const enhanced = { ...option };

      // Add recommendations based on context
      enhanced.recommended = this.shouldRecommend(option, step, context);

      return enhanced;
    });

    // Sort recommended options first
    enhancedOptions.sort((a, b) => {
      if (a.recommended && !b.recommended) return -1;
      if (!a.recommended && b.recommended) return 1;
      return 0;
    });

    return { ...step, options: enhancedOptions };
  }

  /**
   * Determine if an option should be recommended based on context
   */
  private shouldRecommend(
    option: WorkflowOption,
    step: WorkflowStep,
    context: ProjectContext
  ): boolean {
    // Check for explicit recommendation
    if (option.recommended) return true;

    // Context-based recommendations
    const stepId = step.id.toLowerCase();
    const value = option.value.toLowerCase();

    // Database recommendations
    if (stepId.includes('database') || stepId.includes('db')) {
      if (value === 'postgresql' && context.database.adapter === 'postgresql') {
        return true;
      }
    }

    // CSS framework recommendations
    if (stepId.includes('css') || stepId.includes('style')) {
      if (value === 'tailwind' && context.cssFramework === 'tailwind') {
        return true;
      }
      if (value === 'bootstrap' && context.cssFramework === 'bootstrap') {
        return true;
      }
    }

    // React hooks recommendations
    if (stepId.includes('state') || stepId.includes('hook')) {
      const hasHook = context.hooks.some((h) =>
        h.name.toLowerCase().includes(value)
      );
      if (hasHook) return true;
    }

    return false;
  }

  /**
   * Validate an answer against step requirements
   */
  private validateAnswer(step: WorkflowStep, answer: unknown): string | null {
    switch (step.type) {
      case 'single_select':
        if (!step.options?.some((o) => o.value === answer)) {
          return `Invalid option: ${answer}`;
        }
        break;

      case 'multi_select':
        if (!Array.isArray(answer)) {
          return 'Expected array of selections';
        }
        for (const val of answer) {
          if (!step.options?.some((o) => o.value === val)) {
            return `Invalid option: ${val}`;
          }
        }
        break;

      case 'text':
        if (typeof answer !== 'string') {
          return 'Expected text input';
        }
        if (step.validation) {
          try {
            const isValid = this.evaluateValidation(step.validation, answer);
            if (!isValid) {
              return 'Invalid input format';
            }
          } catch {
            return 'Validation failed';
          }
        }
        break;

      case 'confirm':
        if (typeof answer !== 'boolean') {
          return 'Expected boolean confirmation';
        }
        break;
    }

    return null;
  }

  /**
   * Evaluate a condition expression
   */
  private evaluateCondition(
    condition: string,
    state: WorkflowState
  ): boolean {
    try {
      // Create a safe evaluation context
      const context = {
        answers: state.answers,
        context: state.context,
        hasModel: (name: string) =>
          state.context.models.some(
            (m) => m.name.toLowerCase() === name.toLowerCase()
          ),
        hasGem: (name: string) =>
          state.context.gems.some(
            (g) => g.name.toLowerCase() === name.toLowerCase()
          ),
        hasComponent: (name: string) =>
          state.context.components.some(
            (c) => c.name.toLowerCase() === name.toLowerCase()
          ),
      };

      // Use Function constructor for sandboxed evaluation
      const fn = new Function(
        ...Object.keys(context),
        `return (${condition})`
      );
      return fn(...Object.values(context));
    } catch {
      // If evaluation fails, show the step
      return true;
    }
  }

  /**
   * Evaluate a validation expression
   */
  private evaluateValidation(validation: string, value: string): boolean {
    try {
      const fn = new Function('value', `return (${validation})`);
      return fn(value);
    } catch {
      return true;
    }
  }

  /**
   * Generate a summary of the completed workflow
   */
  generateSummary(
    workflowId: string,
    pattern: Pattern,
    templates: Template[]
  ): WorkflowSummary | null {
    const state = this.activeWorkflows.get(workflowId);
    if (!state || state.status !== 'ready') {
      return null;
    }

    // Determine which templates to use based on answers
    const selectedTemplates = this.selectTemplates(state, pattern, templates);

    // Get file paths from templates
    const filesToGenerate = selectedTemplates.map((t) => t.outputPath);

    // Get relevant instructions
    const instructions = pattern.instructions || [];

    return {
      patternName: pattern.name,
      answers: state.answers,
      filesToGenerate,
      instructions,
    };
  }

  /**
   * Select templates based on workflow answers
   */
  private selectTemplates(
    state: WorkflowState,
    pattern: Pattern,
    allTemplates: Template[]
  ): Template[] {
    const selectedIds = new Set<string>(pattern.templates);

    // Add templates from selected options
    for (const [stepId, answer] of Object.entries(state.answers)) {
      const step = pattern.workflow.steps.find((s) => s.id === stepId);
      if (!step?.options) continue;

      const answers = Array.isArray(answer) ? answer : [answer];

      for (const ans of answers) {
        const option = step.options.find((o) => o.value === ans);
        if (option?.templates) {
          option.templates.forEach((t) => selectedIds.add(t));
        }
      }
    }

    return allTemplates.filter((t) => selectedIds.has(t.id));
  }

  /**
   * Get variables for template rendering from workflow state
   */
  getTemplateVariables(workflowId: string): Record<string, unknown> {
    const state = this.activeWorkflows.get(workflowId);
    if (!state) return {};

    return {
      ...state.answers,
      context: state.context,
    };
  }

  /**
   * Mark workflow as completed
   */
  completeWorkflow(workflowId: string): void {
    const state = this.activeWorkflows.get(workflowId);
    if (state) {
      state.status = 'completed';
      state.updatedAt = new Date();
    }
  }

  /**
   * Cancel a workflow
   */
  cancelWorkflow(workflowId: string): void {
    const state = this.activeWorkflows.get(workflowId);
    if (state) {
      state.status = 'cancelled';
      state.updatedAt = new Date();
    }
  }

  /**
   * Clean up old workflows
   */
  cleanupOldWorkflows(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();

    for (const [id, state] of this.activeWorkflows.entries()) {
      if (now - state.updatedAt.getTime() > maxAgeMs) {
        this.activeWorkflows.delete(id);
      }
    }
  }

  /**
   * Export workflow state for persistence
   */
  exportState(workflowId: string): WorkflowState | null {
    return this.activeWorkflows.get(workflowId) || null;
  }

  /**
   * Import workflow state from persistence
   */
  importState(state: WorkflowState): void {
    this.activeWorkflows.set(state.id, state);
  }
}
