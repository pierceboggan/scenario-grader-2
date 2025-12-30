import chalk from 'chalk';
import Table from 'cli-table3';
import { getAllSampleScenarios, Priority } from '@scenario-grader/core';

interface ListOptions {
  tag?: string;
  priority?: Priority;
  json?: boolean;
}

export async function listCommand(options: ListOptions): Promise<void> {
  let scenarios = getAllSampleScenarios();

  // Apply filters
  if (options.tag) {
    scenarios = scenarios.filter((s) => s.tags.includes(options.tag!));
  }

  if (options.priority) {
    scenarios = scenarios.filter((s) => s.priority === options.priority);
  }

  if (scenarios.length === 0) {
    console.log(chalk.yellow('No scenarios found matching criteria'));
    return;
  }

  // JSON output
  if (options.json) {
    console.log(JSON.stringify(scenarios, null, 2));
    return;
  }

  // Table output
  const table = new Table({
    head: [
      chalk.white('ID'),
      chalk.white('Name'),
      chalk.white('Priority'),
      chalk.white('Tags'),
      chalk.white('Owner'),
    ],
    style: {
      head: [],
      border: ['gray'],
    },
    colWidths: [30, 35, 10, 25, 20],
    wordWrap: true,
  });

  scenarios.forEach((s) => {
    const priorityColor = getPriorityColor(s.priority);
    table.push([
      chalk.cyan(s.id),
      s.name,
      priorityColor(s.priority),
      s.tags.map((t) => chalk.magenta(`#${t}`)).join(' '),
      chalk.gray(s.owner),
    ]);
  });

  console.log(chalk.bold(`\n📋 Available Scenarios (${scenarios.length})\n`));
  console.log(table.toString());
  console.log(
    chalk.gray(`\nUse "scenario-runner show <id>" to view details`)
  );
  console.log(chalk.gray(`Use "scenario-runner run <id>" to execute`));
}

function getPriorityColor(priority: Priority): chalk.Chalk {
  switch (priority) {
    case 'P0':
      return chalk.red.bold;
    case 'P1':
      return chalk.yellow;
    case 'P2':
      return chalk.blue;
    default:
      return chalk.gray;
  }
}
