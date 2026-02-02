import { z } from 'zod';
import pg from 'pg';
import {
  QueryResult,
  QueryField,
  QueryExplanation,
  TableInfo,
  ColumnInfo,
} from '../types.js';

const { Pool } = pg;

// Tool schemas
export const queryDatabaseSchema = z.object({
  query: z.string().describe('SQL SELECT query to execute'),
  params: z.array(z.unknown()).optional().describe('Query parameters for prepared statement'),
  limit: z.number().optional().describe('Maximum rows to return (default 100)'),
});

export const listTablesSchema = z.object({
  schema: z.string().optional().describe('Schema name (default: public)'),
});

export const describeTableSchema = z.object({
  tableName: z.string().describe('Name of the table to describe'),
  schema: z.string().optional().describe('Schema name (default: public)'),
});

export const analyzeQuerySchema = z.object({
  query: z.string().describe('SQL query to analyze'),
  params: z.array(z.unknown()).optional().describe('Query parameters'),
});

export const getTableStatsSchema = z.object({
  tableName: z.string().describe('Name of the table'),
});

// Types
export type QueryDatabaseInput = z.infer<typeof queryDatabaseSchema>;
export type ListTablesInput = z.infer<typeof listTablesSchema>;
export type DescribeTableInput = z.infer<typeof describeTableSchema>;
export type AnalyzeQueryInput = z.infer<typeof analyzeQuerySchema>;
export type GetTableStatsInput = z.infer<typeof getTableStatsSchema>;

/**
 * Database tools for PostgreSQL operations
 */
export class DatabaseTools {
  private pool: pg.Pool | null = null;
  private connectionConfig: {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
  } | null = null;

  /**
   * Configure database connection
   */
  configure(config: {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
  }): void {
    this.connectionConfig = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * Check if database is configured
   */
  private ensureConfigured(): void {
    if (!this.pool) {
      throw new Error('Database not configured. Call configure() first.');
    }
  }

  /**
   * Execute a SELECT query
   */
  async queryDatabase(input: QueryDatabaseInput): Promise<{
    success: boolean;
    result?: {
      rows: Record<string, unknown>[];
      rowCount: number;
      fields: QueryField[];
      executionTime: number;
    };
    error?: string;
  }> {
    this.ensureConfigured();

    // Only allow SELECT queries
    const trimmedQuery = input.query.trim().toLowerCase();
    if (!trimmedQuery.startsWith('select')) {
      return {
        success: false,
        error: 'Only SELECT queries are allowed',
      };
    }

    const limit = input.limit || 100;
    let query = input.query;

    // Add LIMIT if not present
    if (!trimmedQuery.includes('limit')) {
      query = `${query} LIMIT ${limit}`;
    }

    try {
      const startTime = Date.now();
      const result = await this.pool!.query(query, input.params);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result: {
          rows: result.rows,
          rowCount: result.rowCount || 0,
          fields: result.fields.map((f) => ({
            name: f.name,
            type: this.getTypeName(f.dataTypeID),
          })),
          executionTime,
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
   * List all tables in a schema
   */
  async listTables(input: ListTablesInput): Promise<{
    success: boolean;
    tables?: Array<{
      name: string;
      schema: string;
      type: string;
      rowEstimate: number;
      sizeEstimate: string;
    }>;
    error?: string;
  }> {
    this.ensureConfigured();

    const schema = input.schema || 'public';

    try {
      const result = await this.pool!.query(`
        SELECT
          c.relname AS name,
          n.nspname AS schema,
          CASE c.relkind
            WHEN 'r' THEN 'table'
            WHEN 'v' THEN 'view'
            WHEN 'm' THEN 'materialized view'
            ELSE 'other'
          END AS type,
          c.reltuples::bigint AS row_estimate,
          pg_size_pretty(pg_total_relation_size(c.oid)) AS size_estimate
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relkind IN ('r', 'v', 'm')
        ORDER BY c.relname
      `, [schema]);

      return {
        success: true,
        tables: result.rows.map((row) => ({
          name: row.name,
          schema: row.schema,
          type: row.type,
          rowEstimate: parseInt(row.row_estimate, 10),
          sizeEstimate: row.size_estimate,
        })),
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
   * Describe a table's structure
   */
  async describeTable(input: DescribeTableInput): Promise<{
    success: boolean;
    table?: {
      name: string;
      schema: string;
      columns: Array<{
        name: string;
        type: string;
        nullable: boolean;
        defaultValue: string | null;
        isPrimaryKey: boolean;
        isForeignKey: boolean;
        references?: {
          table: string;
          column: string;
        };
      }>;
      indexes: Array<{
        name: string;
        columns: string[];
        unique: boolean;
        primary: boolean;
      }>;
      foreignKeys: Array<{
        name: string;
        column: string;
        referencesTable: string;
        referencesColumn: string;
      }>;
      rowCount: number;
    };
    error?: string;
  }> {
    this.ensureConfigured();

    const schema = input.schema || 'public';

    try {
      // Get columns
      const columnsResult = await this.pool!.query(`
        SELECT
          a.attname AS name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
          NOT a.attnotnull AS nullable,
          pg_get_expr(d.adbin, d.adrelid) AS default_value,
          EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conrelid = a.attrelid
              AND a.attnum = ANY(c.conkey)
              AND c.contype = 'p'
          ) AS is_primary_key,
          EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conrelid = a.attrelid
              AND a.attnum = ANY(c.conkey)
              AND c.contype = 'f'
          ) AS is_foreign_key
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE c.relname = $1
          AND n.nspname = $2
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
      `, [input.tableName, schema]);

      // Get indexes
      const indexesResult = await this.pool!.query(`
        SELECT
          i.relname AS name,
          array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns,
          ix.indisunique AS is_unique,
          ix.indisprimary AS is_primary
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = $1
          AND n.nspname = $2
        GROUP BY i.relname, ix.indisunique, ix.indisprimary
        ORDER BY i.relname
      `, [input.tableName, schema]);

      // Get foreign keys
      const fkResult = await this.pool!.query(`
        SELECT
          c.conname AS name,
          a.attname AS column,
          cf.relname AS references_table,
          af.attname AS references_column
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class cf ON cf.oid = c.confrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        JOIN pg_attribute af ON af.attrelid = cf.oid AND af.attnum = ANY(c.confkey)
        WHERE t.relname = $1
          AND n.nspname = $2
          AND c.contype = 'f'
        ORDER BY c.conname
      `, [input.tableName, schema]);

      // Get row count
      const countResult = await this.pool!.query(`
        SELECT reltuples::bigint AS count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1 AND n.nspname = $2
      `, [input.tableName, schema]);

      return {
        success: true,
        table: {
          name: input.tableName,
          schema,
          columns: columnsResult.rows.map((row) => ({
            name: row.name,
            type: row.type,
            nullable: row.nullable,
            defaultValue: row.default_value,
            isPrimaryKey: row.is_primary_key,
            isForeignKey: row.is_foreign_key,
          })),
          indexes: indexesResult.rows.map((row) => ({
            name: row.name,
            columns: row.columns,
            unique: row.is_unique,
            primary: row.is_primary,
          })),
          foreignKeys: fkResult.rows.map((row) => ({
            name: row.name,
            column: row.column,
            referencesTable: row.references_table,
            referencesColumn: row.references_column,
          })),
          rowCount: parseInt(countResult.rows[0]?.count || '0', 10),
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
   * Analyze a query with EXPLAIN ANALYZE
   */
  async analyzeQuery(input: AnalyzeQueryInput): Promise<{
    success: boolean;
    analysis?: {
      plan: string;
      executionTime: number;
      planningTime: number;
      suggestions: string[];
    };
    error?: string;
  }> {
    this.ensureConfigured();

    try {
      const result = await this.pool!.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${input.query}`,
        input.params
      );

      const plan = result.rows[0]['QUERY PLAN'][0];
      const planText = JSON.stringify(plan, null, 2);

      // Generate suggestions based on plan
      const suggestions = this.generateQuerySuggestions(plan);

      return {
        success: true,
        analysis: {
          plan: planText,
          executionTime: plan['Execution Time'] || 0,
          planningTime: plan['Planning Time'] || 0,
          suggestions,
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
   * Generate query optimization suggestions
   */
  private generateQuerySuggestions(plan: any): string[] {
    const suggestions: string[] = [];

    const checkNode = (node: any) => {
      // Check for sequential scans on large tables
      if (node['Node Type'] === 'Seq Scan' && node['Actual Rows'] > 1000) {
        suggestions.push(
          `Consider adding an index for the sequential scan on "${node['Relation Name']}"`
        );
      }

      // Check for hash joins
      if (node['Node Type'] === 'Hash Join' && node['Actual Rows'] > 10000) {
        suggestions.push(
          'Large hash join detected. Consider adding indexes on join columns.'
        );
      }

      // Check for sorts
      if (node['Node Type'] === 'Sort' && node['Sort Method']?.includes('external')) {
        suggestions.push(
          'External sort detected. Consider increasing work_mem or adding an index.'
        );
      }

      // Recurse into child plans
      if (node['Plans']) {
        for (const child of node['Plans']) {
          checkNode(child);
        }
      }
    };

    if (plan['Plan']) {
      checkNode(plan['Plan']);
    }

    return suggestions;
  }

  /**
   * Get table statistics
   */
  async getTableStats(input: GetTableStatsInput): Promise<{
    success: boolean;
    stats?: {
      tableName: string;
      rowCount: number;
      totalSize: string;
      indexSize: string;
      toastSize: string;
      lastVacuum: string | null;
      lastAnalyze: string | null;
      deadTuples: number;
      liveTuples: number;
    };
    error?: string;
  }> {
    this.ensureConfigured();

    try {
      const result = await this.pool!.query(`
        SELECT
          c.relname AS table_name,
          c.reltuples::bigint AS row_count,
          pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
          pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
          pg_size_pretty(pg_total_relation_size(c.reltoastrelid)) AS toast_size,
          s.last_vacuum,
          s.last_analyze,
          s.n_dead_tup AS dead_tuples,
          s.n_live_tup AS live_tuples
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE c.relname = $1
          AND n.nspname = 'public'
      `, [input.tableName]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: `Table "${input.tableName}" not found`,
        };
      }

      const row = result.rows[0];

      return {
        success: true,
        stats: {
          tableName: row.table_name,
          rowCount: parseInt(row.row_count, 10),
          totalSize: row.total_size,
          indexSize: row.index_size,
          toastSize: row.toast_size,
          lastVacuum: row.last_vacuum?.toISOString() || null,
          lastAnalyze: row.last_analyze?.toISOString() || null,
          deadTuples: parseInt(row.dead_tuples || '0', 10),
          liveTuples: parseInt(row.live_tuples || '0', 10),
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
   * Get PostgreSQL type name from OID
   */
  private getTypeName(oid: number): string {
    const types: Record<number, string> = {
      16: 'boolean',
      20: 'bigint',
      21: 'smallint',
      23: 'integer',
      25: 'text',
      700: 'real',
      701: 'double precision',
      1043: 'varchar',
      1082: 'date',
      1083: 'time',
      1114: 'timestamp',
      1184: 'timestamptz',
      1700: 'numeric',
      2950: 'uuid',
      3802: 'jsonb',
    };

    return types[oid] || 'unknown';
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  /**
   * Get tool definitions for MCP registration
   */
  static getToolDefinitions() {
    return [
      {
        name: 'query_database',
        description: 'Execute a SELECT query on the PostgreSQL database',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'SQL SELECT query' },
            params: {
              type: 'array',
              items: {},
              description: 'Query parameters for prepared statement',
            },
            limit: { type: 'number', description: 'Maximum rows to return' },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_tables',
        description: 'List all tables in a database schema',
        inputSchema: {
          type: 'object',
          properties: {
            schema: { type: 'string', description: 'Schema name (default: public)' },
          },
        },
      },
      {
        name: 'describe_table',
        description: 'Get detailed information about a table structure',
        inputSchema: {
          type: 'object',
          properties: {
            tableName: { type: 'string', description: 'Table name' },
            schema: { type: 'string', description: 'Schema name (default: public)' },
          },
          required: ['tableName'],
        },
      },
      {
        name: 'analyze_query',
        description: 'Analyze a query using EXPLAIN ANALYZE',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'SQL query to analyze' },
            params: {
              type: 'array',
              items: {},
              description: 'Query parameters',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'table_stats',
        description: 'Get statistics for a table',
        inputSchema: {
          type: 'object',
          properties: {
            tableName: { type: 'string', description: 'Table name' },
          },
          required: ['tableName'],
        },
      },
    ];
  }
}
