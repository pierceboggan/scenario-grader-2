import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { 
  parseScenarioFile, 
  Scenario,
  generateImplementationPrompt,
  generateGapReport,
  formatGapReport,
  generateScenarioPrompt,
  NaturalLanguageScenario,
} from '@scenario-grader/core';

interface HandoffOptions {
  output?: string;
  format?: 'markdown' | 'json';
  clipboard?: boolean;
}

/**
 * Generate implementation prompt from a scenario
 */
export async function specCommand(scenarioId: string, options: HandoffOptions): Promise<void> {
  const spinner = ora('Loading scenario...').start();
  
  try {
    const scenario = loadScenario(scenarioId);
    spinner.succeed(`Loaded: ${chalk.cyan(scenario.name)}`);
    
    const prompt = generateImplementationPrompt(scenario);
    
    console.log('');
    console.log(chalk.dim('─'.repeat(60)));
    console.log(chalk.bold('📋 Implementation Spec'));
    console.log(chalk.dim('─'.repeat(60)));
    console.log('');
    console.log(prompt);
    console.log('');
    console.log(chalk.dim('─'.repeat(60)));
    
    // Save to file if requested
    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, prompt);
      console.log(chalk.green(`✓ Saved to ${outputPath}`));
    }
    
    // Copy to clipboard hint
    console.log('');
    console.log(chalk.gray('Tip: Copy this prompt and paste it into Copilot Chat or Claude to implement the feature.'));
    
  } catch (error) {
    spinner.fail(`Error: ${error}`);
    process.exit(1);
  }
}

/**
 * Interactive scenario authoring for PMs
 */
export async function authorCommand(options: HandoffOptions): Promise<void> {
  console.log('');
  console.log(chalk.bold('📝 Scenario Author - Natural Language Mode'));
  console.log(chalk.gray('Answer the prompts to create a scenario without writing YAML.'));
  console.log('');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const ask = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(chalk.cyan(question), (answer) => {
        resolve(answer.trim());
      });
    });
  };
  
  const askMultiple = async (question: string): Promise<string[]> => {
    console.log(chalk.cyan(question));
    console.log(chalk.gray('  (Enter each item on a new line. Empty line to finish.)'));
    
    const items: string[] = [];
    while (true) {
      const item = await ask(`  ${items.length + 1}. `);
      if (!item) break;
      items.push(item);
    }
    return items;
  };
  
  try {
    // Gather input
    const goal = await ask('What is the user trying to accomplish?\n> ');
    console.log('');
    
    const steps = await askMultiple('What steps should the user take?');
    console.log('');
    
    const observations = await askMultiple('What UX questions should we answer? (optional)');
    console.log('');
    
    const termsInput = await ask('What terms should appear in the UI? (comma-separated, optional)\n> ');
    const terms = termsInput ? termsInput.split(',').map(t => t.trim()) : undefined;
    console.log('');
    
    const priority = await ask('Priority? (P0/P1/P2, default P1)\n> ') as 'P0' | 'P1' | 'P2' || 'P1';
    const owner = await ask('Owner? (e.g., @username, optional)\n> ');
    const tagsInput = await ask('Tags? (comma-separated, optional)\n> ');
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : undefined;
    
    rl.close();
    
    // Build natural language scenario
    const nlScenario: NaturalLanguageScenario = {
      goal,
      steps,
      observations: observations.length > 0 ? observations : undefined,
      terminologyToCheck: terms,
      priority: priority || 'P1',
      owner: owner || undefined,
      tags,
    };
    
    // Generate prompt for LLM to create YAML
    const prompt = generateScenarioPrompt(nlScenario);
    
    console.log('');
    console.log(chalk.dim('─'.repeat(60)));
    console.log(chalk.bold('🤖 Prompt to Generate YAML'));
    console.log(chalk.dim('─'.repeat(60)));
    console.log(chalk.gray('Copy this prompt and paste it into Copilot Chat to generate the YAML scenario:'));
    console.log('');
    console.log(prompt);
    console.log('');
    console.log(chalk.dim('─'.repeat(60)));
    
    if (options.output) {
      fs.writeFileSync(options.output, prompt);
      console.log(chalk.green(`✓ Saved prompt to ${options.output}`));
    }
    
  } catch (error) {
    rl.close();
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

/**
 * Generate gap report from a scenario run
 */
export async function gapCommand(scenarioId: string, runId: string | undefined, options: HandoffOptions): Promise<void> {
  const spinner = ora('Loading scenario and results...').start();
  
  try {
    const scenario = loadScenario(scenarioId);
    
    // Load run results
    const artifactsDir = path.join(
      process.env.HOME || '~',
      '.scenario-runner',
      'artifacts'
    );
    
    // Find the most recent run if not specified
    let runPath: string;
    if (runId) {
      runPath = path.join(artifactsDir, runId);
    } else {
      // Find most recent run for this scenario
      const runs = fs.readdirSync(artifactsDir)
        .filter(f => f.includes(scenario.id))
        .sort()
        .reverse();
      
      if (runs.length === 0) {
        spinner.fail(`No runs found for scenario: ${scenario.id}`);
        console.log(chalk.gray('Run the scenario first: node packages/cli/dist/index.js run ' + scenario.id));
        process.exit(1);
      }
      runPath = path.join(artifactsDir, runs[0]);
    }
    
    // Load evaluation results
    const evalPath = path.join(runPath, 'evaluation.json');
    if (!fs.existsSync(evalPath)) {
      spinner.fail(`No evaluation found at ${evalPath}`);
      console.log(chalk.gray('Make sure the scenario was run with LLM evaluation enabled.'));
      process.exit(1);
    }
    
    const evaluation = JSON.parse(fs.readFileSync(evalPath, 'utf-8'));
    spinner.succeed('Loaded scenario and results');
    
    // Generate gap report
    const report = generateGapReport(scenario, evaluation);
    const formatted = formatGapReport(report);
    
    console.log('');
    console.log(formatted);
    
    if (options.output) {
      if (options.format === 'json') {
        fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
      } else {
        fs.writeFileSync(options.output, formatted);
      }
      console.log(chalk.green(`✓ Saved to ${options.output}`));
    }
    
  } catch (error) {
    spinner.fail(`Error: ${error}`);
    process.exit(1);
  }
}

/**
 * Show the full PM workflow
 */
export async function workflowCommand(): Promise<void> {
  console.log(`
${chalk.bold.cyan('📋 PM → LLM → Validate Workflow')}
${chalk.dim('─'.repeat(60))}

${chalk.bold('Step 1: Author Scenario')} ${chalk.gray('(PM writes in natural language)')}
  ${chalk.yellow('$')} node packages/cli/dist/index.js author
  
  Or write YAML directly in ${chalk.cyan('scenarios/')} folder.

${chalk.bold('Step 2: Generate Implementation Spec')} ${chalk.gray('(PM hands off to dev)')}
  ${chalk.yellow('$')} node packages/cli/dist/index.js spec copilot-model-picker
  
  Copy the output and paste into Copilot Chat or Claude.

${chalk.bold('Step 3: Implement Feature')} ${chalk.gray('(Dev/LLM implements)')}
  Use the generated spec as your implementation guide.

${chalk.bold('Step 4: Run Scenario')} ${chalk.gray('(Validate implementation)')}
  ${chalk.yellow('$')} node packages/cli/dist/index.js run copilot-model-picker --video

${chalk.bold('Step 5: Review Gap Report')} ${chalk.gray('(See what is missing)')}
  ${chalk.yellow('$')} node packages/cli/dist/index.js gap copilot-model-picker

${chalk.bold('Step 6: Iterate')} ${chalk.gray('(Fix gaps, run again)')}
  Update implementation based on gap report.
  Re-run scenario to verify fixes.

${chalk.dim('─'.repeat(60))}
${chalk.gray('The gap report tracks progress across iterations,')}
${chalk.gray('so you can see what percentage of acceptance criteria are met.')}
`);
}

// Helper to load scenario
function loadScenario(scenarioId: string): Scenario {
  if (scenarioId.endsWith('.yaml') || scenarioId.endsWith('.yml')) {
    return parseScenarioFile(path.resolve(scenarioId));
  }
  
  const scenariosDir = path.join(process.cwd(), 'scenarios');
  const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  
  for (const file of files) {
    try {
      const s = parseScenarioFile(path.join(scenariosDir, file));
      if (s.id === scenarioId || file.replace(/\.ya?ml$/, '') === scenarioId) {
        return s;
      }
    } catch {
      // Skip files that fail to parse when searching
      continue;
    }
  }
  
  // Try direct match as fallback
  const directPath = path.join(scenariosDir, `${scenarioId}.yaml`);
  if (fs.existsSync(directPath)) {
    return parseScenarioFile(directPath);
  }
  
  throw new Error(`Scenario not found: ${scenarioId}`);
}
