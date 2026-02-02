import * as ejs from 'ejs';
import * as path from 'path';
import {
  Template,
  RenderedTemplate,
  TemplateVariable,
} from '../types.js';
import {
  readFile,
  camelize,
  underscore,
  pluralize,
  singularize,
  tableize,
  classify,
  humanize,
  indentCode,
} from '../utils/helpers.js';

/**
 * Template Engine for rendering EJS templates with Rails/React conventions
 */
export class TemplateEngine {
  private libraryPath: string;
  private templateCache: Map<string, string> = new Map();

  constructor(libraryPath: string) {
    this.libraryPath = libraryPath;
  }

  /**
   * Get the helpers available in templates
   */
  private getTemplateHelpers(): Record<string, unknown> {
    return {
      // String transformations
      camelize,
      underscore,
      pluralize,
      singularize,
      tableize,
      classify,
      humanize,

      // Code formatting
      indent: (code: string, spaces: number) => indentCode(code, spaces),

      // Rails-specific helpers
      railsType: (jsType: string) => this.jsTypeToRailsType(jsType),
      migrationColumn: (name: string, type: string) =>
        `t.${this.jsTypeToRailsType(type)} :${underscore(name)}`,

      // React-specific helpers
      propType: (type: string) => this.toPropType(type),

      // Conditional helpers
      ifPresent: <T>(value: T | undefined | null, fn: (v: T) => string) =>
        value ? fn(value) : '',
      ifArray: <T>(arr: T[] | undefined, fn: (items: T[]) => string) =>
        arr && arr.length > 0 ? fn(arr) : '',

      // Join helpers
      joinWith: (arr: string[], separator: string) => arr.join(separator),
      mapJoin: <T>(arr: T[], fn: (item: T) => string, separator: string) =>
        arr.map(fn).join(separator),
    };
  }

  /**
   * Convert JavaScript types to Rails migration types
   */
  private jsTypeToRailsType(jsType: string): string {
    const typeMap: Record<string, string> = {
      string: 'string',
      text: 'text',
      number: 'integer',
      integer: 'integer',
      float: 'float',
      decimal: 'decimal',
      boolean: 'boolean',
      date: 'date',
      datetime: 'datetime',
      time: 'time',
      json: 'jsonb',
      array: 'jsonb',
      object: 'jsonb',
      uuid: 'uuid',
      binary: 'binary',
    };
    return typeMap[jsType.toLowerCase()] || 'string';
  }

  /**
   * Convert types to React PropTypes
   */
  private toPropType(type: string): string {
    const typeMap: Record<string, string> = {
      string: 'PropTypes.string',
      number: 'PropTypes.number',
      boolean: 'PropTypes.bool',
      function: 'PropTypes.func',
      object: 'PropTypes.object',
      array: 'PropTypes.array',
      node: 'PropTypes.node',
      element: 'PropTypes.element',
      any: 'PropTypes.any',
    };
    return typeMap[type.toLowerCase()] || 'PropTypes.any';
  }

  /**
   * Load a template from the library
   */
  async loadTemplate(templateId: string): Promise<string> {
    if (this.templateCache.has(templateId)) {
      return this.templateCache.get(templateId)!;
    }

    const templatePath = path.join(
      this.libraryPath,
      'templates',
      `${templateId}.ejs`
    );

    try {
      const content = await readFile(templatePath);
      this.templateCache.set(templateId, content);
      return content;
    } catch (error) {
      throw new Error(`Template not found: ${templateId}`);
    }
  }

  /**
   * Validate template variables
   */
  validateVariables(
    template: Template,
    variables: Record<string, unknown>
  ): string[] {
    const errors: string[] = [];

    for (const varDef of template.variables) {
      const value = variables[varDef.name];

      if (varDef.required && (value === undefined || value === null)) {
        errors.push(`Missing required variable: ${varDef.name}`);
        continue;
      }

      if (value !== undefined && value !== null) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== varDef.type && varDef.type !== 'object') {
          errors.push(
            `Variable ${varDef.name} expected ${varDef.type}, got ${actualType}`
          );
        }
      }
    }

    return errors;
  }

  /**
   * Apply default values to variables
   */
  applyDefaults(
    template: Template,
    variables: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...variables };

    for (const varDef of template.variables) {
      if (result[varDef.name] === undefined && varDef.default !== undefined) {
        result[varDef.name] = varDef.default;
      }
    }

    return result;
  }

  /**
   * Render a template with variables
   */
  async render(
    templateContent: string,
    variables: Record<string, unknown>
  ): Promise<string> {
    const helpers = this.getTemplateHelpers();
    const data = { ...helpers, ...variables };

    try {
      return ejs.render(templateContent, data, {
        async: false,
        rmWhitespace: false,
      });
    } catch (error) {
      const err = error as Error;
      throw new Error(`Template rendering failed: ${err.message}`);
    }
  }

  /**
   * Render a template by ID
   */
  async renderTemplate(
    template: Template,
    variables: Record<string, unknown>
  ): Promise<RenderedTemplate> {
    // Apply defaults
    const finalVariables = this.applyDefaults(template, variables);

    // Validate
    const errors = this.validateVariables(template, finalVariables);
    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }

    // Load and render template
    const templateContent = await this.loadTemplate(template.id);
    const content = await this.render(templateContent, finalVariables);

    // Render output path
    const outputPath = await this.render(template.outputPath, finalVariables);

    return {
      path: outputPath,
      content,
      template,
    };
  }

  /**
   * Preview template with sample data
   */
  async previewTemplate(
    template: Template,
    sampleData?: Record<string, unknown>
  ): Promise<RenderedTemplate> {
    const defaultSample = this.generateSampleData(template);
    const variables = { ...defaultSample, ...sampleData };
    return this.renderTemplate(template, variables);
  }

  /**
   * Generate sample data for a template
   */
  private generateSampleData(template: Template): Record<string, unknown> {
    const sample: Record<string, unknown> = {};

    for (const varDef of template.variables) {
      if (varDef.default !== undefined) {
        sample[varDef.name] = varDef.default;
      } else {
        switch (varDef.type) {
          case 'string':
            sample[varDef.name] = `Sample${camelize(varDef.name)}`;
            break;
          case 'boolean':
            sample[varDef.name] = true;
            break;
          case 'array':
            sample[varDef.name] = ['item1', 'item2'];
            break;
          case 'object':
            sample[varDef.name] = {};
            break;
        }
      }
    }

    return sample;
  }

  /**
   * Render multiple templates at once
   */
  async renderTemplates(
    templates: Template[],
    variables: Record<string, unknown>
  ): Promise<RenderedTemplate[]> {
    const results: RenderedTemplate[] = [];

    for (const template of templates) {
      try {
        const rendered = await this.renderTemplate(template, variables);
        results.push(rendered);
      } catch (error) {
        const err = error as Error;
        throw new Error(`Failed to render ${template.id}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templateCache.clear();
  }

  /**
   * Render snippet with context-aware variable substitution
   */
  renderSnippet(
    snippetCode: string,
    variables: Record<string, unknown>
  ): string {
    const helpers = this.getTemplateHelpers();
    const data = { ...helpers, ...variables };

    // Replace {{variable}} style placeholders
    let result = snippetCode.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      const value = data[varName];
      return value !== undefined ? String(value) : `{{${varName}}}`;
    });

    // Also support EJS syntax in snippets
    try {
      result = ejs.render(result, data, { async: false });
    } catch {
      // If EJS fails, return the simple substitution result
    }

    return result;
  }
}
