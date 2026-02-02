import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import {
  ProjectContext,
  DatabaseContext,
  AnalysisResult,
  ExtractedPattern,
  ExtractedTemplate,
  ExtractedSnippet,
  AnalysisStatistics,
  ModelInfo,
  ControllerInfo,
  ComponentInfo,
  HookInfo,
  TableInfo,
} from '../types.js';
import { RubyParser } from '../parsers/ruby.js';
import { TypeScriptParser } from '../parsers/typescript.js';
import { CssParser } from '../parsers/css.js';
import {
  fileExists,
  findFiles,
  readFile,
  ensureDirectory,
  camelize,
  underscore,
  pluralize,
} from '../utils/helpers.js';

/**
 * Code Analyzer for extracting patterns from existing codebases
 */
export class CodeAnalyzer {
  private rubyParser: RubyParser;
  private tsParser: TypeScriptParser;
  private cssParser: CssParser;
  private git: SimpleGit;

  constructor() {
    this.rubyParser = new RubyParser();
    this.tsParser = new TypeScriptParser();
    this.cssParser = new CssParser();
    this.git = simpleGit();
  }

  /**
   * Analyze a codebase (local path or git URL)
   */
  async analyzeCodebase(pathOrUrl: string): Promise<AnalysisResult> {
    let projectPath = pathOrUrl;
    let isTemporary = false;

    // Clone if it's a git URL
    if (this.isGitUrl(pathOrUrl)) {
      projectPath = await this.cloneRepository(pathOrUrl);
      isTemporary = true;
    }

    try {
      const context = await this.detectProjectContext(projectPath);

      const extractedPatterns = await this.extractPatterns(projectPath, context);
      const extractedTemplates = await this.extractTemplates(projectPath, context);
      const extractedSnippets = await this.extractSnippets(projectPath, context);
      const statistics = await this.gatherStatistics(projectPath);

      return {
        projectPath,
        analyzedAt: new Date(),
        context,
        extractedPatterns,
        extractedTemplates,
        extractedSnippets,
        statistics,
      };
    } finally {
      // Clean up temporary clone if needed
      if (isTemporary) {
        // In production, we'd delete the temp directory
        // For now, leave it for inspection
      }
    }
  }

  /**
   * Check if string is a git URL
   */
  private isGitUrl(str: string): boolean {
    return (
      str.startsWith('git@') ||
      str.startsWith('https://github.com') ||
      str.startsWith('https://gitlab.com') ||
      str.startsWith('git://')
    );
  }

  /**
   * Clone a git repository
   */
  private async cloneRepository(url: string): Promise<string> {
    const tempDir = path.join('/tmp', `rails-mcp-${Date.now()}`);
    await ensureDirectory(tempDir);

    await this.git.clone(url, tempDir, ['--depth', '1']);

    return tempDir;
  }

  /**
   * Detect project context
   */
  async detectProjectContext(projectPath: string): Promise<ProjectContext> {
    const [
      railsVersion,
      rubyVersion,
      reactVersion,
      typeScriptVersion,
      models,
      controllers,
      gems,
      concerns,
      components,
      hooks,
      cssFramework,
      customStyles,
      bundler,
      database,
      gitInfo,
    ] = await Promise.all([
      this.rubyParser.extractRailsVersion(projectPath),
      this.rubyParser.extractRubyVersion(projectPath),
      this.tsParser.extractReactVersion(projectPath),
      this.tsParser.extractTypeScriptVersion(projectPath),
      this.rubyParser.parseAllModels(projectPath),
      this.rubyParser.parseAllControllers(projectPath),
      this.rubyParser.parseGemfile(path.join(projectPath, 'Gemfile')),
      this.rubyParser.findConcerns(projectPath),
      this.tsParser.parseAllComponents(projectPath),
      this.tsParser.parseAllHooks(projectPath),
      this.cssParser.detectFramework(projectPath),
      this.cssParser.getAllCustomStyles(projectPath),
      this.tsParser.detectBundler(projectPath),
      this.detectDatabase(projectPath),
      this.getGitInfo(projectPath),
    ]);

    return {
      rootPath: projectPath,
      railsVersion,
      rubyVersion,
      reactVersion,
      typeScriptVersion,
      database,
      models,
      controllers,
      gems,
      concerns,
      components,
      hooks,
      cssFramework,
      customStyles,
      bundler,
      gitRemote: gitInfo?.remote,
      gitBranch: gitInfo?.branch,
    };
  }

  /**
   * Detect database configuration
   */
  private async detectDatabase(projectPath: string): Promise<DatabaseContext> {
    const config = await this.rubyParser.parseDatabaseConfig(projectPath);
    const schema = await this.rubyParser.parseSchema(projectPath);

    const adapter = this.normalizeAdapter(config?.adapter || 'unknown');

    const tables: TableInfo[] = schema.tables.map((tableName) => ({
      name: tableName,
      columns: (schema.columns[tableName] || []).map((col) => ({
        name: col,
        type: 'unknown',
        nullable: true,
      })),
      indexes: [],
      foreignKeys: [],
    }));

    return {
      adapter,
      tables,
    };
  }

  /**
   * Normalize database adapter name
   */
  private normalizeAdapter(
    adapter: string
  ): 'postgresql' | 'mysql' | 'sqlite' | 'unknown' {
    const normalized = adapter.toLowerCase();
    if (normalized.includes('postgres')) return 'postgresql';
    if (normalized.includes('mysql')) return 'mysql';
    if (normalized.includes('sqlite')) return 'sqlite';
    return 'unknown';
  }

  /**
   * Get git info
   */
  private async getGitInfo(
    projectPath: string
  ): Promise<{ remote?: string; branch?: string } | null> {
    try {
      const git = simpleGit(projectPath);
      const remotes = await git.getRemotes(true);
      const branch = await git.revparse(['--abbrev-ref', 'HEAD']);

      return {
        remote: remotes[0]?.refs?.fetch,
        branch: branch.trim(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract patterns from codebase
   */
  private async extractPatterns(
    projectPath: string,
    context: ProjectContext
  ): Promise<ExtractedPattern[]> {
    const patterns: ExtractedPattern[] = [];

    // Look for CRUD patterns
    const crudPatterns = this.identifyCrudPatterns(context);
    patterns.push(...crudPatterns);

    // Look for authentication patterns
    const authPattern = await this.identifyAuthPattern(context);
    if (authPattern) patterns.push(authPattern);

    // Look for file upload patterns
    const uploadPattern = await this.identifyUploadPattern(context);
    if (uploadPattern) patterns.push(uploadPattern);

    // Look for API patterns
    const apiPatterns = this.identifyApiPatterns(context);
    patterns.push(...apiPatterns);

    return patterns;
  }

  /**
   * Identify CRUD patterns from models and controllers
   */
  private identifyCrudPatterns(context: ProjectContext): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];

    for (const model of context.models) {
      // Find matching controller
      const controllerName = `${pluralize(model.name)}Controller`;
      const controller = context.controllers.find(
        (c) => c.name === controllerName
      );

      if (!controller) continue;

      // Check for standard CRUD actions
      const crudActions = ['index', 'show', 'new', 'create', 'edit', 'update', 'destroy'];
      const hasCrud = crudActions.filter((a) => controller.actions.includes(a));

      if (hasCrud.length >= 4) {
        patterns.push({
          suggestedId: `crud-${underscore(model.name)}`,
          name: `${model.name} CRUD`,
          description: `Full CRUD operations for ${model.name}`,
          sourceFiles: [model.filePath, controller.filePath],
          confidence: hasCrud.length / crudActions.length,
        });
      }
    }

    return patterns;
  }

  /**
   * Identify authentication pattern
   */
  private async identifyAuthPattern(
    context: ProjectContext
  ): Promise<ExtractedPattern | null> {
    // Check for Devise
    const hasDevise = context.gems.some((g) => g.name === 'devise');
    if (hasDevise) {
      return {
        suggestedId: 'auth-devise',
        name: 'Devise Authentication',
        description: 'User authentication using Devise gem',
        sourceFiles: ['Gemfile'],
        confidence: 1.0,
      };
    }

    // Check for custom auth
    const userModel = context.models.find(
      (m) => m.name.toLowerCase() === 'user'
    );
    const sessionsController = context.controllers.find(
      (c) => c.name.toLowerCase().includes('session')
    );

    if (userModel && sessionsController) {
      return {
        suggestedId: 'auth-custom',
        name: 'Custom Authentication',
        description: 'Custom authentication implementation',
        sourceFiles: [userModel.filePath, sessionsController.filePath],
        confidence: 0.8,
      };
    }

    return null;
  }

  /**
   * Identify file upload pattern
   */
  private async identifyUploadPattern(
    context: ProjectContext
  ): Promise<ExtractedPattern | null> {
    // Check for Active Storage
    const hasActiveStorage = context.gems.some(
      (g) => g.name === 'activestorage' || g.name === 'active_storage'
    );

    // Check for has_one_attached or has_many_attached in models
    const modelsWithAttachments = context.models.filter((m) =>
      m.associations.some((a) => a.type === 'has_one' || a.type === 'has_many')
    );

    if (hasActiveStorage || modelsWithAttachments.length > 0) {
      return {
        suggestedId: 'file-upload',
        name: 'File Upload',
        description: 'Active Storage file attachments',
        sourceFiles: modelsWithAttachments.map((m) => m.filePath),
        confidence: hasActiveStorage ? 1.0 : 0.6,
      };
    }

    return null;
  }

  /**
   * Identify API patterns
   */
  private identifyApiPatterns(context: ProjectContext): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];

    // Look for API namespace controllers
    const apiControllers = context.controllers.filter(
      (c) => c.namespace?.includes('Api') || c.name.includes('Api')
    );

    if (apiControllers.length > 0) {
      patterns.push({
        suggestedId: 'api-endpoints',
        name: 'API Endpoints',
        description: `${apiControllers.length} API controllers found`,
        sourceFiles: apiControllers.map((c) => c.filePath),
        confidence: 0.9,
      });
    }

    return patterns;
  }

  /**
   * Extract templates from codebase
   */
  private async extractTemplates(
    projectPath: string,
    context: ProjectContext
  ): Promise<ExtractedTemplate[]> {
    const templates: ExtractedTemplate[] = [];

    // Extract model templates
    for (const model of context.models) {
      const template = await this.extractModelTemplate(model);
      templates.push(template);
    }

    // Extract component templates
    for (const component of context.components) {
      const template = await this.extractComponentTemplate(component);
      templates.push(template);
    }

    return templates;
  }

  /**
   * Extract model template
   */
  private async extractModelTemplate(model: ModelInfo): Promise<ExtractedTemplate> {
    const content = await readFile(model.filePath);

    // Generalize the template
    const template = this.generalizeRubyCode(content, model.name);

    return {
      suggestedId: `model-${underscore(model.name)}`,
      name: `${model.name} Model`,
      category: 'model',
      sourceFile: model.filePath,
      generatedTemplate: template,
      variables: [
        { name: 'modelName', type: 'string', required: true },
        { name: 'associations', type: 'object', required: false },
        { name: 'validations', type: 'object', required: false },
      ],
      confidence: 0.7,
    };
  }

  /**
   * Generalize Ruby code into template
   */
  private generalizeRubyCode(code: string, className: string): string {
    let template = code;

    // Replace class name
    template = template.replace(
      new RegExp(`class\\s+${className}`, 'g'),
      'class <%= modelName %>'
    );

    // Replace table references
    const tableName = underscore(pluralize(className));
    template = template.replace(
      new RegExp(`:${tableName}`, 'g'),
      ':<%= tableize(modelName) %>'
    );

    return template;
  }

  /**
   * Extract component template
   */
  private async extractComponentTemplate(
    component: ComponentInfo
  ): Promise<ExtractedTemplate> {
    const content = await readFile(component.filePath);

    const template = this.generalizeTypeScriptCode(content, component.name);

    return {
      suggestedId: `component-${underscore(component.name)}`,
      name: `${component.name} Component`,
      category: 'component',
      sourceFile: component.filePath,
      generatedTemplate: template,
      variables: [
        { name: 'componentName', type: 'string', required: true },
        { name: 'props', type: 'array', required: false },
      ],
      confidence: 0.7,
    };
  }

  /**
   * Generalize TypeScript code into template
   */
  private generalizeTypeScriptCode(code: string, componentName: string): string {
    let template = code;

    // Replace component name
    template = template.replace(
      new RegExp(`\\b${componentName}\\b`, 'g'),
      '<%= componentName %>'
    );

    return template;
  }

  /**
   * Extract snippets from codebase
   */
  private async extractSnippets(
    projectPath: string,
    context: ProjectContext
  ): Promise<ExtractedSnippet[]> {
    const snippets: ExtractedSnippet[] = [];

    // Extract validation snippets
    const validationSnippets = this.extractValidationSnippets(context.models);
    snippets.push(...validationSnippets);

    // Extract association snippets
    const associationSnippets = this.extractAssociationSnippets(context.models);
    snippets.push(...associationSnippets);

    // Extract hook snippets
    const hookSnippets = this.extractHookSnippets(context.hooks);
    snippets.push(...hookSnippets);

    return snippets;
  }

  /**
   * Extract validation snippets from models
   */
  private extractValidationSnippets(models: ModelInfo[]): ExtractedSnippet[] {
    const snippets: ExtractedSnippet[] = [];
    const validationCounts = new Map<string, number>();

    for (const model of models) {
      for (const validation of model.validations) {
        const key = validation.type;
        validationCounts.set(key, (validationCounts.get(key) || 0) + 1);
      }
    }

    for (const [type, count] of validationCounts) {
      if (count >= 2) {
        snippets.push({
          suggestedId: `validation-${type}`,
          name: `${camelize(type)} Validation`,
          category: 'validation',
          sourceFile: 'multiple',
          code: `validates :{{field}}, ${type}: true`,
          usageCount: count,
          confidence: Math.min(count / 5, 1),
        });
      }
    }

    return snippets;
  }

  /**
   * Extract association snippets from models
   */
  private extractAssociationSnippets(models: ModelInfo[]): ExtractedSnippet[] {
    const snippets: ExtractedSnippet[] = [];
    const associationPatterns = new Map<string, { count: number; example: string }>();

    for (const model of models) {
      for (const assoc of model.associations) {
        const key = assoc.type;
        const example = `${assoc.type} :${assoc.name}`;

        const existing = associationPatterns.get(key);
        if (existing) {
          existing.count++;
        } else {
          associationPatterns.set(key, { count: 1, example });
        }
      }
    }

    for (const [type, data] of associationPatterns) {
      snippets.push({
        suggestedId: `association-${type.replace(/_/g, '-')}`,
        name: `${camelize(type)} Association`,
        category: 'association',
        sourceFile: 'multiple',
        code: `${type} :{{name}}`,
        usageCount: data.count,
        confidence: Math.min(data.count / 5, 1),
      });
    }

    return snippets;
  }

  /**
   * Extract hook snippets
   */
  private extractHookSnippets(hooks: HookInfo[]): ExtractedSnippet[] {
    return hooks.map((hook) => ({
      suggestedId: `hook-${underscore(hook.name)}`,
      name: hook.name,
      category: 'hook',
      sourceFile: hook.filePath,
      code: `import { ${hook.name} } from './hooks/${hook.name}'`,
      usageCount: 1,
      confidence: 0.5,
    }));
  }

  /**
   * Gather statistics about the codebase
   */
  private async gatherStatistics(projectPath: string): Promise<AnalysisStatistics> {
    const [rubyFiles, tsFiles, cssFiles] = await Promise.all([
      findFiles('**/*.rb', projectPath),
      findFiles('**/*.{ts,tsx}', projectPath),
      findFiles('**/*.{css,scss}', projectPath),
    ]);

    const models = await this.rubyParser.parseAllModels(projectPath);
    const controllers = await this.rubyParser.parseAllControllers(projectPath);
    const components = await this.tsParser.parseAllComponents(projectPath);
    const hooks = await this.tsParser.parseAllHooks(projectPath);

    return {
      totalFiles: rubyFiles.length + tsFiles.length + cssFiles.length,
      rubyFiles: rubyFiles.length,
      typeScriptFiles: tsFiles.length,
      cssFiles: cssFiles.length,
      modelsFound: models.length,
      controllersFound: controllers.length,
      componentsFound: components.length,
      hooksFound: hooks.length,
    };
  }

  /**
   * Analyze models specifically
   */
  async analyzeModels(projectPath: string): Promise<ModelInfo[]> {
    return this.rubyParser.parseAllModels(projectPath);
  }

  /**
   * Analyze components specifically
   */
  async analyzeComponents(projectPath: string): Promise<ComponentInfo[]> {
    return this.tsParser.parseAllComponents(projectPath);
  }

  /**
   * Analyze controllers specifically
   */
  async analyzeControllers(projectPath: string): Promise<ControllerInfo[]> {
    return this.rubyParser.parseAllControllers(projectPath);
  }

  /**
   * Analyze styles specifically
   */
  async analyzeStyles(projectPath: string): Promise<{
    framework: string;
    classes: string[];
    variables: Record<string, string>;
  }> {
    const framework = await this.cssParser.detectFramework(projectPath);
    const classes = await this.cssParser.getAllCustomStyles(projectPath);
    const colorPalette = await this.cssParser.extractColorPalette(projectPath);

    return {
      framework,
      classes,
      variables: colorPalette,
    };
  }

  /**
   * Batch analyze multiple codebases
   */
  async batchAnalyze(pathsOrUrls: string[]): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];

    for (const pathOrUrl of pathsOrUrls) {
      try {
        const result = await this.analyzeCodebase(pathOrUrl);
        results.push(result);
      } catch (error) {
        console.error(`Failed to analyze ${pathOrUrl}:`, error);
      }
    }

    return results;
  }
}
