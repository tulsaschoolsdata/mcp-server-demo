import { z } from 'zod';
import {
  ProjectContext,
  AnalysisResult,
  ModelInfo,
  ControllerInfo,
  ComponentInfo,
  AnalysisStatistics,
} from '../types.js';
import { CodeAnalyzer } from '../engines/CodeAnalyzer.js';

// Tool schemas
export const detectProjectContextSchema = z.object({
  projectPath: z.string().describe('Path to the project to analyze'),
});

export const analyzeCodebaseSchema = z.object({
  pathOrUrl: z.string().describe('Local path or git URL to analyze'),
  extractPatterns: z.boolean().optional().describe('Extract patterns from codebase'),
  extractTemplates: z.boolean().optional().describe('Extract templates from codebase'),
  extractSnippets: z.boolean().optional().describe('Extract snippets from codebase'),
});

export const analyzeModelsSchema = z.object({
  projectPath: z.string().describe('Path to the project'),
});

export const analyzeComponentsSchema = z.object({
  projectPath: z.string().describe('Path to the project'),
});

export const analyzeControllersSchema = z.object({
  projectPath: z.string().describe('Path to the project'),
});

export const analyzeStylesSchema = z.object({
  projectPath: z.string().describe('Path to the project'),
});

export const batchAnalyzeSchema = z.object({
  pathsOrUrls: z.array(z.string()).describe('Array of paths or URLs to analyze'),
  mergeResults: z.boolean().optional().describe('Merge similar patterns across codebases'),
});

// Types
export type DetectProjectContextInput = z.infer<typeof detectProjectContextSchema>;
export type AnalyzeCodebaseInput = z.infer<typeof analyzeCodebaseSchema>;
export type AnalyzeModelsInput = z.infer<typeof analyzeModelsSchema>;
export type AnalyzeComponentsInput = z.infer<typeof analyzeComponentsSchema>;
export type AnalyzeControllersInput = z.infer<typeof analyzeControllersSchema>;
export type AnalyzeStylesInput = z.infer<typeof analyzeStylesSchema>;
export type BatchAnalyzeInput = z.infer<typeof batchAnalyzeSchema>;

/**
 * Analysis tools for examining codebases
 */
export class AnalysisTools {
  private codeAnalyzer: CodeAnalyzer;

  constructor() {
    this.codeAnalyzer = new CodeAnalyzer();
  }

  /**
   * Detect project context
   */
  async detectProjectContext(input: DetectProjectContextInput): Promise<{
    success: boolean;
    context?: {
      rootPath: string;
      railsVersion?: string;
      rubyVersion?: string;
      reactVersion?: string;
      typeScriptVersion?: string;
      database: {
        adapter: string;
        tableCount: number;
      };
      modelCount: number;
      controllerCount: number;
      componentCount: number;
      hookCount: number;
      cssFramework: string;
      bundler: string;
      gems: Array<{ name: string; version?: string }>;
    };
    error?: string;
  }> {
    try {
      const context = await this.codeAnalyzer.detectProjectContext(input.projectPath);

      return {
        success: true,
        context: {
          rootPath: context.rootPath,
          railsVersion: context.railsVersion,
          rubyVersion: context.rubyVersion,
          reactVersion: context.reactVersion,
          typeScriptVersion: context.typeScriptVersion,
          database: {
            adapter: context.database.adapter,
            tableCount: context.database.tables.length,
          },
          modelCount: context.models.length,
          controllerCount: context.controllers.length,
          componentCount: context.components.length,
          hookCount: context.hooks.length,
          cssFramework: context.cssFramework,
          bundler: context.bundler,
          gems: context.gems.slice(0, 20).map((g) => ({
            name: g.name,
            version: g.version,
          })),
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
   * Full codebase analysis
   */
  async analyzeCodebase(input: AnalyzeCodebaseInput): Promise<{
    success: boolean;
    result?: {
      projectPath: string;
      analyzedAt: string;
      statistics: AnalysisStatistics;
      extractedPatternsCount: number;
      extractedTemplatesCount: number;
      extractedSnippetsCount: number;
      patterns?: Array<{
        suggestedId: string;
        name: string;
        description: string;
        confidence: number;
      }>;
      templates?: Array<{
        suggestedId: string;
        name: string;
        category: string;
        confidence: number;
      }>;
      snippets?: Array<{
        suggestedId: string;
        name: string;
        category: string;
        usageCount: number;
      }>;
    };
    error?: string;
  }> {
    try {
      const result = await this.codeAnalyzer.analyzeCodebase(input.pathOrUrl);

      return {
        success: true,
        result: {
          projectPath: result.projectPath,
          analyzedAt: result.analyzedAt.toISOString(),
          statistics: result.statistics,
          extractedPatternsCount: result.extractedPatterns.length,
          extractedTemplatesCount: result.extractedTemplates.length,
          extractedSnippetsCount: result.extractedSnippets.length,
          patterns: input.extractPatterns !== false
            ? result.extractedPatterns.map((p) => ({
                suggestedId: p.suggestedId,
                name: p.name,
                description: p.description,
                confidence: p.confidence,
              }))
            : undefined,
          templates: input.extractTemplates !== false
            ? result.extractedTemplates.map((t) => ({
                suggestedId: t.suggestedId,
                name: t.name,
                category: t.category,
                confidence: t.confidence,
              }))
            : undefined,
          snippets: input.extractSnippets !== false
            ? result.extractedSnippets.map((s) => ({
                suggestedId: s.suggestedId,
                name: s.name,
                category: s.category,
                usageCount: s.usageCount,
              }))
            : undefined,
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
   * Analyze models specifically
   */
  async analyzeModels(input: AnalyzeModelsInput): Promise<{
    success: boolean;
    models?: Array<{
      name: string;
      tableName: string;
      filePath: string;
      associations: Array<{
        type: string;
        name: string;
      }>;
      validations: Array<{
        type: string;
        fields: string[];
      }>;
      scopes: string[];
      callbacks: string[];
      concerns: string[];
    }>;
    summary?: {
      totalModels: number;
      totalAssociations: number;
      totalValidations: number;
      mostUsedAssociationType: string;
      mostUsedValidationType: string;
    };
    error?: string;
  }> {
    try {
      const models = await this.codeAnalyzer.analyzeModels(input.projectPath);

      // Calculate summary statistics
      let totalAssociations = 0;
      let totalValidations = 0;
      const associationCounts: Record<string, number> = {};
      const validationCounts: Record<string, number> = {};

      for (const model of models) {
        totalAssociations += model.associations.length;
        totalValidations += model.validations.length;

        for (const assoc of model.associations) {
          associationCounts[assoc.type] = (associationCounts[assoc.type] || 0) + 1;
        }

        for (const val of model.validations) {
          validationCounts[val.type] = (validationCounts[val.type] || 0) + 1;
        }
      }

      const mostUsedAssociation = Object.entries(associationCounts)
        .sort((a, b) => b[1] - a[1])[0];

      const mostUsedValidation = Object.entries(validationCounts)
        .sort((a, b) => b[1] - a[1])[0];

      return {
        success: true,
        models: models.map((m) => ({
          name: m.name,
          tableName: m.tableName,
          filePath: m.filePath,
          associations: m.associations.map((a) => ({
            type: a.type,
            name: a.name,
          })),
          validations: m.validations.map((v) => ({
            type: v.type,
            fields: v.fields,
          })),
          scopes: m.scopes.map((s) => s.name),
          callbacks: m.callbacks,
          concerns: m.concerns,
        })),
        summary: {
          totalModels: models.length,
          totalAssociations,
          totalValidations,
          mostUsedAssociationType: mostUsedAssociation?.[0] || 'none',
          mostUsedValidationType: mostUsedValidation?.[0] || 'none',
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
   * Analyze React components specifically
   */
  async analyzeComponents(input: AnalyzeComponentsInput): Promise<{
    success: boolean;
    components?: Array<{
      name: string;
      filePath: string;
      type: 'functional' | 'class';
      props: Array<{
        name: string;
        type?: string;
        required: boolean;
      }>;
      hooks: string[];
      cssClasses: string[];
    }>;
    summary?: {
      totalComponents: number;
      functionalCount: number;
      classCount: number;
      mostUsedHooks: string[];
      averagePropsCount: number;
    };
    error?: string;
  }> {
    try {
      const components = await this.codeAnalyzer.analyzeComponents(input.projectPath);

      // Calculate summary
      const hookCounts: Record<string, number> = {};
      let totalProps = 0;

      for (const component of components) {
        totalProps += component.props.length;

        for (const hook of component.hooks) {
          hookCounts[hook] = (hookCounts[hook] || 0) + 1;
        }
      }

      const mostUsedHooks = Object.entries(hookCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([hook]) => hook);

      return {
        success: true,
        components: components.map((c) => ({
          name: c.name,
          filePath: c.filePath,
          type: c.type,
          props: c.props,
          hooks: c.hooks,
          cssClasses: c.cssClasses,
        })),
        summary: {
          totalComponents: components.length,
          functionalCount: components.filter((c) => c.type === 'functional').length,
          classCount: components.filter((c) => c.type === 'class').length,
          mostUsedHooks,
          averagePropsCount: components.length > 0
            ? Math.round(totalProps / components.length)
            : 0,
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
   * Analyze controllers specifically
   */
  async analyzeControllers(input: AnalyzeControllersInput): Promise<{
    success: boolean;
    controllers?: Array<{
      name: string;
      filePath: string;
      namespace?: string;
      actions: string[];
      beforeActions: string[];
    }>;
    summary?: {
      totalControllers: number;
      totalActions: number;
      apiControllers: number;
      commonActions: string[];
    };
    error?: string;
  }> {
    try {
      const controllers = await this.codeAnalyzer.analyzeControllers(input.projectPath);

      // Calculate summary
      const actionCounts: Record<string, number> = {};

      for (const controller of controllers) {
        for (const action of controller.actions) {
          actionCounts[action] = (actionCounts[action] || 0) + 1;
        }
      }

      const commonActions = Object.entries(actionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([action]) => action);

      return {
        success: true,
        controllers: controllers.map((c) => ({
          name: c.name,
          filePath: c.filePath,
          namespace: c.namespace,
          actions: c.actions,
          beforeActions: c.beforeActions,
        })),
        summary: {
          totalControllers: controllers.length,
          totalActions: Object.values(actionCounts).reduce((a, b) => a + b, 0),
          apiControllers: controllers.filter(
            (c) => c.namespace?.includes('Api') || c.name.includes('Api')
          ).length,
          commonActions,
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
   * Analyze styles specifically
   */
  async analyzeStyles(input: AnalyzeStylesInput): Promise<{
    success: boolean;
    styles?: {
      framework: string;
      customClasses: string[];
      colorPalette: Record<string, string>;
      bootstrapUsage?: {
        classes: string[];
        components: string[];
      };
      tailwindUsage?: {
        classes: string[];
        customizations: string[];
      };
    };
    error?: string;
  }> {
    try {
      const styles = await this.codeAnalyzer.analyzeStyles(input.projectPath);

      return {
        success: true,
        styles: {
          framework: styles.framework,
          customClasses: styles.classes.slice(0, 50),
          colorPalette: styles.variables,
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
   * Batch analyze multiple codebases
   */
  async batchAnalyze(input: BatchAnalyzeInput): Promise<{
    success: boolean;
    results?: Array<{
      pathOrUrl: string;
      success: boolean;
      statistics?: AnalysisStatistics;
      error?: string;
    }>;
    summary?: {
      totalAnalyzed: number;
      successCount: number;
      failureCount: number;
      totalModels: number;
      totalComponents: number;
      commonPatterns: string[];
    };
    error?: string;
  }> {
    try {
      const results = await this.codeAnalyzer.batchAnalyze(input.pathsOrUrls);

      const summaryResults = [];
      let totalModels = 0;
      let totalComponents = 0;
      const patternCounts: Record<string, number> = {};

      for (let i = 0; i < input.pathsOrUrls.length; i++) {
        const pathOrUrl = input.pathsOrUrls[i];
        const result = results.find((r) => r.projectPath === pathOrUrl || r.projectPath.includes(pathOrUrl.split('/').pop() || ''));

        if (result) {
          totalModels += result.statistics.modelsFound;
          totalComponents += result.statistics.componentsFound;

          for (const pattern of result.extractedPatterns) {
            patternCounts[pattern.name] = (patternCounts[pattern.name] || 0) + 1;
          }

          summaryResults.push({
            pathOrUrl,
            success: true,
            statistics: result.statistics,
          });
        } else {
          summaryResults.push({
            pathOrUrl,
            success: false,
            error: 'Analysis failed',
          });
        }
      }

      const commonPatterns = Object.entries(patternCounts)
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([pattern]) => pattern);

      return {
        success: true,
        results: summaryResults,
        summary: {
          totalAnalyzed: input.pathsOrUrls.length,
          successCount: summaryResults.filter((r) => r.success).length,
          failureCount: summaryResults.filter((r) => !r.success).length,
          totalModels,
          totalComponents,
          commonPatterns,
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
   * Get tool definitions for MCP registration
   */
  static getToolDefinitions() {
    return [
      {
        name: 'detect_project_context',
        description: 'Detect Rails/React project configuration and structure',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Path to the project' },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'analyze_codebase',
        description: 'Perform full analysis of a codebase to extract patterns, templates, and snippets',
        inputSchema: {
          type: 'object',
          properties: {
            pathOrUrl: { type: 'string', description: 'Local path or git URL' },
            extractPatterns: { type: 'boolean', description: 'Extract patterns' },
            extractTemplates: { type: 'boolean', description: 'Extract templates' },
            extractSnippets: { type: 'boolean', description: 'Extract snippets' },
          },
          required: ['pathOrUrl'],
        },
      },
      {
        name: 'analyze_models',
        description: 'Analyze Rails models in a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Path to the project' },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'analyze_components',
        description: 'Analyze React components in a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Path to the project' },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'analyze_controllers',
        description: 'Analyze Rails controllers in a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Path to the project' },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'analyze_styles',
        description: 'Analyze CSS/styling in a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Path to the project' },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'batch_analyze',
        description: 'Analyze multiple codebases at once',
        inputSchema: {
          type: 'object',
          properties: {
            pathsOrUrls: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of paths or URLs',
            },
            mergeResults: { type: 'boolean', description: 'Merge similar patterns' },
          },
          required: ['pathsOrUrls'],
        },
      },
    ];
  }
}
