import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import boxen from 'boxen';
import {
  getAllSampleScenarios,
  getSampleScenario,
  runScenario,
  RunEvent,
  RunConfig,
  RunReport,
  Scenario,
} from '@scenario-grader/core';

interface RunOptions {
  all?: boolean;
  tag?: string;
  vscodeVersion: string;
  profile?: string;
  sandboxReset: boolean;
  llm: boolean;
  artifacts: boolean;
  watch?: boolean;
  output?: string;
  reuseProfile?: boolean;
  video?: boolean;
}

export async function runCommand(
  scenarioId: string | undefined,
  options: RunOptions
): Promise<void> {
  const scenarios = getAllSampleScenarios();
  let scenariosToRun: Scenario[] = [];

  // Determine which scenarios to run
  if (options.all) {
    scenariosToRun = scenarios;
  } else if (options.tag) {
    scenariosToRun = scenarios.filter((s) => s.tags.includes(options.tag!));
    if (scenariosToRun.length === 0) {
      console.log(chalk.yellow(`No scenarios found with tag: ${options.tag}`));
      return;
    }
  } else if (scenarioId) {
    const scenario = getSampleScenario(scenarioId);
    if (!scenario) {
      console.log(chalk.red(`Scenario not found: ${scenarioId}`));
      console.log(chalk.gray('Use "scenario-runner list" to see available scenarios'));
      return;
    }
    scenariosToRun = [scenario];
  } else {
    console.log(chalk.yellow('Please specify a scenario ID, --all, or --tag'));
    console.log(chalk.gray('Use "scenario-runner list" to see available scenarios'));
    return;
  }

  console.log(
    chalk.blue(`\n📋 Running ${scenariosToRun.length} scenario(s)\n`)
  );

  const results: RunReport[] = [];

  for (const scenario of scenariosToRun) {
    const report = await runSingleScenario(scenario, options);
    results.push(report);
  }

  // Summary
  printSummary(results);
}

async function runSingleScenario(
  scenario: Scenario,
  options: RunOptions
): Promise<RunReport> {
  console.log(
    boxen(
      `${chalk.bold(scenario.name)}\n${chalk.gray(scenario.id)}\n${chalk.cyan(scenario.priority)} • ${scenario.tags.map((t) => chalk.magenta(`#${t}`)).join(' ')}`,
      {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  const spinner = ora('Initializing...').start();
  let currentStep = '';
  const logs: string[] = [];

  const config: RunConfig = {
    scenarioId: scenario.id,
    vscodeVersion: options.vscodeVersion as any,
    profileName: options.profile,
    resetSandbox: options.sandboxReset,
    captureArtifacts: options.artifacts,
    enableLLMGrading: options.llm,
    freshProfile: !options.reuseProfile, // Default to fresh profile
    recordVideo: options.video ?? false,
  };

  const handleEvent = (event: RunEvent) => {
    switch (event.type) {
      case 'run:start':
        spinner.text = 'Starting run...';
        break;
      case 'step:start':
        currentStep = event.data.stepId;
        spinner.text = `Step: ${event.data.stepId} - ${event.data.action}`;
        break;
      case 'step:complete':
        const stepStatus = event.data.status === 'passed'
          ? chalk.green('✓')
          : chalk.red('✗');
        console.log(`  ${stepStatus} ${event.data.stepId} (${event.data.duration}ms)`);
        break;
      case 'log':
        logs.push(event.data.message);
        break;
      case 'assertion:start':
        spinner.text = `Assertion: ${event.data.assertionId}`;
        break;
      case 'assertion:complete':
        const assertStatus = event.data.passed
          ? chalk.green('✓')
          : chalk.red('✗');
        console.log(`  ${assertStatus} Assertion: ${event.data.assertionId}`);
        break;
      case 'evaluation:start':
        spinner.text = 'Running LLM evaluation...';
        break;
      case 'evaluation:complete':
        spinner.succeed('LLM evaluation complete');
        break;
      case 'error':
        spinner.fail(`Error: ${event.data.error}`);
        break;
    }
  };

  try {
    const report = await runScenario(scenario, config, handleEvent);

    if (report.status === 'passed') {
      spinner.succeed(chalk.green(`Scenario passed in ${report.duration}ms`));
    } else {
      spinner.fail(chalk.red(`Scenario ${report.status}: ${report.error || 'Unknown error'}`));
    }

    // Print video path if recorded
    if (report.artifacts?.video) {
      console.log(chalk.cyan(`  📹 Video: ${report.artifacts.video}`));
    }

    // Print LLM evaluation if available
    if (report.llmEvaluation) {
      printLLMEvaluation(report);
    }

    return report;
  } catch (error) {
    spinner.fail(chalk.red(`Failed: ${error}`));
    throw error;
  }
}

function printLLMEvaluation(report: RunReport): void {
  if (!report.llmEvaluation) return;

  const eval_ = report.llmEvaluation;

  console.log(
    boxen(
      `${chalk.bold('🤖 LLM Evaluation')}\n\n` +
        `Overall Score: ${getScoreColor(eval_.overallScore)}${eval_.overallScore}/5${chalk.reset()}\n\n` +
        `${chalk.bold('Dimensions:')}\n` +
        eval_.dimensions
          .map(
            (d) =>
              `  ${d.name}: ${getScoreColor(d.score)}${d.score}/5${chalk.reset()} - ${chalk.gray(d.feedback.slice(0, 50))}...`
          )
          .join('\n'),
      {
        padding: 1,
        margin: { top: 1, bottom: 0, left: 2, right: 0 },
        borderStyle: 'round',
        borderColor: 'yellow',
      }
    )
  );

  if (eval_.suggestions.length > 0) {
    console.log(chalk.bold.yellow('\n  💡 Suggestions:\n'));
    eval_.suggestions.forEach((s, i) => {
      const severityColor =
        s.severity === 'critical'
          ? chalk.red
          : s.severity === 'high'
            ? chalk.yellow
            : s.severity === 'medium'
              ? chalk.blue
              : chalk.gray;
      console.log(
        `    ${i + 1}. ${severityColor(`[${s.severity.toUpperCase()}]`)} ${chalk.white(s.title)}`
      );
      console.log(chalk.gray(`       ${s.description.slice(0, 80)}...`));
      console.log(
        chalk.cyan(`       Labels: ${s.labels.join(', ')}\n`)
      );
    });
  }
}

function getScoreColor(score: number): chalk.Chalk {
  if (score >= 4) return chalk.green;
  if (score >= 3) return chalk.yellow;
  return chalk.red;
}

function printSummary(results: RunReport[]): void {
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log('\n');

  const table = new Table({
    head: [
      chalk.white('Scenario'),
      chalk.white('Status'),
      chalk.white('Duration'),
      chalk.white('LLM Score'),
    ],
    style: {
      head: [],
      border: ['gray'],
    },
  });

  results.forEach((r) => {
    const statusIcon =
      r.status === 'passed'
        ? chalk.green('✓ Passed')
        : r.status === 'failed'
          ? chalk.red('✗ Failed')
          : chalk.yellow('⚠ Error');

    const llmScore = r.llmEvaluation
      ? `${r.llmEvaluation.overallScore}/5`
      : chalk.gray('N/A');

    table.push([r.scenarioName, statusIcon, `${r.duration}ms`, llmScore]);
  });

  console.log(table.toString());

  const summaryColor = failed + errors > 0 ? chalk.red : chalk.green;
  console.log(
    boxen(
      summaryColor.bold(
        `${passed} passed, ${failed} failed, ${errors} errors`
      ),
      {
        padding: { top: 0, bottom: 0, left: 2, right: 2 },
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: failed + errors > 0 ? 'red' : 'green',
      }
    )
  );
}
