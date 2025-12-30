import chalk from 'chalk';
import boxen from 'boxen';
import YAML from 'yaml';
import { getSampleScenario } from '@scenario-grader/core';

interface ShowOptions {
  yaml?: boolean;
  json?: boolean;
}

export async function showCommand(
  scenarioId: string,
  options: ShowOptions
): Promise<void> {
  const scenario = getSampleScenario(scenarioId);

  if (!scenario) {
    console.log(chalk.red(`Scenario not found: ${scenarioId}`));
    console.log(chalk.gray('Use "scenario-runner list" to see available scenarios'));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(scenario, null, 2));
    return;
  }

  if (options.yaml) {
    console.log(YAML.stringify(scenario));
    return;
  }

  // Pretty print
  console.log(
    boxen(
      `${chalk.bold.white(scenario.name)}\n` +
        `${chalk.gray(scenario.id)}\n\n` +
        `${chalk.cyan('Priority:')} ${scenario.priority}\n` +
        `${chalk.cyan('Tags:')} ${scenario.tags.map((t) => chalk.magenta(`#${t}`)).join(' ')}\n\n` +
        `${chalk.cyan('Description:')}\n${chalk.white(scenario.description)}`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Steps
  console.log(chalk.bold.cyan('\n📋 Steps:\n'));
  scenario.steps.forEach((step, i) => {
    console.log(`  ${chalk.bold(`${i + 1}.`)} ${chalk.white(step.id)}`);
    console.log(`     ${chalk.gray(`Action: ${step.action}`)}`);
    if (step.target) {
      console.log(`     ${chalk.gray(`Target: ${step.target}`)}`);
    }
    console.log();
  });

  // Assertions
  if (scenario.assertions.length > 0) {
    console.log(chalk.bold.cyan('\n✅ Assertions:\n'));
    scenario.assertions.forEach((assertion, i) => {
      console.log(`  ${chalk.bold(`${i + 1}.`)} ${chalk.white(assertion.id)}`);
      console.log(`     ${chalk.gray(`Type: ${assertion.type}`)}`);
      console.log();
    });
  }
}
