#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { runCommand } from './commands/run.js';
import { listCommand } from './commands/list.js';
import { validateCommand } from './commands/validate.js';
import { createCommand } from './commands/create.js';
import { showCommand } from './commands/show.js';

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
  .option('--reuse-profile', 'Reuse existing VS Code profile (may conflict with running VS Code)')
  .option('--video', 'Record video of the scenario run')
  .option('-w, --watch', 'Watch mode - rerun on changes')
  .option('-o, --output <path>', 'Output directory for reports')
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

// Show command
program
  .command('show')
  .description('Show scenario details')
  .argument('<scenario-id>', 'Scenario ID')
  .option('--yaml', 'Output as YAML')
  .option('--json', 'Output as JSON')
  .action(showCommand);

// Parse and execute
program.parse();
