import chalk from 'chalk';
import ora from 'ora';
import { startRecording, stopRecording, RecorderConfig, RecorderEvent } from '@scenario-grader/core';
import * as readline from 'readline';
import * as path from 'path';

interface RecordOptions {
  name?: string;
  description?: string;
  tags?: string;
  priority?: string;
  workspace?: string;
  output?: string;
  owner?: string;
  interactive?: boolean;
}

export async function recordCommand(options: RecordOptions): Promise<void> {
  console.log(chalk.cyan('\n🎬 VS Code Scenario Recorder\n'));
  
  // Handle interactive mode
  if (options.interactive) {
    await interactiveRecordSession(options);
    return;
  }
  
  // Non-interactive mode - use provided options or defaults
  const config: RecorderConfig = {
    scenarioName: options.name,
    scenarioDescription: options.description,
    tags: options.tags?.split(',').map(t => t.trim()).filter(Boolean),
    priority: (['P0', 'P1', 'P2'].includes(options.priority || '') ? options.priority : 'P1') as any,
    workspacePath: options.workspace,
    outputPath: options.output,
    owner: options.owner,
    captureScreenshots: true,
  };
  
  await runRecording(config);
}

async function interactiveRecordSession(options: RecordOptions): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const question = (prompt: string, defaultValue?: string): Promise<string> => {
    const fullPrompt = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `;
    return new Promise((resolve) => {
      rl.question(fullPrompt, (answer) => {
        resolve(answer || defaultValue || '');
      });
    });
  };
  
  try {
    console.log(chalk.gray('Fill in scenario details (press Enter to use defaults):\n'));
    
    // Gather scenario metadata
    const name = options.name || await question(chalk.yellow('📝 Scenario name'));
    const description = options.description || await question(chalk.yellow('📄 Description'));
    const tagsInput = options.tags || await question(chalk.yellow('🏷️  Tags (comma-separated)'), 'recorded');
    const priorityInput = options.priority || await question(chalk.yellow('⭐ Priority'), 'P1');
    const owner = options.owner || await question(chalk.yellow('👤 Owner'));
    const workspace = options.workspace || await question(chalk.yellow('📁 Workspace path (optional)'));
    const output = options.output || await question(chalk.yellow('💾 Output path'), './scenarios');
    
    const config: RecorderConfig = {
      scenarioName: name || `recorded-scenario-${Date.now()}`,
      scenarioDescription: description || 'Recorded scenario',
      tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      priority: (['P0', 'P1', 'P2'].includes(priorityInput) ? priorityInput : 'P1') as any,
      workspacePath: workspace || undefined,
      outputPath: output ? path.resolve(output, `${(name || 'recorded-scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.yaml`) : undefined,
      owner: owner || undefined,
      captureScreenshots: true,
    };
    
    console.log(chalk.gray('\n─────────────────────────────────────────────────\n'));
    
    await runRecording(config, rl);
  } finally {
    rl.close();
  }
}

async function runRecording(config: RecorderConfig, rl?: readline.Interface): Promise<void> {
  const spinner = ora('Launching VS Code...').start();
  let ctx: any;
  
  // Event handler
  const handleEvent = (event: RecorderEvent) => {
    switch (event.type) {
      case 'recorder:log':
        if (event.data?.message) {
          if (spinner.isSpinning) {
            spinner.text = event.data.message;
          } else {
            console.log(chalk.gray(`  ${event.data.message}`));
          }
        }
        break;
      case 'recorder:start':
        spinner.succeed('VS Code launched!');
        console.log(chalk.green('\n🔴 Recording started!\n'));
        console.log(chalk.white('   Perform your scenario steps in VS Code.'));
        console.log(chalk.white('   Your keyboard and click actions will be recorded.\n'));
        console.log(chalk.yellow('   Press Enter here when done, or Ctrl+C to cancel.\n'));
        break;
      case 'recorder:action':
        const action = event.data;
        if (action.type === 'keyboard' && action.key) {
          console.log(chalk.cyan(`   ⌨️  ${action.key}`));
        } else if (action.type === 'click' && action.target) {
          console.log(chalk.magenta(`   🖱️  Click: ${action.target}`));
        } else if (action.type === 'type' && action.text) {
          // Don't spam for every character
        }
        break;
      case 'recorder:screenshot':
        console.log(chalk.blue(`   📸 Screenshot: ${path.basename(event.data.path)}`));
        break;
      case 'recorder:stop':
        console.log(chalk.yellow('\n⏹️  Recording stopped.'));
        break;
      case 'recorder:saved':
        console.log(chalk.green(`\n✅ Scenario saved!`));
        console.log(chalk.white(`   File: ${event.data.yamlPath}`));
        break;
      case 'recorder:error':
        console.log(chalk.red(`\n❌ Error: ${event.data?.message || 'Unknown error'}`));
        break;
    }
  };
  
  try {
    // Start recording
    ctx = await startRecording(config, handleEvent);
    
    // Wait for user to press Enter or Ctrl+C
    await new Promise<void>((resolve, reject) => {
      // Handle Ctrl+C
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n⚠️  Recording cancelled by user.'));
        reject(new Error('Cancelled'));
      });
      
      // Wait for Enter key
      if (rl) {
        rl.question('', () => resolve());
      } else {
        const tempRl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        tempRl.question('', () => {
          tempRl.close();
          resolve();
        });
      }
    });
    
    // Stop recording and generate scenario
    spinner.start('Generating scenario...');
    const result = await stopRecording(ctx, handleEvent);
    spinner.succeed('Done!');
    
    // Show summary
    console.log(chalk.cyan('\n─────────────────────────────────────────────────'));
    console.log(chalk.bold.white('\n📋 Scenario Summary:\n'));
    console.log(chalk.white(`   ID:          ${result.scenario.id}`));
    console.log(chalk.white(`   Name:        ${result.scenario.name}`));
    console.log(chalk.white(`   Steps:       ${result.scenario.steps.length}`));
    console.log(chalk.white(`   Priority:    ${result.scenario.priority}`));
    console.log(chalk.white(`   Tags:        ${result.scenario.tags?.join(', ') || 'none'}`));
    console.log(chalk.gray(`\n   File: ${result.yamlPath}\n`));
    
    // Show steps
    console.log(chalk.bold.white('📍 Recorded Steps:\n'));
    result.scenario.steps.forEach((step, index) => {
      console.log(chalk.gray(`   ${index + 1}. `) + chalk.white(step.description));
    });
    
    console.log(chalk.cyan('\n─────────────────────────────────────────────────\n'));
    
    // Suggest next steps
    console.log(chalk.bold.white('💡 Next Steps:\n'));
    console.log(chalk.gray(`   1. Review the generated YAML file`));
    console.log(chalk.gray(`   2. Edit step descriptions for clarity`));
    console.log(chalk.gray(`   3. Add assertions for validation`));
    console.log(chalk.gray(`   4. Run: `) + chalk.cyan(`scenario-runner run ${result.scenario.id}\n`));
    
  } catch (err) {
    if (spinner.isSpinning) {
      spinner.fail('Recording failed');
    }
    
    const message = err instanceof Error ? err.message : String(err);
    
    if (message === 'Cancelled') {
      // Clean up on cancel
      if (ctx) {
        try {
          await ctx.app.close();
        } catch {
          // Already closed
        }
      }
      process.exit(0);
    }
    
    console.error(chalk.red(`\n❌ Error: ${message}\n`));
    
    if (message.includes('VS Code not found')) {
      console.log(chalk.yellow('   Please install VS Code or VS Code Insiders.\n'));
    } else if (message.includes('closed')) {
      console.log(chalk.yellow('   VS Code was closed unexpectedly.'));
      console.log(chalk.yellow('   Try closing other VS Code windows before recording.\n'));
    }
    
    process.exit(1);
  }
}
