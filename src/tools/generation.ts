import * as path from 'path';
import {
  Template,
  RenderedTemplate,
} from '../types.js';
import { TemplateEngine } from '../engines/TemplateEngine.js';
import { LibraryTools } from './library.js';
import {
  writeFile,
  fileExists,
  ensureDirectory,
} from '../utils/helpers.js';

// Types
export interface GenerateFromTemplateInput {
  templateId: string;
  variables: Record<string, unknown>;
  outputPath?: string;
  dryRun?: boolean;
}

export interface GenerateMultipleInput {
  templateIds: string[];
  variables: Record<string, unknown>;
  basePath: string;
  dryRun?: boolean;
}

export interface GenerateFromPatternInput {
  patternId: string;
  variables: Record<string, unknown>;
  projectPath: string;
  dryRun?: boolean;
}

export interface RenderSnippetInput {
  snippetId: string;
  variables?: Record<string, unknown>;
}

export interface ValidateTemplateVariablesInput {
  templateId: string;
  variables: Record<string, unknown>;
}

/**
 * Generation tools for creating code from templates
 */
export class GenerationTools {
  private templateEngine: TemplateEngine;
  private libraryTools: LibraryTools;

  constructor(libraryPath: string, libraryTools: LibraryTools) {
    this.templateEngine = new TemplateEngine(libraryPath);
    this.libraryTools = libraryTools;
  }

  /**
   * Generate code from a single template
   */
  async generateFromTemplate(input: GenerateFromTemplateInput): Promise<{
    success: boolean;
    result?: {
      path: string;
      content: string;
      written: boolean;
    };
    error?: string;
  }> {
    // Get template from library
    const templateResult = await this.libraryTools.getTemplate({
      templateId: input.templateId,
    });

    if (!templateResult.found || !templateResult.template) {
      return {
        success: false,
        error: `Template not found: ${input.templateId}`,
      };
    }

    const template = templateResult.template;

    try {
      const rendered = await this.templateEngine.renderTemplate(
        template,
        input.variables
      );

      // Override output path if provided
      const outputPath = input.outputPath || rendered.path;

      // Write file unless dry run
      let written = false;
      if (!input.dryRun) {
        await ensureDirectory(path.dirname(outputPath));
        await writeFile(outputPath, rendered.content);
        written = true;
      }

      return {
        success: true,
        result: {
          path: outputPath,
          content: rendered.content,
          written,
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
   * Generate multiple files from templates
   */
  async generateMultiple(input: GenerateMultipleInput): Promise<{
    success: boolean;
    results?: Array<{
      templateId: string;
      path: string;
      content: string;
      written: boolean;
    }>;
    errors?: Array<{
      templateId: string;
      error: string;
    }>;
  }> {
    const results: Array<{
      templateId: string;
      path: string;
      content: string;
      written: boolean;
    }> = [];
    const errors: Array<{ templateId: string; error: string }> = [];

    for (const templateId of input.templateIds) {
      const templateResult = await this.libraryTools.getTemplate({ templateId });

      if (!templateResult.found || !templateResult.template) {
        errors.push({
          templateId,
          error: `Template not found: ${templateId}`,
        });
        continue;
      }

      const template = templateResult.template;

      try {
        const rendered = await this.templateEngine.renderTemplate(
          template,
          input.variables
        );

        const outputPath = path.join(input.basePath, rendered.path);

        let written = false;
        if (!input.dryRun) {
          await ensureDirectory(path.dirname(outputPath));
          await writeFile(outputPath, rendered.content);
          written = true;
        }

        results.push({
          templateId,
          path: outputPath,
          content: rendered.content,
          written,
        });
      } catch (error) {
        const err = error as Error;
        errors.push({
          templateId,
          error: err.message,
        });
      }
    }

    return {
      success: errors.length === 0,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Generate all files for a pattern
   */
  async generateFromPattern(input: GenerateFromPatternInput): Promise<{
    success: boolean;
    results?: Array<{
      templateId: string;
      path: string;
      content: string;
      written: boolean;
    }>;
    instructions?: string[];
    errors?: Array<{
      templateId: string;
      error: string;
    }>;
  }> {
    // Get pattern from library
    const patternResult = await this.libraryTools.getPattern({
      patternId: input.patternId,
    });

    if (!patternResult.found || !patternResult.pattern) {
      return {
        success: false,
        errors: [{ templateId: input.patternId, error: 'Pattern not found' }],
      };
    }

    const pattern = patternResult.pattern;

    // Generate all templates for the pattern
    const multipleResult = await this.generateMultiple({
      templateIds: pattern.templates,
      variables: input.variables,
      basePath: input.projectPath,
      dryRun: input.dryRun,
    });

    return {
      success: multipleResult.success,
      results: multipleResult.results,
      instructions: pattern.instructions,
      errors: multipleResult.errors,
    };
  }

  /**
   * Render a snippet with variables
   */
  async renderSnippet(input: RenderSnippetInput): Promise<{
    success: boolean;
    result?: {
      originalCode: string;
      renderedCode: string;
    };
    error?: string;
  }> {
    const snippetResult = await this.libraryTools.getSnippet({
      snippetId: input.snippetId,
      variables: input.variables,
    });

    if (!snippetResult.found || !snippetResult.snippet) {
      return {
        success: false,
        error: `Snippet not found: ${input.snippetId}`,
      };
    }

    return {
      success: true,
      result: {
        originalCode: snippetResult.snippet.code,
        renderedCode: snippetResult.renderedCode || snippetResult.snippet.code,
      },
    };
  }

  /**
   * Validate variables for a template
   */
  async validateTemplateVariables(input: ValidateTemplateVariablesInput): Promise<{
    valid: boolean;
    errors?: string[];
    missingRequired?: string[];
    typeErrors?: Array<{
      variable: string;
      expected: string;
      got: string;
    }>;
  }> {
    const templateResult = await this.libraryTools.getTemplate({
      templateId: input.templateId,
    });

    if (!templateResult.found || !templateResult.template) {
      return {
        valid: false,
        errors: [`Template not found: ${input.templateId}`],
      };
    }

    const template = templateResult.template;
    const errors: string[] = [];
    const missingRequired: string[] = [];
    const typeErrors: Array<{ variable: string; expected: string; got: string }> = [];

    for (const varDef of template.variables) {
      const value = input.variables[varDef.name];

      // Check required
      if (varDef.required && (value === undefined || value === null)) {
        missingRequired.push(varDef.name);
        continue;
      }

      // Check type
      if (value !== undefined && value !== null) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== varDef.type && varDef.type !== 'object') {
          typeErrors.push({
            variable: varDef.name,
            expected: varDef.type,
            got: actualType,
          });
        }
      }
    }

    const valid = missingRequired.length === 0 && typeErrors.length === 0;

    return {
      valid,
      errors: errors.length > 0 ? errors : undefined,
      missingRequired: missingRequired.length > 0 ? missingRequired : undefined,
      typeErrors: typeErrors.length > 0 ? typeErrors : undefined,
    };
  }

  /**
   * Check if a file would be overwritten
   */
  async checkConflicts(paths: string[]): Promise<{
    conflicts: string[];
    safe: string[];
  }> {
    const conflicts: string[] = [];
    const safe: string[] = [];

    for (const filePath of paths) {
      if (await fileExists(filePath)) {
        conflicts.push(filePath);
      } else {
        safe.push(filePath);
      }
    }

    return { conflicts, safe };
  }

  /**
   * Get tool definitions for MCP registration
   */
  static getToolDefinitions() {
    return [
      {
        name: 'generate_from_template',
        description: 'Generate a file from a template',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', description: 'Template ID' },
            variables: { type: 'object', description: 'Template variables' },
            outputPath: { type: 'string', description: 'Custom output path' },
            dryRun: { type: 'boolean', description: 'Preview without writing' },
          },
          required: ['templateId', 'variables'],
        },
      },
      {
        name: 'generate_multiple',
        description: 'Generate multiple files from templates',
        inputSchema: {
          type: 'object',
          properties: {
            templateIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Template IDs',
            },
            variables: { type: 'object', description: 'Variables for all templates' },
            basePath: { type: 'string', description: 'Base path for output' },
            dryRun: { type: 'boolean', description: 'Preview without writing' },
          },
          required: ['templateIds', 'variables', 'basePath'],
        },
      },
      {
        name: 'generate_from_pattern',
        description: 'Generate all files for a pattern',
        inputSchema: {
          type: 'object',
          properties: {
            patternId: { type: 'string', description: 'Pattern ID' },
            variables: { type: 'object', description: 'Variables for generation' },
            projectPath: { type: 'string', description: 'Path to the project' },
            dryRun: { type: 'boolean', description: 'Preview without writing' },
          },
          required: ['patternId', 'variables', 'projectPath'],
        },
      },
      {
        name: 'render_snippet',
        description: 'Render a snippet with variable substitution',
        inputSchema: {
          type: 'object',
          properties: {
            snippetId: { type: 'string', description: 'Snippet ID' },
            variables: { type: 'object', description: 'Variables for substitution' },
          },
          required: ['snippetId'],
        },
      },
      {
        name: 'validate_template_variables',
        description: 'Validate variables for a template',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', description: 'Template ID' },
            variables: { type: 'object', description: 'Variables to validate' },
          },
          required: ['templateId', 'variables'],
        },
      },
    ];
  }
}
