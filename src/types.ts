// Core data structures for the Rails MCP Server

// ============ Pattern & Workflow Types ============

export interface Pattern {
  id: string;
  name: string;
  description: string;
  category: PatternCategory;
  triggers: string[];           // Keywords/phrases that match this pattern
  workflow: WorkflowDefinition;
  templates: string[];          // Template IDs to use
  snippets: string[];           // Snippet IDs to include
  instructions?: string[];      // Post-generation instructions
  version: string;
  tags: string[];
}

export type PatternCategory =
  | 'model'
  | 'controller'
  | 'view'
  | 'component'
  | 'authentication'
  | 'authorization'
  | 'api'
  | 'background-job'
  | 'migration'
  | 'full-stack';

export interface WorkflowDefinition {
  id: string;
  steps: WorkflowStep[];
  context_requirements: ContextRequirement[];
}

export interface WorkflowStep {
  id: string;
  question: string;
  type: 'single_select' | 'multi_select' | 'text' | 'confirm';
  options?: WorkflowOption[];
  condition?: string;           // JavaScript expression for conditional display
  default?: string | string[];
  affects: ('templates' | 'snippets' | 'instructions')[];
  validation?: string;          // JavaScript expression for validation
}

export interface WorkflowOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
  templates?: string[];         // Additional templates when selected
  snippets?: string[];          // Additional snippets when selected
}

export interface ContextRequirement {
  type: 'model' | 'component' | 'gem' | 'table' | 'file';
  name?: string;                // Specific name to detect
  pattern?: string;             // Glob pattern
  optional?: boolean;
}

// ============ Template Types ============

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  language: 'ruby' | 'typescript' | 'javascript' | 'css' | 'erb' | 'yaml' | 'json';
  filePath: string;             // Relative path to template file
  outputPath: string;           // EJS template for output path
  variables: TemplateVariable[];
  version: string;
  tags: string[];
}

export type TemplateCategory =
  | 'model'
  | 'migration'
  | 'controller'
  | 'view'
  | 'component'
  | 'hook'
  | 'service'
  | 'job'
  | 'test'
  | 'config';

export interface TemplateVariable {
  name: string;
  type: 'string' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface RenderedTemplate {
  path: string;
  content: string;
  template: Template;
}

// ============ Snippet Types ============

export interface Snippet {
  id: string;
  name: string;
  description: string;
  category: SnippetCategory;
  language: string;
  code: string;
  context?: string;             // Where this snippet is typically used
  dependencies?: string[];      // Required gems/packages
  variables?: SnippetVariable[];
  tags: string[];
  examples?: SnippetExample[];
}

export type SnippetCategory =
  | 'validation'
  | 'association'
  | 'scope'
  | 'callback'
  | 'concern'
  | 'helper'
  | 'hook'
  | 'component'
  | 'style'
  | 'api'
  | 'authentication'
  | 'authorization';

export interface SnippetVariable {
  name: string;
  description: string;
  example?: string;
}

export interface SnippetExample {
  description: string;
  variables: Record<string, unknown>;
  output: string;
}

// ============ Workflow Runtime Types ============

export interface WorkflowState {
  id: string;
  patternId: string;
  currentStepIndex: number;
  answers: Record<string, unknown>;
  context: ProjectContext;
  status: 'in_progress' | 'ready' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStepResult {
  stepId: string;
  answer: unknown;
  timestamp: Date;
}

// ============ Project Context Types ============

export interface ProjectContext {
  rootPath: string;
  railsVersion?: string;
  rubyVersion?: string;
  reactVersion?: string;
  typeScriptVersion?: string;

  // Database
  database: DatabaseContext;

  // Rails specifics
  models: ModelInfo[];
  controllers: ControllerInfo[];
  gems: GemInfo[];
  concerns: string[];

  // React/Frontend
  components: ComponentInfo[];
  hooks: HookInfo[];

  // Styling
  cssFramework: CssFramework;
  customStyles: string[];

  // Build tools
  bundler: 'webpack' | 'vite' | 'esbuild' | 'importmap' | 'unknown';

  // Git info
  gitRemote?: string;
  gitBranch?: string;
}

export interface DatabaseContext {
  adapter: 'postgresql' | 'mysql' | 'sqlite' | 'unknown';
  tables: TableInfo[];
  connectionConfig?: {
    host?: string;
    port?: number;
    database?: string;
  };
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  primaryKey?: boolean;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ForeignKeyInfo {
  column: string;
  referencesTable: string;
  referencesColumn: string;
}

export interface ModelInfo {
  name: string;
  tableName: string;
  filePath: string;
  associations: AssociationInfo[];
  validations: ValidationInfo[];
  scopes: ScopeInfo[];
  callbacks: string[];
  concerns: string[];
}

export interface AssociationInfo {
  type: 'belongs_to' | 'has_one' | 'has_many' | 'has_and_belongs_to_many';
  name: string;
  options: Record<string, unknown>;
}

export interface ValidationInfo {
  type: string;
  fields: string[];
  options: Record<string, unknown>;
}

export interface ScopeInfo {
  name: string;
  body: string;
}

export interface ControllerInfo {
  name: string;
  filePath: string;
  actions: string[];
  beforeActions: string[];
  namespace?: string;
}

export interface GemInfo {
  name: string;
  version?: string;
  group?: string;
}

export interface ComponentInfo {
  name: string;
  filePath: string;
  type: 'functional' | 'class';
  props: PropInfo[];
  hooks: string[];
  cssClasses: string[];
}

export interface PropInfo {
  name: string;
  type?: string;
  required: boolean;
  defaultValue?: string;
}

export interface HookInfo {
  name: string;
  filePath: string;
  dependencies: string[];
  returnType?: string;
}

export type CssFramework = 'bootstrap' | 'tailwind' | 'none' | 'custom';

// ============ Learning/Contribution Types ============

export interface Contribution {
  id: string;
  type: 'pattern' | 'template' | 'snippet';
  status: 'pending' | 'approved' | 'rejected';
  source: ContributionSource;
  content: Pattern | Template | Snippet;
  metadata: ContributionMetadata;
  createdAt: Date;
  reviewedAt?: Date;
  reviewNotes?: string;
}

export interface ContributionSource {
  type: 'analysis' | 'implementation' | 'manual';
  projectPath?: string;
  gitUrl?: string;
  files: string[];
}

export interface ContributionMetadata {
  extractedFrom: string;
  similarity?: number;          // Similarity to existing patterns (0-1)
  usageCount?: number;
  qualityScore?: number;
}

// ============ Analysis Types ============

export interface AnalysisResult {
  projectPath: string;
  analyzedAt: Date;
  context: ProjectContext;
  extractedPatterns: ExtractedPattern[];
  extractedTemplates: ExtractedTemplate[];
  extractedSnippets: ExtractedSnippet[];
  statistics: AnalysisStatistics;
}

export interface ExtractedPattern {
  suggestedId: string;
  name: string;
  description: string;
  sourceFiles: string[];
  confidence: number;
  existingSimilar?: string;     // ID of similar existing pattern
}

export interface ExtractedTemplate {
  suggestedId: string;
  name: string;
  category: TemplateCategory;
  sourceFile: string;
  generatedTemplate: string;
  variables: TemplateVariable[];
  confidence: number;
}

export interface ExtractedSnippet {
  suggestedId: string;
  name: string;
  category: SnippetCategory;
  sourceFile: string;
  code: string;
  usageCount: number;
  confidence: number;
}

export interface AnalysisStatistics {
  totalFiles: number;
  rubyFiles: number;
  typeScriptFiles: number;
  cssFiles: number;
  modelsFound: number;
  controllersFound: number;
  componentsFound: number;
  hooksFound: number;
}

// ============ Database Query Types ============

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: QueryField[];
  executionTime: number;
}

export interface QueryField {
  name: string;
  type: string;
}

export interface QueryExplanation {
  plan: string;
  executionTime: number;
  planningTime: number;
  suggestions?: string[];
}

// ============ Tool Response Types ============

export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

export interface IntentMatch {
  patternId: string;
  confidence: number;
  matchedTriggers: string[];
  alternativePatterns?: {
    patternId: string;
    confidence: number;
  }[];
}

export interface WorkflowStartResult {
  workflowId: string;
  patternName: string;
  currentStep: WorkflowStep;
  context: ProjectContext;
  recommendations: Record<string, unknown>;
}

export interface WorkflowStepResponse {
  completed: boolean;
  nextStep?: WorkflowStep;
  summary?: WorkflowSummary;
  validationError?: string;
}

export interface WorkflowSummary {
  patternName: string;
  answers: Record<string, unknown>;
  filesToGenerate: string[];
  instructions: string[];
}

export interface ExecutionResult {
  success: boolean;
  generatedFiles: GeneratedFile[];
  modifiedFiles: ModifiedFile[];
  instructions: string[];
  errors?: string[];
}

export interface GeneratedFile {
  path: string;
  content: string;
  template: string;
}

export interface ModifiedFile {
  path: string;
  changes: string;
}

// ============ Library Index Types ============

export interface LibraryIndex {
  patterns: PatternIndexEntry[];
  templates: TemplateIndexEntry[];
  snippets: SnippetIndexEntry[];
  lastUpdated: Date;
}

export interface PatternIndexEntry {
  id: string;
  name: string;
  category: PatternCategory;
  triggers: string[];
  tags: string[];
}

export interface TemplateIndexEntry {
  id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  tags: string[];
}

export interface SnippetIndexEntry {
  id: string;
  name: string;
  category: SnippetCategory;
  language: string;
  tags: string[];
}

// ============ Configuration Types ============

export interface ServerConfig {
  libraryPath: string;
  database?: DatabaseConfig;
  analysis?: AnalysisConfig;
  learning?: LearningConfig;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

export interface AnalysisConfig {
  maxFileSize: number;
  excludePatterns: string[];
  includePatterns: string[];
}

export interface LearningConfig {
  autoPropose: boolean;
  minConfidence: number;
  requireReview: boolean;
}
