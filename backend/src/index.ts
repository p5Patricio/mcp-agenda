#!/usr/bin/env node

import { runServer } from './mcp/server';
import { DB_DIR } from './config/database';
import * as fs from 'fs';
import * as path from 'path';

const packageJson = require('../package.json');

function showHelp(): void {
  console.log(`
mcp-agenda — MCP server for AI agent calendar management

Usage:
  mcp-agenda              Start MCP server (stdio transport)
  mcp-agenda init         Create or upgrade SQLite database
  mcp-agenda --version    Show version
  mcp-agenda --help       Show this help

Environment:
  AGENT_CALENDAR_DB_PATH   Database directory (default: ./data)
  DB_PATH                  Fallback database directory

Exit codes:
  0  Success
  1  Error
`);
}

function showVersion(): void {
  console.log(packageJson.version ?? '1.0.0');
}

function handleError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Error:', message);
  process.exit(1);
}

async function cmdInit(): Promise<void> {
  try {
    // Ensure DB directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    // Check for legacy VoiceAgenda database
    const legacyDbPath = path.join(DB_DIR, 'voiceagenda.db');
    const newDbPath = path.join(DB_DIR, 'mcp-agenda.db');

    if (fs.existsSync(legacyDbPath) && !fs.existsSync(newDbPath)) {
      console.log('Migrating legacy VoiceAgenda database...');
      fs.copyFileSync(legacyDbPath, newDbPath);
      console.log('Copied legacy database. Running schema migration...');
    }

    // Database already initialized at module load (database.ts)
    console.log(`Database ready at ${DB_DIR}`);
    process.exit(0);
  } catch (err) {
    handleError(err);
  }
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Default: start MCP server
    runServer().catch(handleError);
    return;
  }

  const command = args[0];

  switch (command) {
    case 'init':
      cmdInit().catch(handleError);
      break;

    case '--help':
    case '-h':
    case 'help':
      showHelp();
      process.exit(0);
      break;

    case '--version':
    case '-v':
    case 'version':
      showVersion();
      process.exit(0);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main();
