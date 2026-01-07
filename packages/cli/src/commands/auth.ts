import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import {
  authenticateWithDeviceFlow,
  loadAuth,
  clearAuth,
  getAuthStatus,
  verifyAuth,
  hasValidAuth,
} from '@scenario-grader/core';

interface AuthOptions {
  logout?: boolean;
  status?: boolean;
  verify?: boolean;
}

/**
 * CLI action handler for authentication
 */
export async function authCommand(options: AuthOptions): Promise<void> {
  // Handle --status flag
  if (options.status) {
    await showAuthStatus();
    return;
  }
  
  // Handle --logout flag
  if (options.logout) {
    await performLogout();
    return;
  }
  
  // Handle --verify flag
  if (options.verify) {
    await verifyAuthToken();
    return;
  }
  
  // Default: perform login
  await performLogin();
}

async function showAuthStatus(): Promise<void> {
  const status = getAuthStatus();
  
  console.log('');
  console.log(chalk.bold('GitHub Authentication Status'));
  console.log(chalk.dim('─'.repeat(40)));
  
  if (status.authenticated) {
    console.log(`  ${chalk.green('●')} Authenticated`);
    if (status.username) {
      console.log(`  ${chalk.gray('Username:')} ${chalk.cyan(status.username)}`);
    }
    if (status.email) {
      console.log(`  ${chalk.gray('Email:')}    ${status.email}`);
    }
  } else {
    console.log(`  ${chalk.red('●')} Not authenticated`);
    console.log('');
    console.log(`  Run ${chalk.cyan('scenario-grader auth')} to authenticate`);
  }
  
  console.log('');
}

async function performLogout(): Promise<void> {
  const spinner = ora('Logging out...').start();
  
  try {
    clearAuth();
    spinner.succeed('Logged out successfully');
    console.log('');
    console.log(`  Run ${chalk.cyan('scenario-grader auth')} to authenticate again`);
    console.log('');
  } catch (err) {
    spinner.fail(`Logout failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function verifyAuthToken(): Promise<void> {
  const spinner = ora('Verifying authentication...').start();
  
  if (!hasValidAuth()) {
    spinner.fail('Not authenticated');
    console.log('');
    console.log(`  Run ${chalk.cyan('scenario-grader auth')} to authenticate`);
    console.log('');
    process.exit(1);
  }
  
  try {
    const valid = await verifyAuth();
    
    if (valid) {
      spinner.succeed('Authentication is valid');
      const status = getAuthStatus();
      if (status.username) {
        console.log(`  ${chalk.gray('Logged in as:')} ${chalk.cyan(status.username)}`);
      }
    } else {
      spinner.fail('Authentication token is invalid or expired');
      console.log('');
      console.log(`  Run ${chalk.cyan('scenario-grader auth')} to re-authenticate`);
      process.exit(1);
    }
  } catch (err) {
    spinner.fail(`Verification failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  
  console.log('');
}

async function performLogin(): Promise<void> {
  // Check if already authenticated
  const existingStatus = getAuthStatus();
  if (existingStatus.authenticated) {
    console.log('');
    console.log(chalk.yellow(`  Already authenticated as ${chalk.cyan(existingStatus.username || 'unknown')}`));
    console.log(`  Run ${chalk.cyan('scenario-grader auth --logout')} first to sign out`);
    console.log('');
    return;
  }
  
  console.log('');
  console.log(chalk.bold('GitHub Device Authentication'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log('');
  console.log(chalk.dim('This will authenticate your GitHub account for use with'));
  console.log(chalk.dim('VS Code Copilot scenarios. No password is shared directly.'));
  console.log('');
  
  const spinner = ora('Starting device authentication flow...').start();
  
  try {
    const auth = await authenticateWithDeviceFlow(
      // Called when we have a user code to display
      (userCode, verificationUri) => {
        spinner.stop();
        
        console.log(chalk.dim('─'.repeat(50)));
        console.log('');
        console.log(chalk.bold('  Open this URL in your browser:'));
        console.log(`  ${chalk.cyan(verificationUri)}`);
        console.log('');
        console.log(chalk.bold('  Enter this code:'));
        console.log(`  ${chalk.bgWhite.black.bold(` ${userCode} `)}`);
        console.log('');
        console.log(chalk.dim('─'.repeat(50)));
        console.log('');
        
        // Try to open the browser automatically
        console.log(chalk.dim('Opening browser...'));
        open(verificationUri).catch(() => {
          // If we can't open browser, user will do it manually
        });
        
        spinner.start('Waiting for authorization...');
      },
      // Called with status updates
      (status) => {
        spinner.text = status;
      }
    );
    
    spinner.succeed(`Authenticated as ${chalk.cyan(auth.username || auth.email || 'GitHub user')}`);
    console.log('');
    console.log(chalk.green('  ✓ GitHub authentication saved'));
    console.log(chalk.dim(`    Token stored in ~/.scenario-runner/auth.json`));
    console.log('');
    console.log(chalk.bold('  You can now run scenarios with:'));
    console.log(`    ${chalk.cyan('scenario-grader run <scenario> --fresh')}`);
    console.log('');
    
  } catch (err) {
    spinner.fail(`Authentication failed: ${err instanceof Error ? err.message : String(err)}`);
    console.log('');
    console.log(chalk.dim('  Common issues:'));
    console.log(chalk.dim('  • Make sure you have a GitHub account'));
    console.log(chalk.dim('  • Check your internet connection'));
    console.log(chalk.dim('  • Try again if the code expired'));
    console.log('');
    process.exit(1);
  }
}
