import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'yaml';

import { WorkflowTools } from './tools/workflow.js';
import { LibraryTools } from './tools/library.js';
import { AnalysisTools } from './tools/analysis.js';
import { LearningTools } from './tools/learning.js';
import { DatabaseTools } from './tools/database.js';
import { GenerationTools } from './tools/generation.js';
import { ServerConfig } from './types.js';

/**
 * Rails Dev MCP Server
 */
export class RailsDevServer {
  private server: Server;
  private libraryPath: string;
  private config: ServerConfig;

  // Tools
  private workflowTools!: WorkflowTools;
  private libraryTools!: LibraryTools;
  private analysisTools!: AnalysisTools;
  private learningTools!: LearningTools;
  private databaseTools!: DatabaseTools;
  private generationTools!: GenerationTools;

  constructor(libraryPath?: string, configPath?: string) {
    // Determine library path
    this.libraryPath = libraryPath || path.join(process.cwd(), 'library');

    // Load configuration
    this.config = this.loadConfig(configPath);

    // Initialize server
    this.server = new Server(
      {
        name: 'rails-dev-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.initializeTools();
    this.setupHandlers();
  }

  /**
   * Load configuration from file
   */
  private loadConfig(configPath?: string): ServerConfig {
    const defaultConfig: ServerConfig = {
      libraryPath: this.libraryPath,
      analysis: {
        maxFileSize: 1024 * 1024, // 1MB
        excludePatterns: ['node_modules/**', 'vendor/**', '.git/**'],
        includePatterns: ['**/*.rb', '**/*.ts', '**/*.tsx', '**/*.css', '**/*.scss'],
      },
      learning: {
        autoPropose: true,
        minConfidence: 0.5,
        requireReview: true,
      },
    };

    if (configPath && fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const fileConfig = yaml.parse(content);
        return { ...defaultConfig, ...fileConfig };
      } catch {
        console.error('Failed to load config file, using defaults');
      }
    }

    return defaultConfig;
  }

  /**
   * Initialize all tools
   */
  private initializeTools(): void {
    this.libraryTools = new LibraryTools(this.libraryPath);
    this.workflowTools = new WorkflowTools(this.libraryPath);
    this.analysisTools = new AnalysisTools();
    this.learningTools = new LearningTools(this.libraryPath);
    this.databaseTools = new DatabaseTools();
    this.generationTools = new GenerationTools(this.libraryPath, this.libraryTools);

    // Configure database if settings provided
    if (this.config.database) {
      this.databaseTools.configure(this.config.database);
    }
  }

  /**
   * Setup MCP handlers
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [
        ...WorkflowTools.getToolDefinitions(),
        ...LibraryTools.getToolDefinitions(),
        ...AnalysisTools.getToolDefinitions(),
        ...LearningTools.getToolDefinitions(),
        ...DatabaseTools.getToolDefinitions(),
        ...GenerationTools.getToolDefinitions(),
      ];

      return { tools };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.handleToolCall(name, args || {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const err = error as Error;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: err.message }),
            },
          ],
          isError: true,
        };
      }
    });

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'library://patterns',
            name: 'Pattern Index',
            description: 'Index of all available patterns',
            mimeType: 'application/json',
          },
          {
            uri: 'library://templates',
            name: 'Template Index',
            description: 'Index of all available templates',
            mimeType: 'application/json',
          },
          {
            uri: 'library://snippets',
            name: 'Snippet Index',
            description: 'Index of all available snippets',
            mimeType: 'application/json',
          },
        ],
      };
    });

    // Read resource handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        const content = await this.handleResourceRead(uri);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(content, null, 2),
            },
          ],
        };
      } catch (error) {
        const err = error as Error;
        throw new Error(`Failed to read resource: ${err.message}`);
      }
    });
  }

  /**
   * Handle tool calls
   */
  private async handleToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    // Workflow tools
    switch (name) {
      case 'identify_intent':
        return this.workflowTools.identifyIntent(args as any);
      case 'start_workflow':
        return this.workflowTools.startWorkflow(args as any);
      case 'answer_workflow_step':
        return this.workflowTools.answerStep(args as any);
      case 'execute_workflow':
        return this.workflowTools.executeWorkflow(args as any);
      case 'cancel_workflow':
        return this.workflowTools.cancelWorkflow(args as any);
    }

    // Library tools
    switch (name) {
      case 'search_library':
        return this.libraryTools.searchLibrary(args as any);
      case 'get_pattern':
        return this.libraryTools.getPattern(args as any);
      case 'get_template':
        return this.libraryTools.getTemplate(args as any);
      case 'get_snippet':
        return this.libraryTools.getSnippet(args as any);
      case 'preview_template':
        return this.libraryTools.previewTemplate(args as any);
      case 'list_patterns':
        return this.libraryTools.listPatterns(args as any);
      case 'list_templates':
        return this.libraryTools.listTemplates(args as any);
      case 'list_snippets':
        return this.libraryTools.listSnippets(args as any);
    }

    // Analysis tools
    switch (name) {
      case 'detect_project_context':
        return this.analysisTools.detectProjectContext(args as any);
      case 'analyze_codebase':
        return this.analysisTools.analyzeCodebase(args as any);
      case 'analyze_models':
        return this.analysisTools.analyzeModels(args as any);
      case 'analyze_components':
        return this.analysisTools.analyzeComponents(args as any);
      case 'analyze_controllers':
        return this.analysisTools.analyzeControllers(args as any);
      case 'analyze_styles':
        return this.analysisTools.analyzeStyles(args as any);
      case 'batch_analyze':
        return this.analysisTools.batchAnalyze(args as any);
    }

    // Learning tools
    switch (name) {
      case 'analyze_implementation':
        return this.learningTools.analyzeImplementation(args as any);
      case 'propose_contribution':
        return this.learningTools.proposeContribution(args as any);
      case 'review_contributions':
        return this.learningTools.listPendingContributions(args as any);
      case 'get_contribution':
        return this.learningTools.getContribution(args as any);
      case 'approve_contribution':
        return this.learningTools.approveContribution(args as any);
      case 'reject_contribution':
        return this.learningTools.rejectContribution(args as any);
      case 'contribution_stats':
        return this.learningTools.getContributionStats();
    }

    // Database tools
    switch (name) {
      case 'query_database':
        return this.databaseTools.queryDatabase(args as any);
      case 'list_tables':
        return this.databaseTools.listTables(args as any);
      case 'describe_table':
        return this.databaseTools.describeTable(args as any);
      case 'analyze_query':
        return this.databaseTools.analyzeQuery(args as any);
      case 'table_stats':
        return this.databaseTools.getTableStats(args as any);
    }

    // Generation tools
    switch (name) {
      case 'generate_from_template':
        return this.generationTools.generateFromTemplate(args as any);
      case 'generate_multiple':
        return this.generationTools.generateMultiple(args as any);
      case 'generate_from_pattern':
        return this.generationTools.generateFromPattern(args as any);
      case 'render_snippet':
        return this.generationTools.renderSnippet(args as any);
      case 'validate_template_variables':
        return this.generationTools.validateTemplateVariables(args as any);
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  /**
   * Handle resource reads
   */
  private async handleResourceRead(uri: string): Promise<unknown> {
    const parsed = new URL(uri);

    if (parsed.protocol !== 'library:') {
      throw new Error(`Unknown protocol: ${parsed.protocol}`);
    }

    const path = parsed.pathname.replace(/^\/\//, '');

    switch (path) {
      case 'patterns':
        return this.libraryTools.listPatterns({});
      case 'templates':
        return this.libraryTools.listTemplates({});
      case 'snippets':
        return this.libraryTools.listSnippets({});
    }

    // Handle pattern/template/snippet by ID
    if (path.startsWith('pattern/')) {
      const id = path.replace('pattern/', '');
      return this.libraryTools.getPattern({ patternId: id });
    }

    if (path.startsWith('template/')) {
      const id = path.replace('template/', '');
      return this.libraryTools.getTemplate({ templateId: id });
    }

    if (path.startsWith('snippet/')) {
      const id = path.replace('snippet/', '');
      return this.libraryTools.getSnippet({ snippetId: id });
    }

    throw new Error(`Unknown resource: ${uri}`);
  }

  /**
   * Initialize and load library
   */
  async initialize(): Promise<void> {
    await this.libraryTools.loadLibrary();
    await this.learningTools.initialize();

    // Load patterns into workflow tools
    const patterns = this.libraryTools.getPatterns();
    await this.workflowTools.loadPatterns(patterns);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    await this.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('Rails Dev MCP server started');
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    await this.databaseTools.close();
    await this.server.close();
  }
}

/**
 * Create and start the server
 */
export async function createServer(
  libraryPath?: string,
  configPath?: string
): Promise<RailsDevServer> {
  const server = new RailsDevServer(libraryPath, configPath);
  await server.start();
  return server;
}
