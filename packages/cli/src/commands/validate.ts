import chalk from 'chalk';
import * as fs from 'fs';
import { parseScenarioYAML } from '@scenario-grader/core';

export async function validateCommand(
  filePath: string,
  options: { strict?: boolean }
): Promise<void> {
  console.log(chalk.blue(`\n🔍 Validating: ${filePath}\n`));

  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`File not found: ${filePath}`));
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const scenario = parseScenarioYAML(content);
    
    console.log(chalk.green(`✓ Valid scenario: ${scenario.name}`));
    console.log(chalk.gray(`  ID: ${scenario.id}`));
    console.log(chalk.gray(`  Steps: ${scenario.steps.length}`));
    console.log(chalk.gray(`  Assertions: ${scenario.assertions.length}`));
  } catch (error) {
    console.log(chalk.red(`✗ Invalid scenario: ${error}`));
    process.exit(1);
  }
}
