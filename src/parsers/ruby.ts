import {
  ModelInfo,
  ControllerInfo,
  AssociationInfo,
  ValidationInfo,
  ScopeInfo,
  GemInfo,
} from '../types.js';
import { readFile, findFiles, classify, tableize } from '../utils/helpers.js';
import * as path from 'path';

/**
 * Ruby/Rails code parser
 * Uses regex-based parsing for reliability without native dependencies
 */
export class RubyParser {
  /**
   * Parse a Ruby model file
   */
  async parseModel(filePath: string): Promise<ModelInfo | null> {
    try {
      const content = await readFile(filePath);
      return this.parseModelContent(content, filePath);
    } catch {
      return null;
    }
  }

  /**
   * Parse model content
   */
  parseModelContent(content: string, filePath: string): ModelInfo | null {
    // Extract class name
    const classMatch = content.match(
      /class\s+(\w+)\s*<\s*(?:ApplicationRecord|ActiveRecord::Base)/
    );
    if (!classMatch) return null;

    const name = classMatch[1];

    return {
      name,
      tableName: tableize(name),
      filePath,
      associations: this.extractAssociations(content),
      validations: this.extractValidations(content),
      scopes: this.extractScopes(content),
      callbacks: this.extractCallbacks(content),
      concerns: this.extractConcerns(content),
    };
  }

  /**
   * Extract associations from model content
   */
  private extractAssociations(content: string): AssociationInfo[] {
    const associations: AssociationInfo[] = [];

    const patterns = [
      { type: 'belongs_to', regex: /belongs_to\s+:(\w+)(?:,\s*(.+))?$/gm },
      { type: 'has_one', regex: /has_one\s+:(\w+)(?:,\s*(.+))?$/gm },
      { type: 'has_many', regex: /has_many\s+:(\w+)(?:,\s*(.+))?$/gm },
      {
        type: 'has_and_belongs_to_many',
        regex: /has_and_belongs_to_many\s+:(\w+)(?:,\s*(.+))?$/gm,
      },
    ];

    for (const { type, regex } of patterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        const optionsStr = match[2];
        const options = optionsStr ? this.parseRubyOptions(optionsStr) : {};

        associations.push({
          type: type as AssociationInfo['type'],
          name,
          options,
        });
      }
    }

    return associations;
  }

  /**
   * Extract validations from model content
   */
  private extractValidations(content: string): ValidationInfo[] {
    const validations: ValidationInfo[] = [];

    // Match validates :field, type: options
    const validateRegex =
      /validates\s+(:[\w,\s]+),\s*(\w+)(?::\s*(?:\{[^}]+\}|[^,\n]+))?/gm;
    let match;

    while ((match = validateRegex.exec(content)) !== null) {
      const fieldsStr = match[1];
      const type = match[2];

      const fields = fieldsStr
        .split(',')
        .map((f) => f.trim().replace(/^:/, ''))
        .filter((f) => f);

      validations.push({
        type,
        fields,
        options: {},
      });
    }

    // Match validates_presence_of, validates_uniqueness_of, etc.
    const helperRegex = /validates_(\w+)_of\s+(:[\w,\s]+)/gm;
    while ((match = helperRegex.exec(content)) !== null) {
      const type = match[1];
      const fieldsStr = match[2];

      const fields = fieldsStr
        .split(',')
        .map((f) => f.trim().replace(/^:/, ''))
        .filter((f) => f);

      validations.push({
        type,
        fields,
        options: {},
      });
    }

    return validations;
  }

  /**
   * Extract scopes from model content
   */
  private extractScopes(content: string): ScopeInfo[] {
    const scopes: ScopeInfo[] = [];

    const scopeRegex = /scope\s+:(\w+),\s*(->.+?)(?=\n\s*(?:scope|validates|belongs_to|has_|def|private|protected|end|$))/gms;
    let match;

    while ((match = scopeRegex.exec(content)) !== null) {
      scopes.push({
        name: match[1],
        body: match[2].trim(),
      });
    }

    return scopes;
  }

  /**
   * Extract callbacks from model content
   */
  private extractCallbacks(content: string): string[] {
    const callbacks: string[] = [];

    const callbackTypes = [
      'before_validation',
      'after_validation',
      'before_save',
      'around_save',
      'after_save',
      'before_create',
      'around_create',
      'after_create',
      'before_update',
      'around_update',
      'after_update',
      'before_destroy',
      'around_destroy',
      'after_destroy',
      'after_commit',
      'after_rollback',
    ];

    for (const callbackType of callbackTypes) {
      const regex = new RegExp(`${callbackType}\\s+:(\\w+)`, 'g');
      let match;
      while ((match = regex.exec(content)) !== null) {
        callbacks.push(`${callbackType} :${match[1]}`);
      }
    }

    return callbacks;
  }

  /**
   * Extract included concerns
   */
  private extractConcerns(content: string): string[] {
    const concerns: string[] = [];

    const includeRegex = /include\s+(\w+(?:::\w+)*)/g;
    let match;

    while ((match = includeRegex.exec(content)) !== null) {
      concerns.push(match[1]);
    }

    return concerns;
  }

  /**
   * Parse a Ruby controller file
   */
  async parseController(filePath: string): Promise<ControllerInfo | null> {
    try {
      const content = await readFile(filePath);
      return this.parseControllerContent(content, filePath);
    } catch {
      return null;
    }
  }

  /**
   * Parse controller content
   */
  parseControllerContent(
    content: string,
    filePath: string
  ): ControllerInfo | null {
    const classMatch = content.match(
      /class\s+(\w+(?:::\w+)*)Controller\s*<\s*(?:ApplicationController|ActionController::(?:Base|API))/
    );
    if (!classMatch) return null;

    const fullName = classMatch[1];
    const parts = fullName.split('::');
    const name = parts[parts.length - 1];
    const namespace = parts.length > 1 ? parts.slice(0, -1).join('::') : undefined;

    return {
      name: `${name}Controller`,
      filePath,
      actions: this.extractActions(content),
      beforeActions: this.extractBeforeActions(content),
      namespace,
    };
  }

  /**
   * Extract controller actions
   */
  private extractActions(content: string): string[] {
    const actions: string[] = [];

    // Match public method definitions before private/protected
    const publicSection = content.split(/\n\s*(?:private|protected)\s*\n/)[0];

    const defRegex = /def\s+(\w+)/g;
    let match;

    while ((match = defRegex.exec(publicSection)) !== null) {
      const methodName = match[1];
      // Exclude common non-action methods
      if (!methodName.startsWith('_') && methodName !== 'initialize') {
        actions.push(methodName);
      }
    }

    return actions;
  }

  /**
   * Extract before_action callbacks
   */
  private extractBeforeActions(content: string): string[] {
    const beforeActions: string[] = [];

    const regex = /before_action\s+:(\w+)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      beforeActions.push(match[1]);
    }

    return beforeActions;
  }

  /**
   * Parse Gemfile
   */
  async parseGemfile(gemfilePath: string): Promise<GemInfo[]> {
    try {
      const content = await readFile(gemfilePath);
      return this.parseGemfileContent(content);
    } catch {
      return [];
    }
  }

  /**
   * Parse Gemfile content
   */
  parseGemfileContent(content: string): GemInfo[] {
    const gems: GemInfo[] = [];
    let currentGroup: string | undefined;

    const lines = content.split('\n');

    for (const line of lines) {
      // Track groups
      const groupMatch = line.match(/group\s+:(\w+)/);
      if (groupMatch) {
        currentGroup = groupMatch[1];
        continue;
      }

      if (line.trim() === 'end') {
        currentGroup = undefined;
        continue;
      }

      // Match gem declarations
      const gemMatch = line.match(
        /gem\s+['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?/
      );
      if (gemMatch) {
        gems.push({
          name: gemMatch[1],
          version: gemMatch[2],
          group: currentGroup,
        });
      }
    }

    return gems;
  }

  /**
   * Parse Ruby options string into object
   */
  private parseRubyOptions(optionsStr: string): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    // Simple key: value parsing
    const optionRegex = /(\w+):\s*(?::(\w+)|['"]([^'"]+)['"]|(\w+))/g;
    let match;

    while ((match = optionRegex.exec(optionsStr)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || match[4];
      options[key] = value;
    }

    return options;
  }

  /**
   * Extract Rails version from Gemfile.lock
   */
  async extractRailsVersion(projectPath: string): Promise<string | undefined> {
    try {
      const lockPath = path.join(projectPath, 'Gemfile.lock');
      const content = await readFile(lockPath);

      const match = content.match(/rails\s+\(([^)]+)\)/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract Ruby version from .ruby-version or Gemfile
   */
  async extractRubyVersion(projectPath: string): Promise<string | undefined> {
    try {
      const rubyVersionPath = path.join(projectPath, '.ruby-version');
      const content = await readFile(rubyVersionPath);
      return content.trim();
    } catch {
      try {
        const gemfilePath = path.join(projectPath, 'Gemfile');
        const content = await readFile(gemfilePath);
        const match = content.match(/ruby\s+['"]([^'"]+)['"]/);
        return match ? match[1] : undefined;
      } catch {
        return undefined;
      }
    }
  }

  /**
   * Parse all models in a Rails project
   */
  async parseAllModels(projectPath: string): Promise<ModelInfo[]> {
    const modelFiles = await findFiles('app/models/**/*.rb', projectPath);
    const models: ModelInfo[] = [];

    for (const file of modelFiles) {
      // Skip concerns and application_record
      if (file.includes('/concerns/') || file.endsWith('application_record.rb')) {
        continue;
      }

      const model = await this.parseModel(file);
      if (model) {
        models.push(model);
      }
    }

    return models;
  }

  /**
   * Parse all controllers in a Rails project
   */
  async parseAllControllers(projectPath: string): Promise<ControllerInfo[]> {
    const controllerFiles = await findFiles(
      'app/controllers/**/*_controller.rb',
      projectPath
    );
    const controllers: ControllerInfo[] = [];

    for (const file of controllerFiles) {
      if (file.endsWith('application_controller.rb')) {
        continue;
      }

      const controller = await this.parseController(file);
      if (controller) {
        controllers.push(controller);
      }
    }

    return controllers;
  }

  /**
   * Find all concerns
   */
  async findConcerns(projectPath: string): Promise<string[]> {
    const concernFiles = await findFiles(
      'app/models/concerns/**/*.rb',
      projectPath
    );

    const concerns: string[] = [];

    for (const file of concernFiles) {
      const content = await readFile(file);
      const match = content.match(/module\s+(\w+)/);
      if (match) {
        concerns.push(match[1]);
      }
    }

    return concerns;
  }

  /**
   * Parse database.yml for connection info
   */
  async parseDatabaseConfig(
    projectPath: string
  ): Promise<{ adapter: string; database?: string } | null> {
    try {
      const configPath = path.join(projectPath, 'config', 'database.yml');
      const content = await readFile(configPath);

      // Simple YAML parsing for adapter
      const adapterMatch = content.match(/adapter:\s*(\w+)/);
      const databaseMatch = content.match(/database:\s*(\S+)/);

      if (adapterMatch) {
        return {
          adapter: adapterMatch[1],
          database: databaseMatch ? databaseMatch[1] : undefined,
        };
      }
    } catch {
      // Ignore errors
    }

    return null;
  }

  /**
   * Extract schema info from db/schema.rb
   */
  async parseSchema(
    projectPath: string
  ): Promise<{ tables: string[]; columns: Record<string, string[]> }> {
    try {
      const schemaPath = path.join(projectPath, 'db', 'schema.rb');
      const content = await readFile(schemaPath);

      const tables: string[] = [];
      const columns: Record<string, string[]> = {};

      const tableRegex = /create_table\s+"(\w+)"/g;
      let match;

      while ((match = tableRegex.exec(content)) !== null) {
        tables.push(match[1]);
      }

      // Extract columns for each table
      const tableBlocks = content.split(/create_table/);
      for (const block of tableBlocks.slice(1)) {
        const tableMatch = block.match(/"(\w+)"/);
        if (!tableMatch) continue;

        const tableName = tableMatch[1];
        const cols: string[] = [];

        const colRegex = /t\.(\w+)\s+"(\w+)"/g;
        while ((match = colRegex.exec(block)) !== null) {
          cols.push(match[2]);
        }

        columns[tableName] = cols;
      }

      return { tables, columns };
    } catch {
      return { tables: [], columns: {} };
    }
  }
}
