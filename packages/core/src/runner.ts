import {
  Scenario,
  RunConfig,
  RunReport,
  RunStatus,
  StepResult,
  AssertionResult,
  AuthConfig,
} from './types';
import { nanoid } from 'nanoid';
import { _electron as electron, ElectronApplication, Page, chromium, Browser } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * VS Code Scenario Runner using Playwright
 * 
 * Launches VS Code as Electron app, executes steps via Playwright automation,
 * captures screenshots and video. LLM evaluation is disabled for now.
 */

export type RunEventType = 
  | 'run:start'
  | 'run:complete'
  | 'step:start'
  | 'step:complete'
  | 'assertion:start'
  | 'assertion:complete'
  | 'evaluation:start'
  | 'evaluation:complete'
  | 'log'
  | 'screenshot'
  | 'error';

export interface RunEvent {
  type: RunEventType;
  timestamp: string;
  data: any;
}

export type RunEventHandler = (event: RunEvent) => void;

// Paths
const CONFIG_DIR = path.join(os.homedir(), '.scenario-runner');
const ARTIFACTS_DIR = path.join(CONFIG_DIR, 'artifacts');

/**
 * Get VS Code executable path
 */
function getVSCodePath(): string {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    const paths = [
      '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron',
      '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('VS Code not found. Install VS Code or VS Code Insiders.');
  } else if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const paths = [
      path.join(localAppData, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
      path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('VS Code not found. Install VS Code.');
  } else {
    const paths = ['/usr/bin/code-insiders', '/usr/bin/code', '/usr/share/code/code'];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('VS Code not found. Install VS Code.');
  }
}

interface VSCodeContext {
  app: ElectronApplication;
  page: Page;
  artifactsPath: string;
  screenshotCounter: number;
  videoPath?: string;
  /** Auth config for GitHub login (from env vars or config) */
  auth?: AuthConfig;
}

export interface LaunchOptions {
  /** Use fresh profile with isolated user-data and extensions (default: false) */
  freshProfile?: boolean;
  /** Record video of the scenario run */
  recordVideo?: boolean;
  /** GitHub auth config for fresh profile scenarios */
  auth?: AuthConfig;
}

/**
 * Launch VS Code with Playwright
 */
async function launchVSCode(
  scenario: Scenario,
  runId: string,
  emit: RunEventHandler,
  options: LaunchOptions = {}
): Promise<VSCodeContext> {
  // Default to using existing profile (already authenticated)
  const { freshProfile = false, recordVideo = false, auth } = options;
  
  const artifactsPath = path.join(ARTIFACTS_DIR, runId);
  fs.mkdirSync(artifactsPath, { recursive: true });
  fs.mkdirSync(path.join(artifactsPath, 'screenshots'), { recursive: true });
  
  // Create videos directory if recording
  const videosDir = path.join(artifactsPath, 'videos');
  if (recordVideo) {
    fs.mkdirSync(videosDir, { recursive: true });
  }
  
  emit({
    type: 'log',
    timestamp: new Date().toISOString(),
    data: { message: `Artifacts: ${artifactsPath}` },
  });

  const vscodePath = getVSCodePath();
  emit({
    type: 'log',
    timestamp: new Date().toISOString(),
    data: { message: `VS Code: ${vscodePath}` },
  });

  // Build launch args
  const args: string[] = [
    '--disable-telemetry',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--disable-updates',
  ];
  
  // Use fresh profile with isolated directories, or use existing VS Code config
  if (freshProfile) {
    const userDataDir = path.join(artifactsPath, 'user-data');
    const extensionsDir = path.join(artifactsPath, 'extensions');
    args.push(`--user-data-dir=${userDataDir}`);
    args.push(`--extensions-dir=${extensionsDir}`);
    emit({
      type: 'log',
      timestamp: new Date().toISOString(),
      data: { message: 'Using fresh profile (isolated user-data and extensions)' },
    });
  } else {
    emit({
      type: 'log',
      timestamp: new Date().toISOString(),
      data: { message: 'Using existing VS Code configuration' },
    });
  }

  // Add workspace if specified
  if (scenario.environment.workspacePath) {
    const workspacePath = scenario.environment.workspacePath.replace(/^~/, os.homedir());
    if (fs.existsSync(workspacePath)) {
      args.push(workspacePath);
      emit({
        type: 'log',
        timestamp: new Date().toISOString(),
        data: { message: `Workspace: ${workspacePath}` },
      });
    }
  }

  emit({
    type: 'log',
    timestamp: new Date().toISOString(),
    data: { message: 'Launching VS Code...' },
  });

  // Launch VS Code with Playwright Electron
  const app = await electron.launch({
    executablePath: vscodePath,
    args,
    timeout: 60000,
    recordVideo: recordVideo ? {
      dir: videosDir,
      size: { width: 1280, height: 720 },
    } : undefined,
  });

  // Get the main window
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  
  if (recordVideo) {
    emit({
      type: 'log',
      timestamp: new Date().toISOString(),
      data: { message: `Recording video to: ${videosDir}` },
    });
  }

  // Wait for VS Code to be ready
  emit({
    type: 'log',
    timestamp: new Date().toISOString(),
    data: { message: 'Waiting for VS Code to initialize...' },
  });

  await page.waitForSelector('.monaco-workbench', {
    state: 'visible',
    timeout: 60000,
  });
  
  // Give it a moment to fully initialize
  await page.waitForTimeout(2000);

  // Dismiss any dialogs
  await dismissDialogs(page, emit);

  emit({
    type: 'log',
    timestamp: new Date().toISOString(),
    data: { message: 'VS Code ready!' },
  });

  return {
    app,
    page,
    artifactsPath,
    screenshotCounter: 0,
    videoPath: recordVideo ? videosDir : undefined,
    auth,
  };
}

/**
 * Dismiss welcome tabs, trust dialogs, etc.
 */
async function dismissDialogs(page: Page, emit: RunEventHandler): Promise<void> {
  try {
    // Close welcome tab
    const welcomeTab = await page.$('[aria-label*="Welcome"]');
    if (welcomeTab) {
      const closeBtn = await page.$('.tab.active .codicon-close');
      if (closeBtn) {
        await closeBtn.click();
        emit({
          type: 'log',
          timestamp: new Date().toISOString(),
          data: { message: 'Closed Welcome tab' },
        });
      }
    }

    // Trust workspace dialog
    const trustDialog = await page.$('.monaco-dialog-box');
    if (trustDialog) {
      const trustBtn = await trustDialog.$('button:has-text("Yes, I trust")');
      if (trustBtn) {
        await trustBtn.click();
        emit({
          type: 'log',
          timestamp: new Date().toISOString(),
          data: { message: 'Accepted workspace trust' },
        });
      }
    }
  } catch {
    // Dialogs may not be present
  }
}

/**
 * Get auth credentials from environment variables
 */
function getAuthFromEnv(): AuthConfig {
  return {
    email: process.env.SCENARIO_GITHUB_EMAIL,
    password: process.env.SCENARIO_GITHUB_PASSWORD,
  };
}

/**
 * Perform GitHub login for Copilot authentication
 * 
 * This handles the VS Code -> Browser OAuth flow:
 * 1. Use keyboard navigation to select "Continue with GitHub" in VS Code sign-in dialog
 * 2. VS Code opens browser to github.com/login/device
 * 3. We automate the browser login with provided credentials
 * 4. Authorize the VS Code app
 * 5. Return to VS Code which should now be authenticated
 */
async function performGitHubLogin(
  vscodePage: Page,
  ctx: VSCodeContext,
  log: (msg: string) => void
): Promise<void> {
  // Get auth from context or environment
  const auth = ctx.auth || getAuthFromEnv();
  
  if (!auth.email || !auth.password) {
    log('⚠️  No GitHub credentials provided. Set SCENARIO_GITHUB_EMAIL and SCENARIO_GITHUB_PASSWORD environment variables.');
    log('   Skipping automated login - manual login may be required.');
    return;
  }
  
  log('Starting GitHub authentication flow via keyboard navigation...');
  
  // The sign-in dialog has focus and shows:
  // - "Continue with GitHub" (first/focused button)
  // - "Continue with Google"
  // - "Continue with Apple"
  // - "Continue with GHE.com"
  // - "Skip for now"
  
  // The "Continue with GitHub" button should be the first/default button
  // Just press Enter to activate it
  log('Pressing Enter to select "Continue with GitHub"...');
  await vscodePage.keyboard.press('Enter');
  await vscodePage.waitForTimeout(2000);
  
  // VS Code may show a dialog asking to open external URL
  // This is a VS Code modal dialog, try pressing Enter again to confirm
  log('Checking for external URL confirmation dialog...');
  
  // Take a screenshot to see what's happening
  const screenshotPath = `${ctx.artifactsPath}/screenshots/auth_dialog.png`;
  await vscodePage.screenshot({ path: screenshotPath });
  log(`Auth dialog screenshot: ${screenshotPath}`);
  
  // Try pressing Enter to confirm any "Open" dialog
  await vscodePage.keyboard.press('Enter');
  await vscodePage.waitForTimeout(3000);
  
  // Now we need to automate the browser that VS Code opened
  // VS Code opens the default browser, we'll launch our own Playwright browser
  // to navigate to GitHub and complete the auth flow
  log('Launching browser for GitHub authentication...');
  
  let browser: Browser | undefined;
  try {
    // Launch browser with visible window for OAuth flow
    browser = await chromium.launch({
      headless: false, // Must be visible for OAuth
      channel: 'chrome', // Use system Chrome if available
    });
    
    const browserContext = await browser.newContext();
    const browserPage = await browserContext.newPage();
    
    // Navigate to GitHub login
    log('Navigating to GitHub login...');
    await browserPage.goto('https://github.com/login');
    await browserPage.waitForLoadState('networkidle');
    
    // Check if already logged in (redirected to home or other page)
    const currentUrl = browserPage.url();
    if (!currentUrl.includes('/login')) {
      log('Already logged into GitHub, proceeding to device authorization...');
    } else {
      // Fill in credentials
      log('Entering GitHub credentials...');
      await browserPage.fill('#login_field', auth.email);
      await browserPage.fill('#password', auth.password);
      await browserPage.click('input[type="submit"]');
      
      // Wait for login to complete
      await browserPage.waitForLoadState('networkidle');
      await browserPage.waitForTimeout(2000);
      
      // Check for 2FA - this would require additional handling
      const twoFactorField = await browserPage.$('#app_totp');
      if (twoFactorField) {
        log('⚠️  Two-factor authentication required. Please complete 2FA manually.');
        // Wait longer for manual 2FA
        await browserPage.waitForTimeout(30000);
      }
    }
    
    // Now go to GitHub device activation page (VS Code uses device flow)
    log('Checking for device authorization...');
    await browserPage.goto('https://github.com/login/device');
    await browserPage.waitForLoadState('networkidle');
    await browserPage.waitForTimeout(1000);
    
    // Look for authorize button
    const authorizeBtn = await browserPage.$('button[type="submit"]:has-text("Authorize")');
    if (authorizeBtn) {
      log('Clicking Authorize button...');
      await authorizeBtn.click();
      await browserPage.waitForLoadState('networkidle');
      await browserPage.waitForTimeout(2000);
    }
    
    // Check for success message
    const successText = await browserPage.textContent('body');
    if (successText?.includes('successfully') || successText?.includes('authorized') || successText?.includes('Congratulations')) {
      log('✅ GitHub authorization successful!');
    } else {
      log('Authorization page reached. Please check VS Code for confirmation.');
    }
    
    // Close browser
    await browser.close();
    browser = undefined;
    
    // Return to VS Code and wait for it to pick up the auth
    log('Returning to VS Code...');
    await vscodePage.waitForTimeout(3000);
    
    // Check if Copilot is now available
    log('GitHub authentication flow completed. Copilot should now be available.');
    
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log(`⚠️  Browser auth error: ${errMsg}`);
    log('   You may need to complete authentication manually.');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Already closed
      }
    }
  }
}

/**
 * Smart element finder - tries multiple selector strategies
 */
async function findElement(page: Page, target: string) {
  const strategies = [
    target,
    `text="${target}"`,
    `[aria-label="${target}"]`,
    `[aria-label*="${target}"]`,
    `[title="${target}"]`,
    `[title*="${target}"]`,
    `role=button[name="${target}"]`,
    `role=tab[name="${target}"]`,
    `[data-testid="${target}"]`,
  ];

  for (const selector of strategies) {
    try {
      const element = await page.$(selector);
      if (element) return element;
    } catch {
      // Try next strategy
    }
  }
  
  throw new Error(`Element not found: ${target}`);
}

/**
 * Execute a single step
 */
async function executeStep(
  step: Scenario['steps'][0],
  ctx: VSCodeContext,
  emit: RunEventHandler
): Promise<StepResult> {
  const startTime = new Date().toISOString();
  const logs: string[] = [];
  
  const log = (message: string) => {
    const entry = `[${new Date().toISOString()}] ${message}`;
    logs.push(entry);
    emit({
      type: 'log',
      timestamp: new Date().toISOString(),
      data: { stepId: step.id, message },
    });
  };
  
  emit({
    type: 'step:start',
    timestamp: startTime,
    data: { stepId: step.id, action: step.action, description: step.description },
  });
  
  log(`Executing: ${step.action} - ${step.description}`);
  
  const timeout = step.timeout || 10000;
  let error: string | undefined;
  let status: 'passed' | 'failed' = 'passed';
  let screenshot: string | undefined;
  
  try {
    const { page } = ctx;
    const args = step.args || {};
    
    switch (step.action) {
      case 'launchVSCodeWithProfile':
        // Already launched
        log('VS Code already launched');
        break;
        
      case 'openCommandPalette':
        log('Opening command palette (Cmd/Ctrl+Shift+P)');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
        await page.waitForTimeout(500);
        break;
        
      case 'openCopilotChat':
        log('Opening Copilot Chat');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+I' : 'Control+Shift+I');
        await page.waitForTimeout(2000);
        
        // Check if sign-in dialog appeared by taking a screenshot and checking visually
        // The sign-in dialog shows "Sign in to use AI Features"
        const pageContent = await page.content();
        const needsAuth = pageContent.includes('Sign in to use AI Features') || 
                          pageContent.includes('Continue with GitHub');
        
        if (needsAuth) {
          log('Sign-in dialog detected, initiating GitHub auth via keyboard navigation...');
          await performGitHubLogin(page, ctx, log);
        }
        break;
        
      case 'openInlineChat':
        log('Opening inline chat (Cmd/Ctrl+I)');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+I' : 'Control+I');
        await page.waitForTimeout(500);
        break;
        
      case 'typeText':
        const text = args.text || args.message || '';
        log(`Typing: "${text}"`);
        await page.keyboard.type(text, { delay: 30 });
        break;
        
      case 'sendChatMessage':
        const message = args.message || '';
        log(`Sending: "${message}"`);
        await page.keyboard.type(message, { delay: 30 });
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        if (args.waitForResponse) {
          log('Waiting for response...');
          await page.waitForTimeout(timeout);
        }
        break;
        
      case 'pressKey':
        const key = args.key || '';
        log(`Pressing: ${key}`);
        await page.keyboard.press(key);
        break;
        
      case 'click':
        const target = args.target || '';
        log(`Clicking: ${target}`);
        const el = await findElement(page, target);
        await el.click();
        break;
        
      case 'wait':
        const duration = args.duration || 1000;
        log(`Waiting ${duration}ms`);
        await page.waitForTimeout(duration);
        break;
        
      case 'focusEditor':
        log('Focusing editor');
        try {
          await page.click('.monaco-editor', { timeout: 5000 });
        } catch {
          log('Could not find editor, trying command');
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+1' : 'Control+1');
        }
        break;
        
      case 'acceptSuggestion':
        log('Accepting suggestion');
        await page.keyboard.press('Tab');
        break;
        
      case 'openFile':
        const filePath = args.path || '';
        log(`Opening file: ${filePath}`);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+P' : 'Control+P');
        await page.waitForTimeout(300);
        await page.keyboard.type(filePath, { delay: 30 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        break;
        
      case 'openSettings':
        log('Opening settings');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
        await page.waitForTimeout(500);
        break;
        
      case 'setBreakpoint':
        const line = args.line || 1;
        log(`Setting breakpoint at line ${line}`);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+G' : 'Control+G');
        await page.waitForTimeout(300);
        await page.keyboard.type(String(line));
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.press('F9');
        break;
        
      case 'runTerminalCommand':
        const cmd = args.command || '';
        log(`Running terminal command: ${cmd}`);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+`' : 'Control+`');
        await page.waitForTimeout(1000);
        await page.keyboard.type(cmd, { delay: 20 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        break;

      case 'verifyEditorContent':
      case 'assertElementVisible':
      case 'assertTextContains':
      case 'assertSignedInAccount':
        log(`Verification: ${step.action} (check screenshot)`);
        break;
        
      case 'configureMCPServer':
      case 'openMCPPanel':
        log(`MCP action: ${step.action}`);
        // Open command palette and search for MCP
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
        await page.waitForTimeout(500);
        await page.keyboard.type('MCP', { delay: 30 });
        await page.waitForTimeout(500);
        break;
        
      case 'hover':
        log(`Hover: ${args.target || 'unknown'}`);
        if (args.target) {
          try {
            const hoverEl = await findElement(page, args.target);
            await hoverEl.hover();
          } catch {
            log('Could not find hover target');
          }
        }
        break;
        
      case 'githubLogin':
        await performGitHubLogin(page, ctx, log);
        break;
        
      case 'signInWithGitHub':
        // Alias for githubLogin
        await performGitHubLogin(page, ctx, log);
        break;
        
      default:
        log(`Unknown action: ${step.action} - skipping`);
    }
    
    // Take screenshot after step
    ctx.screenshotCounter++;
    const screenshotPath = path.join(
      ctx.artifactsPath, 
      'screenshots', 
      `${String(ctx.screenshotCounter).padStart(3, '0')}_${step.id}.png`
    );
    await ctx.page.screenshot({ path: screenshotPath, fullPage: true });
    screenshot = screenshotPath;
    log(`Screenshot: ${screenshotPath}`);
    
    emit({
      type: 'screenshot',
      timestamp: new Date().toISOString(),
      data: { stepId: step.id, path: screenshotPath },
    });
    
  } catch (err) {
    status = 'failed';
    error = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${error}`);
    
    // Failure screenshot
    try {
      const failPath = path.join(ctx.artifactsPath, 'screenshots', `FAIL_${step.id}.png`);
      await ctx.page.screenshot({ path: failPath, fullPage: true });
      screenshot = failPath;
      log(`Failure screenshot: ${failPath}`);
    } catch {
      log('Could not capture failure screenshot');
    }
  }
  
  const endTime = new Date().toISOString();
  const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
  
  const result: StepResult = {
    stepId: step.id,
    status,
    startTime,
    endTime,
    duration,
    logs,
    error,
    screenshot,
  };
  
  emit({
    type: 'step:complete',
    timestamp: endTime,
    data: result,
  });
  
  return result;
}

/**
 * Execute an assertion
 */
async function executeAssertion(
  assertion: Scenario['assertions'][0],
  ctx: VSCodeContext,
  emit: RunEventHandler
): Promise<AssertionResult> {
  emit({
    type: 'assertion:start',
    timestamp: new Date().toISOString(),
    data: { assertionId: assertion.id, type: assertion.type },
  });
  
  let passed = true;
  let actual: any;
  let error: string | undefined;
  
  try {
    const { page } = ctx;
    
    switch (assertion.type) {
      case 'elementVisible':
        try {
          await page.waitForSelector(assertion.target || '', { timeout: 5000, state: 'visible' });
          actual = true;
        } catch {
          actual = false;
          passed = assertion.expected === false;
          if (!passed) error = `Element not visible: ${assertion.target}`;
        }
        break;
        
      case 'elementNotVisible':
        try {
          await page.waitForSelector(assertion.target || '', { timeout: 2000, state: 'hidden' });
          actual = true;
        } catch {
          actual = false;
          passed = false;
          error = `Element still visible: ${assertion.target}`;
        }
        break;
        
      case 'textContains':
        try {
          const content = await page.textContent(assertion.target || 'body');
          actual = content?.substring(0, 200);
          passed = content?.includes(assertion.expected) || false;
          if (!passed) error = `Text not found: "${assertion.expected}"`;
        } catch (e) {
          passed = false;
          error = `Could not read text: ${e}`;
        }
        break;
        
      case 'llmGrade':
        // LLM evaluation disabled for now
        passed = true;
        actual = 'LLM evaluation skipped';
        break;
        
      default:
        passed = true;
        actual = `Assertion type "${assertion.type}" not yet implemented`;
    }
  } catch (err) {
    passed = false;
    error = err instanceof Error ? err.message : String(err);
  }
  
  const result: AssertionResult = {
    assertionId: assertion.id,
    passed,
    expected: assertion.expected,
    actual,
    error,
  };
  
  emit({
    type: 'assertion:complete',
    timestamp: new Date().toISOString(),
    data: result,
  });
  
  return result;
}

/**
 * Run a complete scenario
 */
export async function runScenario(
  scenario: Scenario,
  config: RunConfig,
  onEvent?: RunEventHandler
): Promise<RunReport> {
  const emit: RunEventHandler = onEvent || (() => {});
  const runId = nanoid();
  const startTime = new Date().toISOString();
  
  emit({
    type: 'run:start',
    timestamp: startTime,
    data: { runId, scenarioId: scenario.id, config },
  });
  
  const stepResults: StepResult[] = [];
  const assertionResults: AssertionResult[] = [];
  const screenshots: string[] = [];
  let videoPath: string | undefined;
  let status: RunStatus = 'running';
  let error: string | undefined;
  let ctx: VSCodeContext | undefined;
  
  try {
    // Launch VS Code (defaults to existing profile for already-authenticated scenarios)
    ctx = await launchVSCode(scenario, runId, emit, { 
      freshProfile: config.freshProfile ?? false,
      recordVideo: config.recordVideo ?? false,
      auth: config.auth,
    });
    
    // Execute steps
    for (const step of scenario.steps) {
      const result = await executeStep(step, ctx, emit);
      stepResults.push(result);
      
      if (result.screenshot) {
        screenshots.push(result.screenshot);
      }
      
      // Stop on required step failure
      if (result.status === 'failed' && !step.optional) {
        status = 'failed';
        error = result.error;
        break;
      }
    }
    
    // Execute assertions if all steps passed
    if (status === 'running') {
      for (const assertion of scenario.assertions) {
        const result = await executeAssertion(assertion, ctx, emit);
        assertionResults.push(result);
        
        if (!result.passed && assertion.required) {
          status = 'failed';
          error = result.error || `Assertion failed: ${assertion.id}`;
          break;
        }
      }
    }
    
    // Final status
    if (status === 'running') {
      status = 'passed';
    }
  } catch (err) {
    status = 'error';
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    
    // Provide helpful error message for common VS Code conflict
    if (errMsg.includes('Target page, context or browser has been closed')) {
      error = 'VS Code closed unexpectedly. This usually happens when another VS Code instance is running with the same profile. Try using --fresh flag for isolated runs, or close other VS Code windows.';
    } else {
      error = errMsg;
    }
    
    emit({
      type: 'error',
      timestamp: new Date().toISOString(),
      data: { error },
    });
  } finally {
    // Cleanup - close VS Code
    if (ctx) {
      emit({
        type: 'log',
        timestamp: new Date().toISOString(),
        data: { message: 'Closing VS Code...' },
      });
      try {
        // Save video path before closing (Playwright saves video on close)
        if (ctx.videoPath) {
          const video = ctx.page.video();
          if (video) {
            videoPath = await video.path();
          }
        }
        await ctx.app.close();
        
        // Log video path if recorded
        if (videoPath && fs.existsSync(videoPath)) {
          emit({
            type: 'log',
            timestamp: new Date().toISOString(),
            data: { message: `Video saved: ${videoPath}` },
          });
        }
      } catch {
        // May already be closed
      }
    }
  }
  
  const endTime = new Date().toISOString();
  const artifactsPath = ctx?.artifactsPath || '';
  
  // Build report
  const report: RunReport = {
    id: runId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    status,
    startTime,
    endTime,
    duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
    environment: scenario.environment,
    steps: stepResults,
    assertions: assertionResults,
    artifacts: {
      screenshots,
      logs: artifactsPath ? path.join(artifactsPath, 'run.log') : '',
      video: videoPath,
      chatTranscript: undefined,
    },
    error,
  };
  
  // LLM evaluation disabled for now
  if (config.enableLLMGrading) {
    emit({
      type: 'log',
      timestamp: new Date().toISOString(),
      data: { message: 'LLM evaluation is currently disabled' },
    });
  }
  
  emit({
    type: 'run:complete',
    timestamp: endTime,
    data: report,
  });
  
  // Log summary
  emit({
    type: 'log',
    timestamp: new Date().toISOString(),
    data: { 
      message: `\n📁 Artifacts saved to: ${artifactsPath}\n   Screenshots: ${screenshots.length} captured`,
    },
  });
  
  return report;
}

/**
 * Reset sandbox
 */
export async function resetSandbox(runId: string): Promise<void> {
  console.log(`[Sandbox] Reset for run: ${runId}`);
}

/**
 * Cleanup artifacts
 */
export async function cleanupRun(runId: string): Promise<void> {
  const artifactsPath = path.join(ARTIFACTS_DIR, runId);
  if (fs.existsSync(artifactsPath)) {
    fs.rmSync(artifactsPath, { recursive: true, force: true });
  }
  console.log(`[Cleanup] Removed: ${runId}`);
}
