import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import boxen from 'boxen';
import {
  compileNaturalLanguage,
  scenarioToYAML,
  Scenario,
  Priority,
} from '@scenario-grader/core';

interface CreateOptions {
  interactive?: boolean;
  natural?: string;
  template?: string;
  output?: string;
}

const TEMPLATES: Record<string, Partial<Scenario>> = {
  mcp: {
    name: 'MCP Server Configuration',
    tags: ['mcp', 'copilot'],
    priority: 'P0',
    environment: {
      vscodeTarget: 'desktop',
      vscodeVersion: 'stable',
      platform: 'macOS',
      copilotChannel: 'stable',
    },
    preconditions: ['Baseline sandbox exists', 'GitHub authentication is available'],
  },
  copilot: {
    name: 'Copilot Interaction',
    tags: ['copilot', 'chat'],
    priority: 'P1',
    environment: {
      vscodeTarget: 'desktop',
      vscodeVersion: 'stable',
      platform: 'macOS',
      copilotChannel: 'stable',
    },
    preconditions: ['Baseline sandbox exists', 'Copilot subscription is active'],
  },
  extension: {
    name: 'Extension Installation',
    tags: ['extensions', 'marketplace'],
    priority: 'P1',
    environment: {
      vscodeTarget: 'desktop',
      vscodeVersion: 'stable',
      platform: 'macOS',
      copilotChannel: 'stable',
    },
    preconditions: ['Baseline sandbox exists', 'Network connectivity available'],
  },
  debugging: {
    name: 'Debugging Session',
    tags: ['debugging'],
    priority: 'P1',
    environment: {
      vscodeTarget: 'desktop',
      vscodeVersion: 'stable',
      platform: 'macOS',
      copilotChannel: 'stable',
    },
    preconditions: ['Baseline sandbox exists', 'Sample project exists'],
  },
};

export async function createCommand(options: CreateOptions): Promise<void> {
  // Natural language mode
  if (options.natural) {
    await createFromNaturalLanguage(options.natural, options.output);
    return;
  }

  // Interactive mode
  if (options.interactive) {
    await createInteractive(options.output, options.template);
    return;
  }

  // Default: show help
  console.log(chalk.blue('\n📝 Create a new scenario\n'));
  console.log(chalk.white('Options:'));
  console.log(
    chalk.gray('  --interactive, -i   ') +
      chalk.white('Interactive wizard')
  );
  console.log(
    chalk.gray('  --natural, -n       ') +
      chalk.white('Create from natural language description')
  );
  console.log(
    chalk.gray('  --template, -t      ') +
      chalk.white('Use a template (mcp, copilot, extension, debugging)')
  );
  console.log(
    chalk.gray('  --output, -o        ') +
      chalk.white('Output file path')
  );
  console.log(chalk.gray('\nExample:'));
  console.log(
    chalk.cyan(
      '  scenario-runner create -n "Launch VS Code, open Copilot chat, ask a question"'
    )
  );
}

async function createFromNaturalLanguage(
  text: string,
  outputPath?: string
): Promise<void> {
  const spinner = ora('Compiling natural language to YAML...').start();

  try {
    const scenario = await compileNaturalLanguage(text);
    const yaml = scenarioToYAML(scenario);

    spinner.succeed('Scenario compiled successfully');

    console.log(
      boxen(chalk.cyan(yaml), {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'green',
        title: '📄 Generated YAML',
        titleAlignment: 'left',
      })
    );

    // Prompt to save
    const { save } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'save',
        message: 'Save this scenario?',
        default: true,
      },
    ]);

    if (save) {
      const finalPath = outputPath || `./${scenario.id}.yaml`;
      const { filename } = await inquirer.prompt([
        {
          type: 'input',
          name: 'filename',
          message: 'Output file:',
          default: finalPath,
        },
      ]);

      fs.writeFileSync(filename, yaml);
      console.log(chalk.green(`\n✓ Saved to ${filename}`));
    }
  } catch (error) {
    spinner.fail(`Failed to compile: ${error}`);
  }
}

async function createInteractive(
  outputPath?: string,
  templateName?: string
): Promise<void> {
  console.log(chalk.blue('\n🧙 Scenario Creation Wizard\n'));

  // Use template if provided
  const template = templateName ? TEMPLATES[templateName] : undefined;

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'id',
      message: 'Scenario ID:',
      default: `scenario-${Date.now()}`,
      validate: (input: string) => /^[a-z0-9-]+$/.test(input) || 'Use lowercase letters, numbers, and hyphens only',
    },
    {
      type: 'input',
      name: 'name',
      message: 'Scenario name:',
      default: template?.name,
    },
    {
      type: 'input',
      name: 'owner',
      message: 'Owner (team or person):',
      default: '@my-team',
    },
    {
      type: 'list',
      name: 'priority',
      message: 'Priority:',
      choices: ['P0', 'P1', 'P2'],
      default: template?.priority || 'P1',
    },
    {
      type: 'input',
      name: 'tags',
      message: 'Tags (comma-separated):',
      default: template?.tags?.join(', ') || '',
      filter: (input: string) => input.split(',').map((t) => t.trim()).filter(Boolean),
    },
    {
      type: 'editor',
      name: 'description',
      message: 'Description:',
      default: 'Describe what this scenario validates...',
    },
    {
      type: 'list',
      name: 'vscodeVersion',
      message: 'VS Code version:',
      choices: ['stable', 'insiders', 'exploration'],
      default: 'stable',
    },
    {
      type: 'confirm',
      name: 'captureVideo',
      message: 'Capture video?',
      default: false,
    },
    {
      type: 'confirm',
      name: 'storeChatTranscript',
      message: 'Store chat transcript?',
      default: true,
    },
  ]);

  // Build scenario
  const scenario: Scenario = {
    id: answers.id,
    name: answers.name,
    owner: answers.owner,
    tags: answers.tags,
    description: answers.description,
    priority: answers.priority as Priority,
    environment: {
      vscodeTarget: 'desktop',
      vscodeVersion: answers.vscodeVersion,
      platform: 'macOS',
      copilotChannel: 'stable',
      ...template?.environment,
    },
    preconditions: template?.preconditions || ['Baseline sandbox exists'],
    steps: [
      {
        id: 'launch',
        description: 'Launch VS Code',
        action: 'launchVSCodeWithProfile',
        args: { profileName: 'Default' },
        optional: false,
      },
    ],
    assertions: [
      {
        id: 'scenario_completes',
        type: 'custom',
        description: 'Scenario completes without errors',
        required: true,
      },
      {
        id: 'llm_evaluation',
        type: 'llmGrade',
        rubricId: 'general-ux',
        required: false,
      },
    ],
    outputs: {
      captureVideo: answers.captureVideo,
      storeChatTranscript: answers.storeChatTranscript,
      storeLogs: true,
    },
  };

  const yaml = scenarioToYAML(scenario);

  console.log(
    boxen(chalk.cyan(yaml), {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'green',
      title: '📄 Generated YAML',
      titleAlignment: 'left',
    })
  );

  // Save prompt
  const { save } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'save',
      message: 'Save this scenario?',
      default: true,
    },
  ]);

  if (save) {
    const finalPath = outputPath || `./${scenario.id}.yaml`;
    const { filename } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filename',
        message: 'Output file:',
        default: finalPath,
      },
    ]);

    fs.writeFileSync(filename, yaml);
    console.log(chalk.green(`\n✓ Saved to ${filename}`));
  }

  console.log(
    chalk.gray(
      '\nTip: Edit the YAML to add more steps, then validate with "scenario-runner validate"'
    )
  );
}
