import * as path from 'path';
import {
  Pattern,
  Template,
  Snippet,
  PatternIndexEntry,
  TemplateIndexEntry,
  SnippetIndexEntry,
} from '../types.js';
import { TemplateEngine } from '../engines/TemplateEngine.js';
import { PatternMatcher } from '../engines/PatternMatcher.js';
import {
  readFile,
  readJsonFile,
  findFiles,
  fileExists,
} from '../utils/helpers.js';

// Types
export interface SearchLibraryInput {
  query: string;
  type?: 'all' | 'patterns' | 'templates' | 'snippets';
  category?: string;
  limit?: number;
}

export interface GetPatternInput {
  patternId: string;
}

export interface GetTemplateInput {
  templateId: string;
}

export interface GetSnippetInput {
  snippetId: string;
  variables?: Record<string, unknown>;
}

export interface PreviewTemplateInput {
  templateId: string;
  variables?: Record<string, unknown>;
}

export interface ListPatternsInput {
  category?: string;
}

export interface ListTemplatesInput {
  category?: string;
  language?: string;
}

export interface ListSnippetsInput {
  category?: string;
  language?: string;
}

/**
 * Library tools for accessing patterns, templates, and snippets
 */
export class LibraryTools {
  private libraryPath: string;
  private templateEngine: TemplateEngine;
  private patternMatcher: PatternMatcher;

  // Cached indices
  private patterns: Pattern[] = [];
  private templates: Template[] = [];
  private snippets: Snippet[] = [];
  private loaded = false;

  constructor(libraryPath: string) {
    this.libraryPath = libraryPath;
    this.templateEngine = new TemplateEngine(libraryPath);
    this.patternMatcher = new PatternMatcher();
  }

  /**
   * Load library indices
   */
  async loadLibrary(): Promise<void> {
    if (this.loaded) return;

    await Promise.all([
      this.loadPatterns(),
      this.loadTemplates(),
      this.loadSnippets(),
    ]);

    this.patternMatcher.loadPatterns(this.patterns);
    this.loaded = true;
  }

  /**
   * Load patterns from library
   */
  private async loadPatterns(): Promise<void> {
    const patternDirs = await findFiles('*/manifest.json', path.join(this.libraryPath, 'patterns'));

    for (const manifestPath of patternDirs) {
      try {
        const pattern = await readJsonFile<Pattern>(manifestPath);
        this.patterns.push(pattern);
      } catch {
        // Skip invalid patterns
      }
    }
  }

  /**
   * Load templates from library
   */
  private async loadTemplates(): Promise<void> {
    const templateFiles = await findFiles('*.json', path.join(this.libraryPath, 'templates'));

    for (const templatePath of templateFiles) {
      if (templatePath.endsWith('index.json')) continue;

      try {
        const template = await readJsonFile<Template>(templatePath);
        this.templates.push(template);
      } catch {
        // Skip invalid templates
      }
    }
  }

  /**
   * Load snippets from library
   */
  private async loadSnippets(): Promise<void> {
    const snippetFiles = await findFiles('*.json', path.join(this.libraryPath, 'snippets'));

    for (const snippetPath of snippetFiles) {
      if (snippetPath.endsWith('index.json')) continue;

      try {
        const snippet = await readJsonFile<Snippet>(snippetPath);
        this.snippets.push(snippet);
      } catch {
        // Skip invalid snippets
      }
    }
  }

  /**
   * Search the library
   */
  async searchLibrary(input: SearchLibraryInput): Promise<{
    patterns?: PatternIndexEntry[];
    templates?: TemplateIndexEntry[];
    snippets?: SnippetIndexEntry[];
    totalResults: number;
  }> {
    await this.loadLibrary();

    const limit = input.limit || 10;
    const query = input.query.toLowerCase();
    const results: {
      patterns?: PatternIndexEntry[];
      templates?: TemplateIndexEntry[];
      snippets?: SnippetIndexEntry[];
      totalResults: number;
    } = { totalResults: 0 };

    // Search patterns
    if (input.type === 'all' || input.type === 'patterns') {
      const patternResults = this.patterns
        .filter((p) => {
          const matches =
            p.name.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query) ||
            p.triggers.some((t) => t.toLowerCase().includes(query)) ||
            p.tags.some((t) => t.toLowerCase().includes(query));

          if (input.category && p.category !== input.category) return false;

          return matches;
        })
        .slice(0, limit)
        .map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          triggers: p.triggers,
          tags: p.tags,
        }));

      if (patternResults.length > 0) {
        results.patterns = patternResults;
        results.totalResults += patternResults.length;
      }
    }

    // Search templates
    if (input.type === 'all' || input.type === 'templates') {
      const templateResults = this.templates
        .filter((t) => {
          const matches =
            t.name.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query) ||
            t.tags.some((tag) => tag.toLowerCase().includes(query));

          if (input.category && t.category !== input.category) return false;

          return matches;
        })
        .slice(0, limit)
        .map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          language: t.language,
          tags: t.tags,
        }));

      if (templateResults.length > 0) {
        results.templates = templateResults;
        results.totalResults += templateResults.length;
      }
    }

    // Search snippets
    if (input.type === 'all' || input.type === 'snippets') {
      const snippetResults = this.snippets
        .filter((s) => {
          const matches =
            s.name.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query) ||
            s.tags.some((tag) => tag.toLowerCase().includes(query));

          if (input.category && s.category !== input.category) return false;

          return matches;
        })
        .slice(0, limit)
        .map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          language: s.language,
          tags: s.tags,
        }));

      if (snippetResults.length > 0) {
        results.snippets = snippetResults;
        results.totalResults += snippetResults.length;
      }
    }

    return results;
  }

  /**
   * Get a pattern by ID
   */
  async getPattern(input: GetPatternInput): Promise<{
    found: boolean;
    pattern?: Pattern;
    relatedPatterns?: PatternIndexEntry[];
  }> {
    await this.loadLibrary();

    const pattern = this.patterns.find((p) => p.id === input.patternId);

    if (!pattern) {
      return { found: false };
    }

    // Get related patterns
    const related = this.patternMatcher
      .suggestRelated(input.patternId, 3)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        triggers: p.triggers,
        tags: p.tags,
      }));

    return {
      found: true,
      pattern,
      relatedPatterns: related.length > 0 ? related : undefined,
    };
  }

  /**
   * Get a template by ID
   */
  async getTemplate(input: GetTemplateInput): Promise<{
    found: boolean;
    template?: Template;
    templateContent?: string;
  }> {
    await this.loadLibrary();

    const template = this.templates.find((t) => t.id === input.templateId);

    if (!template) {
      return { found: false };
    }

    // Load template content
    let templateContent: string | undefined;
    try {
      templateContent = await this.templateEngine.loadTemplate(template.id);
    } catch {
      // Template file may not exist yet
    }

    return {
      found: true,
      template,
      templateContent,
    };
  }

  /**
   * Get a snippet by ID with optional variable substitution
   */
  async getSnippet(input: GetSnippetInput): Promise<{
    found: boolean;
    snippet?: Snippet;
    renderedCode?: string;
  }> {
    await this.loadLibrary();

    const snippet = this.snippets.find((s) => s.id === input.snippetId);

    if (!snippet) {
      return { found: false };
    }

    let renderedCode = snippet.code;

    if (input.variables) {
      renderedCode = this.templateEngine.renderSnippet(
        snippet.code,
        input.variables
      );
    }

    return {
      found: true,
      snippet,
      renderedCode,
    };
  }

  /**
   * Preview a template with sample or provided data
   */
  async previewTemplate(input: PreviewTemplateInput): Promise<{
    success: boolean;
    preview?: {
      outputPath: string;
      content: string;
    };
    error?: string;
  }> {
    await this.loadLibrary();

    const template = this.templates.find((t) => t.id === input.templateId);

    if (!template) {
      return {
        success: false,
        error: `Template not found: ${input.templateId}`,
      };
    }

    try {
      const rendered = await this.templateEngine.previewTemplate(
        template,
        input.variables
      );

      return {
        success: true,
        preview: {
          outputPath: rendered.path,
          content: rendered.content,
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
   * List all patterns
   */
  async listPatterns(input: ListPatternsInput): Promise<{
    patterns: PatternIndexEntry[];
    categories: Array<{ name: string; count: number }>;
  }> {
    await this.loadLibrary();

    let patterns = this.patterns;

    if (input.category) {
      patterns = patterns.filter((p) => p.category === input.category);
    }

    const patternEntries = patterns.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      triggers: p.triggers,
      tags: p.tags,
    }));

    const categories = this.patternMatcher
      .getCategories()
      .map((c) => ({ name: c.category, count: c.count }));

    return {
      patterns: patternEntries,
      categories,
    };
  }

  /**
   * List all templates
   */
  async listTemplates(input: ListTemplatesInput): Promise<{
    templates: TemplateIndexEntry[];
    categories: string[];
    languages: string[];
  }> {
    await this.loadLibrary();

    let templates = this.templates;

    if (input.category) {
      templates = templates.filter((t) => t.category === input.category);
    }

    if (input.language) {
      templates = templates.filter((t) => t.language === input.language);
    }

    const templateEntries = templates.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      language: t.language,
      tags: t.tags,
    }));

    const categories = [...new Set(this.templates.map((t) => t.category))];
    const languages = [...new Set(this.templates.map((t) => t.language))];

    return {
      templates: templateEntries,
      categories,
      languages,
    };
  }

  /**
   * List all snippets
   */
  async listSnippets(input: ListSnippetsInput): Promise<{
    snippets: SnippetIndexEntry[];
    categories: string[];
    languages: string[];
  }> {
    await this.loadLibrary();

    let snippets = this.snippets;

    if (input.category) {
      snippets = snippets.filter((s) => s.category === input.category);
    }

    if (input.language) {
      snippets = snippets.filter((s) => s.language === input.language);
    }

    const snippetEntries = snippets.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      language: s.language,
      tags: s.tags,
    }));

    const categories = [...new Set(this.snippets.map((s) => s.category))];
    const languages = [...new Set(this.snippets.map((s) => s.language))];

    return {
      snippets: snippetEntries,
      categories,
      languages,
    };
  }

  /**
   * Get all patterns (for internal use)
   */
  getPatterns(): Pattern[] {
    return this.patterns;
  }

  /**
   * Get tool definitions for MCP registration
   */
  static getToolDefinitions() {
    return [
      {
        name: 'search_library',
        description: 'Search the pattern/template/snippet library',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            type: {
              type: 'string',
              enum: ['all', 'patterns', 'templates', 'snippets'],
              description: 'Type to search',
            },
            category: { type: 'string', description: 'Filter by category' },
            limit: { type: 'number', description: 'Maximum results' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_pattern',
        description: 'Get a pattern definition by ID',
        inputSchema: {
          type: 'object',
          properties: {
            patternId: { type: 'string', description: 'Pattern ID' },
          },
          required: ['patternId'],
        },
      },
      {
        name: 'get_template',
        description: 'Get a template by ID',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', description: 'Template ID' },
          },
          required: ['templateId'],
        },
      },
      {
        name: 'get_snippet',
        description: 'Get a snippet by ID with optional variable substitution',
        inputSchema: {
          type: 'object',
          properties: {
            snippetId: { type: 'string', description: 'Snippet ID' },
            variables: { type: 'object', description: 'Variables to substitute' },
          },
          required: ['snippetId'],
        },
      },
      {
        name: 'preview_template',
        description: 'Preview a template with sample data',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', description: 'Template ID' },
            variables: { type: 'object', description: 'Variables for preview' },
          },
          required: ['templateId'],
        },
      },
      {
        name: 'list_patterns',
        description: 'List all available patterns',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Filter by category' },
          },
        },
      },
      {
        name: 'list_templates',
        description: 'List all available templates',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Filter by category' },
            language: { type: 'string', description: 'Filter by language' },
          },
        },
      },
      {
        name: 'list_snippets',
        description: 'List all available snippets',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Filter by category' },
            language: { type: 'string', description: 'Filter by language' },
          },
        },
      },
    ];
  }
}
