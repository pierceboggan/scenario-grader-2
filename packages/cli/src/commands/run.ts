import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { parseScenarioFile, runScenario, RunConfig, Scenario, evaluateScenarioRun } from '@scenario-grader/core';

interface RunOptions {
  vscodeVersion?: string;
  profile?: string;
  sandboxReset?: boolean;
  llm?: boolean;
  artifacts?: boolean;
  freshProfile?: boolean;
  video?: boolean;
  watch?: boolean;
  output?: string;
  all?: boolean;
  tag?: string;
}

/**
 * CLI action handler for running scenarios
 */
export async function runCommand(scenarioId: string | undefined, options: RunOptions): Promise<void> {
  const spinner = ora('Loading scenario...').start();
  
  try {
    // Handle --all flag
    if (options.all) {
      await runAllScenarios(options);
      return;
    }
    
    if (!scenarioId) {
      spinner.fail('Please specify a scenario ID or use --all to run all scenarios');
      process.exit(1);
    }
    
    // Resolve scenario
    let scenario: Scenario;
    
    if (scenarioId.endsWith('.yaml') || scenarioId.endsWith('.yml')) {
      // Load from file
      const filePath = path.resolve(scenarioId);
      if (!fs.existsSync(filePath)) {
        spinner.fail(`Scenario file not found: ${filePath}`);
        process.exit(1);
      }
      scenario = parseScenarioFile(filePath);
    } else {
      // Look for scenario by ID in default location
      const scenariosDir = path.join(process.cwd(), 'scenarios');
      if (!fs.existsSync(scenariosDir)) {
        spinner.fail(`Scenarios directory not found: ${scenariosDir}`);
        process.exit(1);
      }
      
      const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      
      let found: Scenario | null = null;
      for (const file of files) {
        const s = parseScenarioFile(path.join(scenariosDir, file));
        if (s.id === scenarioId || file.replace(/\.ya?ml$/, '') === scenarioId) {
          found = s;
          break;
        }
      }
      
      if (!found) {
        spinner.fail(`Scenario not found: ${scenarioId}`);
        process.exit(1);
      }
      scenario = found;
    }
    
    spinner.succeed(`Loaded scenario: ${chalk.cyan(scenario.name)}`);
    
    // Build run configuration
    const config: RunConfig = {
      scenarioId: scenario.id,
      vscodeVersion: (options.vscodeVersion as 'stable' | 'insiders' | 'exploration') || 'stable',
      resetSandbox: options.sandboxReset !== false,
      captureArtifacts: options.artifacts !== false,
      enableLLMGrading: options.llm !== false, // Enabled by default, use --no-llm to disable
      freshProfile: options.freshProfile || false,
      recordVideo: options.video || false,
    };
    
    console.log('');
    console.log(chalk.dim('─'.repeat(60)));
    console.log(chalk.bold('Scenario Configuration'));
    console.log(chalk.dim('─'.repeat(60)));
    console.log(`  ${chalk.gray('ID:')}         ${scenario.id}`);
    console.log(`  ${chalk.gray('Name:')}       ${scenario.name}`);
    console.log(`  ${chalk.gray('Priority:')}   ${getPriorityBadge(scenario.priority)}`);
    console.log(`  ${chalk.gray('Steps:')}      ${scenario.steps.length}`);
    console.log(`  ${chalk.gray('VS Code:')}    ${config.vscodeVersion}`);
    console.log(`  ${chalk.gray('Fresh:')}      ${config.freshProfile ? chalk.green('Yes') : chalk.gray('No')}`);
    console.log(`  ${chalk.gray('Video:')}      ${config.recordVideo ? chalk.green('Yes') : chalk.gray('No')}`);
    console.log(`  ${chalk.gray('LLM Eval:')}   ${config.enableLLMGrading ? chalk.green('Yes') : chalk.gray('No')}`);
    console.log(chalk.dim('─'.repeat(60)));
    console.log('');
    
    const runSpinner = ora('Executing scenario...').start();
    
    // Run the scenario
    const report = await runScenario(scenario, config, (event) => {
      switch (event.type) {
        case 'step:start':
          runSpinner.text = `Step: ${event.data.description}`;
          break;
        case 'step:complete':
          if (event.data.status === 'passed') {
            runSpinner.succeed(`${chalk.green('✓')} ${event.data.stepId}`);
          } else {
            runSpinner.fail(`${chalk.red('✗')} ${event.data.stepId}: ${event.data.error || 'Failed'}`);
          }
          runSpinner.start();
          break;
        case 'log':
          // Could show verbose logs here
          break;
        case 'screenshot':
          runSpinner.text = `Screenshot: ${event.data.path}`;
          break;
      }
    });
    
    runSpinner.stop();
    console.log('');
    
    // Run LLM evaluation if enabled AND scenario completed successfully
    if (config.enableLLMGrading && report.status === 'passed') {
      const evalSpinner = ora('Running LLM evaluation with GPT-5.2...').start();
      try {
        const evaluation = await evaluateScenarioRun(scenario, report);
        report.llmEvaluation = evaluation;
        evalSpinner.succeed('LLM evaluation complete');
      } catch (err) {
        evalSpinner.warn(`LLM evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (config.enableLLMGrading && report.status !== 'passed') {
      console.log(chalk.yellow(`  ⏭ Skipping LLM evaluation (scenario ${report.status})`));
    }
    
    // Print results
    console.log(chalk.dim('═'.repeat(60)));
    console.log(chalk.bold('  Run Results'));
    console.log(chalk.dim('═'.repeat(60)));
    console.log('');
    
    const statusColor = report.status === 'passed' ? chalk.green : 
                       report.status === 'failed' ? chalk.red : 
                       chalk.yellow;
    
    console.log(`  ${chalk.gray('Status:')}    ${statusColor(report.status.toUpperCase())}`);
    console.log(`  ${chalk.gray('Duration:')}  ${report.duration ? `${(report.duration / 1000).toFixed(2)}s` : 'N/A'}`);
    console.log(`  ${chalk.gray('Run ID:')}    ${chalk.dim(report.id)}`);
    console.log('');
    
    // Steps summary
    const passedSteps = report.steps.filter(s => s.status === 'passed').length;
    const failedSteps = report.steps.filter(s => s.status === 'failed').length;
    
    console.log(chalk.bold('  Steps:'));
    console.log(`    ${chalk.green('Passed:')} ${passedSteps}  ${chalk.red('Failed:')} ${failedSteps}`);
    console.log('');
    
    // Show failed steps
    if (failedSteps > 0) {
      console.log(chalk.bold('  Failed Steps:'));
      for (const step of report.steps.filter(s => s.status === 'failed')) {
        console.log(`    ${chalk.red('✗')} ${step.stepId}`);
        if (step.error) {
          console.log(`      ${chalk.dim(step.error)}`);
        }
      }
      console.log('');
    }
    
    // Artifacts
    console.log(chalk.bold('  Artifacts:'));
    console.log(`    ${chalk.gray('Screenshots:')} ${report.artifacts.screenshots.length} captured`);
    console.log(`    ${chalk.gray('Logs:')}        ${report.artifacts.logs}`);
    if (report.artifacts.video) {
      console.log(`    ${chalk.gray('Video:')}       ${report.artifacts.video}`);
    }
    console.log('');
    
    // LLM Evaluation
    if (report.llmEvaluation) {
      console.log(chalk.bold('  LLM Evaluation (GPT-5.2):'));
      console.log(`    ${chalk.gray('Overall Score:')} ${getScoreColor(report.llmEvaluation.overallScore)}${report.llmEvaluation.overallScore}/100${chalk.reset('')}`);
      
      for (const dim of report.llmEvaluation.dimensions) {
        const score = dim.score * 20; // Convert 1-5 to percentage
        console.log(`    ${chalk.gray(dim.name + ':')} ${getScoreColor(score)}${dim.score}/5${chalk.reset('')} - ${chalk.dim(dim.feedback.substring(0, 50))}${dim.feedback.length > 50 ? '...' : ''}`);
      }
      
      if (report.llmEvaluation.suggestions.length > 0) {
        console.log('');
        console.log(chalk.bold('  Suggestions:'));
        for (const suggestion of report.llmEvaluation.suggestions.slice(0, 3)) {
          const severityColor = suggestion.severity === 'critical' ? chalk.red :
                               suggestion.severity === 'high' ? chalk.yellow :
                               suggestion.severity === 'medium' ? chalk.cyan :
                               chalk.gray;
          console.log(`    ${severityColor('●')} ${suggestion.title}`);
          console.log(`      ${chalk.dim(suggestion.description.substring(0, 80))}${suggestion.description.length > 80 ? '...' : ''}`);
        }
      }
      console.log('');
    }
    
    console.log(chalk.dim('═'.repeat(60)));
    
    // Save report if output specified
    if (options.output) {
      const reportPath = path.join(options.output, `${report.id}.json`);
      fs.mkdirSync(options.output, { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(chalk.green(`\nReport saved to: ${reportPath}`));
    }
    
    // Exit code
    process.exit(report.status === 'passed' ? 0 : 1);
    
  } catch (error) {
    spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

async function runAllScenarios(options: RunOptions): Promise<void> {
  const scenariosDir = path.join(process.cwd(), 'scenarios');
  if (!fs.existsSync(scenariosDir)) {
    console.log(chalk.red('Scenarios directory not found'));
    process.exit(1);
  }
  
  const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  console.log(chalk.cyan(`Found ${files.length} scenarios to run\n`));
  
  for (const file of files) {
    const scenario = parseScenarioFile(path.join(scenariosDir, file));
    
    // Filter by tag if specified
    if (options.tag && !(scenario.tags || []).includes(options.tag)) {
      continue;
    }
    
    console.log(chalk.bold(`\n▶ Running: ${scenario.name}`));
    await runCommand(scenario.id, { ...options, all: false });
  }
}

function getPriorityBadge(priority: string): string {
  switch (priority) {
    case 'P0':
      return chalk.bgRed.white(' P0 ');
    case 'P1':
      return chalk.bgYellow.black(' P1 ');
    case 'P2':
      return chalk.bgBlue.white(' P2 ');
    default:
      return chalk.gray(priority);
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return chalk.green('');
  if (score >= 60) return chalk.yellow('');
  return chalk.red('');
}
