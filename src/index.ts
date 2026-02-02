#!/usr/bin/env node

import { createServer } from './server.js';
import * as path from 'path';

/**
 * Main entry point for the Rails Dev MCP server
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let libraryPath: string | undefined;
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--library' && args[i + 1]) {
      libraryPath = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--config' && args[i + 1]) {
      configPath = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--help') {
      console.log(`
Rails Dev MCP Server

Usage: rails-dev-mcp [options]

Options:
  --library <path>  Path to the library directory (default: ./library)
  --config <path>   Path to configuration file (default: ./config/default.yml)
  --help            Show this help message

Environment Variables:
  RAILS_MCP_LIBRARY    Library path (overridden by --library)
  RAILS_MCP_CONFIG     Config path (overridden by --config)
  RAILS_MCP_DB_HOST    PostgreSQL host
  RAILS_MCP_DB_PORT    PostgreSQL port
  RAILS_MCP_DB_USER    PostgreSQL user
  RAILS_MCP_DB_PASS    PostgreSQL password
  RAILS_MCP_DB_NAME    PostgreSQL database name
`);
      process.exit(0);
    }
  }

  // Fall back to environment variables
  libraryPath = libraryPath || process.env.RAILS_MCP_LIBRARY;
  configPath = configPath || process.env.RAILS_MCP_CONFIG;

  // Handle shutdown gracefully
  let server: Awaited<ReturnType<typeof createServer>> | null = null;

  const shutdown = async () => {
    if (server) {
      console.error('Shutting down server...');
      await server.stop();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    server = await createServer(libraryPath, configPath);
    console.error('Server is running. Press Ctrl+C to stop.');
  } catch (error) {
    const err = error as Error;
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
