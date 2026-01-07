#!/usr/bin/env node

import { config as dotenvConfig } from 'dotenv';
import { Command } from 'commander';
import chalk from 'chalk';
import { runCommand } from './commands/run.js';
import { listCommand } from './commands/list.js';
import { validateCommand } from './commands/validate.js';
import { createCommand } from './commands/create.js';
import { showCommand } from './commands/show.js';
import { recordCommand } from './commands/record.js';
import { authCommand } from './commands/auth.js';
import { specCommand, authorCommand, gapCommand, workflowCommand } from './commands/handoff.js';

// Load environment variables from .env file
dotenvConfig();

const program = new Command();

// ASCII Art Banner
const banner = `
${chalk.cyan('╔═══════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('⭐ VS Code Scenario Runner')}                              ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('End-to-End UX Testing with LLM Evaluation')}                ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════╝')}
`;

program
  .name('scenario-runner')
  .description('VS Code Scenario Runner - End-to-End Testing System')
  .version('1.0.0')
  .hook('preAction', () => {
    console.log(banner);
  });

// Run command
program
  .command('run')
  .description('Run a scenario')
  .argument('[scenario-id]', 'Scenario ID to run')
  .option('-a, --all', 'Run all scenarios')
  .option('-t, --tag <tag>', 'Run scenarios with specific tag')
  .option('-v, --vscode-version <version>', 'VS Code version (stable|insiders)', 'stable')
  .option('-p, --profile <name>', 'VS Code profile name')
  .option('--no-sandbox-reset', 'Skip sandbox reset')
  .option('--no-llm', 'Disable LLM evaluation')
  .option('--no-artifacts', 'Disable artifact capture')
  .option('--fresh-profile', 'Use fresh VS Code profile (isolated, no extensions/auth)')
  .option('--video', 'Record video of the scenario run')
  .option('--screenshot-method <method>', 'Screenshot capture method (electron|os|playwright)', 'electron')
  .option('-w, --watch', 'Watch mode - rerun on changes')
  .option('-o, --output <path>', 'Output directory for reports')
  .option('--compare <versions>', 'Compare across VS Code versions (e.g., stable,insiders)')
  .option('--validate', 'Only validate scenario without running')
  .option('--orchestrated', 'Force orchestrated mode for long-running scenarios')
  .action(runCommand);

// List command
program
  .command('list')
  .description('List available scenarios')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('-p, --priority <priority>', 'Filter by priority (P0|P1|P2)')
  .option('--json', 'Output as JSON')
  .action(listCommand);

// Validate command
program
  .command('validate')
  .description('Validate scenario YAML files')
  .argument('<path>', 'Path to YAML file or directory')
  .option('--strict', 'Fail on warnings')
  .action(validateCommand);

// Create command
program
  .command('create')
  .description('Create a new scenario')
  .option('-i, --interactive', 'Interactive mode')
  .option('-n, --natural <text>', 'Create from natural language')
  .option('-t, --template <name>', 'Use a template')
  .option('-o, --output <path>', 'Output file path')
  .action(createCommand);

// Record command
program
  .command('record')
  .description('Record a new scenario by capturing VS Code interactions')
  .option('-i, --interactive', 'Interactive mode with prompts')
  .option('-n, --name <name>', 'Scenario name')
  .option('-d, --description <text>', 'Scenario description')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-p, --priority <priority>', 'Priority (P0|P1|P2)', 'P1')
  .option('--owner <owner>', 'Scenario owner')
  .option('-w, --workspace <path>', 'Workspace path to open')
  .option('-o, --output <path>', 'Output directory for YAML file')
  .action(recordCommand);

// Show command
program
  .command('show')
  .description('Show scenario details')
  .argument('<scenario-id>', 'Scenario ID')
  .option('--yaml', 'Output as YAML')
  .option('--json', 'Output as JSON')
  .action(showCommand);

// Auth command
program
  .command('auth')
  .description('Authenticate with GitHub for Copilot scenarios')
  .option('--logout', 'Clear stored authentication')
  .option('--status', 'Show authentication status')
  .option('--verify', 'Verify stored token is still valid')
  .action(authCommand);

// ============================================================================
// PM Workflow Commands
// ============================================================================

// Author command (natural language scenario creation)
program
  .command('author')
  .description('Create a scenario using natural language (for PMs)')
  .option('-o, --output <path>', 'Output file for the prompt')
  .action(authorCommand);

// Spec command (generate implementation prompt)
program
  .command('spec')
  .description('Generate implementation spec from a scenario')
  .argument('<scenario-id>', 'Scenario ID')
  .option('-o, --output <path>', 'Output file')
  .option('--format <format>', 'Output format (markdown|json)', 'markdown')
  .action(specCommand);

// Gap command (show what's missing)
program
  .command('gap')
  .description('Show gap report between scenario spec and implementation')
  .argument('<scenario-id>', 'Scenario ID')
  .argument('[run-id]', 'Specific run ID (defaults to most recent)')
  .option('-o, --output <path>', 'Output file')
  .option('--format <format>', 'Output format (markdown|json)', 'markdown')
  .action(gapCommand);

// Workflow command (show the full workflow)
program
  .command('workflow')
  .description('Show the PM → LLM → Validate workflow')
  .action(workflowCommand);

// Parse and execute
program.parse();
