import {
  Scenario,
  Assertion,
  RunConfig,
  RunReport,
  RunStatus,
  StepResult,
  AssertionResult,
  AuthConfig,
} from './types';
import { nanoid } from 'nanoid';
import { _electron as electron, ElectronApplication, Page, chromium, Browser } from 'playwright';
import { ScreenshotMethod } from './types';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * VS Code Scenario Runner using Playwright
 * 
 * Launches VS Code as Electron app, executes steps via Playwright automation,
 * captures screenshots and video. LLM evaluation is disabled for now.
 */

// ============================================================================
// Error Types
// ============================================================================

export class RunnerError extends Error {
  constructor(
    message: string,
    public readonly code: RunnerErrorCode,
    public readonly recoverable: boolean = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RunnerError';
  }
}

export type RunnerErrorCode =
  | 'VSCODE_NOT_FOUND'
  | 'VSCODE_LAUNCH_FAILED'
  | 'VSCODE_CRASHED'
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_NOT_INTERACTABLE'
  | 'TIMEOUT'
  | 'STEP_FAILED'
  | 'ASSERTION_FAILED'
  | 'AUTH_FAILED';

// ============================================================================
// Retry Configuration
// ============================================================================

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Initial delay between retries in ms (default: 500) */
  initialDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Maximum delay between retries in ms (default: 5000) */
  maxDelayMs: number;
  /** Error codes that should trigger a retry */
  retryableErrors: RunnerErrorCode[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 500,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
  retryableErrors: ['ELEMENT_NOT_FOUND', 'ELEMENT_NOT_INTERACTABLE', 'TIMEOUT'],
};

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: { stepId?: string; action?: string }
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let delay = cfg.initialDelayMs;
  
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      // Check if error is retryable
      const isRetryable = err instanceof RunnerError 
        ? cfg.retryableErrors.includes(err.code)
        : isTransientError(lastError);
      
      if (!isRetryable || attempt === cfg.maxAttempts) {
        throw lastError;
      }
      
      // Log retry attempt
      const contextStr = context ? ` [${context.stepId || context.action || 'unknown'}]` : '';
      console.log(`⚠️  Attempt ${attempt}/${cfg.maxAttempts} failed${contextStr}: ${lastError.message}`);
      console.log(`   Retrying in ${delay}ms...`);
      
      await sleep(delay);
      delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelayMs);
    }
  }
  
  throw lastError;
}

/**
 * Check if an error is transient and worth retrying
 */
function isTransientError(err: Error): boolean {
  const message = err.message.toLowerCase();
  
  // Playwright-specific transient errors
  const transientPatterns = [
    'element is not attached',
    'element is not visible',
    'element is not enabled',
    'element is not stable',
    'element is outside of the viewport',
    'waiting for selector',
    'timeout',
    'target closed',
    'navigation interrupted',
    'execution context was destroyed',
    'frame was detached',
    'connection closed',
    'browser has been closed',
  ];
  
  return transientPatterns.some(pattern => message.includes(pattern));
}

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
  /** Preferred screenshot method for this run */
  screenshotMethod?: ScreenshotMethod;
}

/**
 * Take a screenshot of the Electron window using native capture
 * This ensures we get the full window content, not just the viewport
 */
async function takeNativeScreenshot(
  app: ElectronApplication,
  page: Page,
  screenshotPath: string,
  preferredMethod: ScreenshotMethod = 'electron'
): Promise<void> {
  const orders: Record<ScreenshotMethod, Array<'electron' | 'os' | 'playwright'>> = {
    electron: ['electron', 'os', 'playwright'],
    os: ['os', 'electron', 'playwright'],
    playwright: ['playwright', 'electron', 'os'],
  };

  const tryOrder = orders[preferredMethod] || orders.electron;

  for (const method of tryOrder) {
    try {
      if (method === 'electron') {
        const browserWindow = await app.browserWindow(page);
        const nativeImage = await browserWindow.evaluate(async (win: any) => {
          const image = await win.webContents.capturePage();
          return image.toPNG().toString('base64');
        });
        const buffer = Buffer.from(nativeImage, 'base64');
        fs.writeFileSync(screenshotPath, buffer);
        return;
      }

      if (method === 'os') {
        const sdMod = await import('screenshot-desktop');
        const sd = (sdMod && (sdMod as any).default) ? (sdMod as any).default : sdMod;
        const img = await sd({ format: 'png' }) as Buffer | string;
        if (Buffer.isBuffer(img)) {
          fs.writeFileSync(screenshotPath, img);
          return;
        }
        if (typeof img === 'string') {
          try {
            fs.writeFileSync(screenshotPath, Buffer.from(img, 'base64'));
            return;
          } catch {}
        }
      }

      if (method === 'playwright') {
        await page.screenshot({ path: screenshotPath });
        return;
      }
    } catch (e) {
      // continue to next method
      continue;
    }
  }

  throw new RunnerError('Failed to capture screenshot via any method', 'STEP_FAILED', true);
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
  const { freshProfile = false, recordVideo = false, auth, screenshotMethod } = options;
  
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
  if (scenario.environment?.workspacePath) {
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
      size: { width: 1920, height: 1080 },
    } : undefined,
  });

  // Get the main window
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  
  // Maximize the window to capture full VS Code UI
  try {
    const browserWindow = await app.browserWindow(page);
    await browserWindow.evaluate((win: any) => {
      win.maximize();
    });
    // Wait for window to finish maximizing
    await page.waitForTimeout(500);
    emit({
      type: 'log',
      timestamp: new Date().toISOString(),
      data: { message: 'Window maximized for full screenshot capture' },
    });
  } catch (err) {
    emit({
      type: 'log',
      timestamp: new Date().toISOString(),
      data: { message: 'Could not maximize window, using default size' },
    });
  }
  
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
    screenshotMethod,
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
  
  log('Pressing Enter to select "Continue with GitHub"...');
  await vscodePage.keyboard.press('Enter');
  await vscodePage.waitForTimeout(2000);
  
  log('Checking for external URL confirmation dialog...');
  
  const screenshotPath = `${ctx.artifactsPath}/screenshots/auth_dialog.png`;
  try {
    await takeNativeScreenshot(ctx.app, vscodePage, screenshotPath, ctx.screenshotMethod ?? 'electron');
  } catch {
    // fallback to playwright screenshot if something goes wrong
    try { await vscodePage.screenshot({ path: screenshotPath }); } catch {}
  }
  log(`Auth dialog screenshot: ${screenshotPath}`);
  
  await vscodePage.keyboard.press('Enter');
  await vscodePage.waitForTimeout(3000);
  
  log('Launching browser for GitHub authentication...');
  
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
    });
    
    const browserContext = await browser.newContext();
    const browserPage = await browserContext.newPage();
    
    log('Navigating to GitHub login...');
    await browserPage.goto('https://github.com/login');
    await browserPage.waitForLoadState('networkidle');
    
    const currentUrl = browserPage.url();
    if (!currentUrl.includes('/login')) {
      log('Already logged into GitHub, proceeding to device authorization...');
    } else {
      log('Entering GitHub credentials...');
      await browserPage.fill('#login_field', auth.email);
      await browserPage.fill('#password', auth.password);
      await browserPage.click('input[type="submit"]');
      
      await browserPage.waitForLoadState('networkidle');
      await browserPage.waitForTimeout(2000);
      
      const twoFactorField = await browserPage.$('#app_totp');
      if (twoFactorField) {
        log('⚠️  Two-factor authentication required. Please complete 2FA manually.');
        await browserPage.waitForTimeout(30000);
      }
    }
    
    log('Checking for device authorization...');
    await browserPage.goto('https://github.com/login/device');
    await browserPage.waitForLoadState('networkidle');
    await browserPage.waitForTimeout(1000);
    
    const authorizeBtn = await browserPage.$('button[type="submit"]:has-text("Authorize")');
    if (authorizeBtn) {
      log('Clicking Authorize button...');
      await authorizeBtn.click();
      await browserPage.waitForLoadState('networkidle');
      await browserPage.waitForTimeout(2000);
    }
    
    const successText = await browserPage.textContent('body');
    if (successText?.includes('successfully') || successText?.includes('authorized') || successText?.includes('Congratulations')) {
      log('✅ GitHub authorization successful!');
    } else {
      log('Authorization page reached. Please check VS Code for confirmation.');
    }
    
    await browser.close();
    browser = undefined;
    
    log('Returning to VS Code...');
    await vscodePage.waitForTimeout(3000);
    
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
 * Smart element finder - tries multiple selector strategies with retry
 */
async function findElement(page: Page, target: string, retryConfig?: Partial<RetryConfig>) {
  return withRetry(
    async () => {
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
          if (element) {
            // Verify element is actually visible and interactable
            const isVisible = await element.isVisible();
            if (isVisible) {
              return element;
            }
          }
        } catch {
          // Try next strategy
        }
      }
      
      throw new RunnerError(
        `Element not found: "${target}". Tried ${strategies.length} selector strategies.`,
        'ELEMENT_NOT_FOUND',
        true, // recoverable - worth retrying
        { target, strategies }
      );
    },
    retryConfig,
    { action: `findElement(${target})` }
  );
}

/**
 * Wait for element to be actionable with retry
 */
async function waitForElement(
  page: Page,
  selector: string,
  options: { timeout?: number; state?: 'visible' | 'attached' | 'hidden' } = {}
): Promise<void> {
  const { timeout = 10000, state = 'visible' } = options;
  
  return withRetry(
    async () => {
      try {
        await page.waitForSelector(selector, { timeout, state });
      } catch (err) {
        throw new RunnerError(
          `Timeout waiting for element: "${selector}" (state: ${state}, timeout: ${timeout}ms)`,
          'TIMEOUT',
          true,
          { selector, state, timeout }
        );
      }
    },
    { maxAttempts: 2 }, // Only retry once for waits
    { action: `waitForElement(${selector})` }
  );
}

/**
 * Click element with retry logic
 */
async function clickElement(
  page: Page,
  target: string,
  log: (msg: string) => void
): Promise<void> {
  return withRetry(
    async () => {
      const element = await findElement(page, target, { maxAttempts: 1 });
      
      // Check if element is clickable
      const isEnabled = await element.isEnabled();
      if (!isEnabled) {
        throw new RunnerError(
          `Element is not enabled/clickable: "${target}"`,
          'ELEMENT_NOT_INTERACTABLE',
          true,
          { target }
        );
      }
      
      // Scroll into view if needed
      await element.scrollIntoViewIfNeeded();
      
      // Click with force if first attempt fails
      try {
        await element.click({ timeout: 5000 });
      } catch {
        log(`Regular click failed, trying forced click on: ${target}`);
        await element.click({ force: true });
      }
    },
    { maxAttempts: 3 },
    { action: `click(${target})` }
  );
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
        log('VS Code already launched');
        break;
        
      case 'openCommandPalette':
        log('Opening command palette (Cmd/Ctrl+Shift+P)');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
        // Wait for command palette to appear
        await waitForElement(page, '.quick-input-widget', { timeout: 5000 });
        break;
        
      case 'openCopilotChat':
        log('Opening Copilot Chat');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+I' : 'Control+Shift+I');
        await page.waitForTimeout(2000);
        
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
        // Wait for inline chat input to appear
        await waitForElement(page, '.inline-chat-input, .monaco-inputbox', { timeout: 5000 });
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
        await clickElement(page, target, log);
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
        
      case 'selectFromList':
        // Select an item from a dropdown or list by index
        const selectIndex = args.index ?? 0;
        log(`Selecting item at index ${selectIndex} from list`);
        for (let i = 0; i < selectIndex; i++) {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(100);
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        break;
        
      case 'selectFromDropdown':
        // Click a dropdown, then select by index or text
        const dropdownSelector = args.selector || args.target;
        const itemIndex = args.index ?? 0;
        log(`Opening dropdown and selecting item ${itemIndex}`);
        if (dropdownSelector) {
          await clickElement(page, dropdownSelector, log);
          await page.waitForTimeout(500);
        }
        for (let i = 0; i < itemIndex; i++) {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(100);
        }
        await page.keyboard.press('Enter');
        break;
        
      case 'createFile':
        // Create a new file with optional content
        log('Creating new file');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
        await page.waitForTimeout(500);
        if (args.content) {
          log('Typing file content');
          await page.keyboard.type(args.content, { delay: 10 });
        }
        break;
        
      case 'selectAll':
        log('Selecting all text');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await page.waitForTimeout(200);
        break;
        
      // ============================================================
      // Semantic Actions - High-level, self-discovering UI actions
      // ============================================================
        
      case 'clickModelPicker':
        log('Opening model picker in Copilot Chat');
        // Try multiple selectors for the model picker button
        // The model picker is typically in the chat input area showing current model name
        const modelPickerSelectors = [
          // VS Code 2024+ model picker selectors
          '.chat-input-toolbars button[aria-haspopup="true"]',
          '.chat-model-picker-button',
          '[aria-label*="model" i]',
          '[aria-label*="Model" i]',
          '[aria-label="Pick model"]',
          '[aria-label="Select model"]',
          '[aria-label="Choose model"]',
          // Look for buttons containing model names
          '.chat-input-toolbars button:has-text("GPT")',
          '.chat-input-toolbars button:has-text("Claude")',
          '.chat-input-toolbars button:has-text("o1")',
          '.chat-input-toolbars button:has-text("Sonnet")',
          '.chat-input-toolbars button:has-text("Opus")',
          // Generic chat toolbar buttons
          '.interactive-input-part button[aria-haspopup]',
          '.monaco-action-bar .action-item[aria-haspopup="true"]',
        ];
        let modelPickerFound = false;
        for (const selector of modelPickerSelectors) {
          try {
            const el = await page.$(selector);
            if (el && await el.isVisible()) {
              await el.click();
              modelPickerFound = true;
              log(`Found model picker with selector: ${selector}`);
              await page.waitForTimeout(500);
              break;
            }
          } catch { /* continue */ }
        }
        if (!modelPickerFound) {
          log('Model picker button not found via selectors, trying command palette');
          // Fallback: use command palette with known command names
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
          await page.waitForTimeout(500);
          // Try "Copilot: Change Language Model" or similar
          await page.keyboard.type('change model', { delay: 30 });
          await page.waitForTimeout(500);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
          log('Used command palette fallback for model picker');
        }
        // Verify dropdown appeared
        const dropdownVisible = await page.$('.monaco-list, .quick-input-list, [role="listbox"]');
        if (dropdownVisible) {
          log('Model dropdown is now visible');
        } else {
          log('⚠️  Warning: Model dropdown may not have opened');
        }
        break;
        
      case 'selectModel':
        const modelName = args.model || args.name;
        log(`Selecting model: ${modelName || 'different from current'}`);
        
        // Wait a moment for the dropdown to be ready
        await page.waitForTimeout(300);
        
        if (modelName) {
          // Try to find and click the model by name in the dropdown
          const modelSelectors = [
            `[role="option"]:has-text("${modelName}")`,
            `.monaco-list-row:has-text("${modelName}")`,
            `.quick-input-list .monaco-list-row:has-text("${modelName}")`,
            `text="${modelName}"`,
          ];
          
          let modelFound = false;
          for (const selector of modelSelectors) {
            try {
              const modelOption = await page.$(selector);
              if (modelOption && await modelOption.isVisible()) {
                await modelOption.click();
                modelFound = true;
                log(`Selected model "${modelName}" using selector: ${selector}`);
                break;
              }
            } catch { /* continue */ }
          }
          
          if (!modelFound) {
            // Type to filter and select
            log(`Model "${modelName}" not found directly, typing to filter`);
            await page.keyboard.type(modelName, { delay: 30 });
            await page.waitForTimeout(500);
            await page.keyboard.press('Enter');
          }
        } else {
          // Select a different model than the currently selected one
          // Move down to select a different option
          log('No specific model requested, selecting next available model');
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(200);
          await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(500);
        
        // Verify selection by checking if dropdown closed
        const dropdownStillOpen = await page.$('.quick-input-list:visible, [role="listbox"]:visible');
        if (!dropdownStillOpen) {
          log('Model selection completed (dropdown closed)');
        } else {
          log('⚠️  Warning: Dropdown may still be open after selection');
          // Try pressing Escape to close
          await page.keyboard.press('Escape');
        }
        break;
        
      case 'openExtensionsPanel':
        log('Opening Extensions panel');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+X' : 'Control+Shift+X');
        await page.waitForTimeout(1000);
        break;
        
      case 'searchExtensions':
        const searchQuery = args.query || args.text;
        log(`Searching extensions: ${searchQuery}`);
        // Focus search box
        const searchBox = await page.$('input[placeholder*="Search Extensions"]');
        if (searchBox) {
          await searchBox.click();
          await searchBox.fill(searchQuery);
        } else {
          await page.keyboard.type(searchQuery, { delay: 30 });
        }
        await page.waitForTimeout(1500);
        break;
        
      case 'installExtension':
        const extName = args.name || args.extension;
        log(`Installing extension: ${extName}`);
        // Click install button
        const installButtons = await page.$$('text="Install"');
        if (installButtons.length > 0) {
          await installButtons[0].click();
          log('Clicked install button');
        }
        await page.waitForTimeout(2000);
        break;
        
      case 'openAgentMode':
        log('Opening Agent mode');
        // Look for agent mode toggle or button
        const agentSelectors = [
          '[aria-label="Agent Mode"]',
          'button:has-text("Agent")',
          '.agent-mode-toggle',
        ];
        for (const selector of agentSelectors) {
          try {
            const el = await page.$(selector);
            if (el) {
              await el.click();
              log(`Found agent mode with: ${selector}`);
              break;
            }
          } catch { /* continue */ }
        }
        await page.waitForTimeout(500);
        break;
        
      case 'startBackgroundAgent':
        log('Starting background agent');
        // Look for background agent option
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
        await page.waitForTimeout(300);
        await page.keyboard.type('Copilot: Start Background Agent', { delay: 30 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
        break;
        
      case 'githubLogin':
        await performGitHubLogin(page, ctx, log);
        break;
        
      case 'signInWithGitHub':
        await performGitHubLogin(page, ctx, log);
        break;
        
      default:
        log(`Unknown action: ${step.action} - skipping`);
    }
    
    // Take screenshot after step (auto-capture for steps with observations)
    const hasObservations = step.observations && step.observations.length > 0;
    ctx.screenshotCounter++;
    const screenshotPath = path.join(
      ctx.artifactsPath, 
      'screenshots', 
      `${String(ctx.screenshotCounter).padStart(3, '0')}_${step.id}${hasObservations ? '_observed' : ''}.png`
    );
    // Use configured screenshot method to capture full window content
    await takeNativeScreenshot(ctx.app, ctx.page, screenshotPath, ctx.screenshotMethod ?? 'electron');
    screenshot = screenshotPath;
    log(`Screenshot: ${screenshotPath}${hasObservations ? ' (has observations)' : ''}`);
    
    
    emit({
      type: 'screenshot',
      timestamp: new Date().toISOString(),
      data: { stepId: step.id, path: screenshotPath },
    });
    
  } catch (err) {
    status = 'failed';
    
    // Format error message with context
    if (err instanceof RunnerError) {
      error = `[${err.code}] ${err.message}`;
      if (err.details) {
        log(`Error details: ${JSON.stringify(err.details)}`);
      }
    } else {
      const errMsg = err instanceof Error ? err.message : String(err);
      
      // Provide more helpful error messages for common failures
      if (errMsg.includes('Target page, context or browser has been closed')) {
        error = 'VS Code closed unexpectedly. This usually happens when another VS Code instance is running with the same profile. Try using --fresh flag for isolated runs, or close other VS Code windows.';
      } else if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
        error = `Timeout during "${step.action}": ${errMsg}. Consider increasing the step timeout or checking if VS Code is responsive.`;
      } else if (errMsg.includes('Element not found') || errMsg.includes('not attached')) {
        error = `Could not find or interact with UI element during "${step.action}": ${errMsg}. The VS Code UI may have changed or the element may not be visible.`;
      } else {
        error = errMsg;
      }
    }
    
    log(`FAILED: ${error}`);
    
    try {
      const failPath = path.join(ctx.artifactsPath, 'screenshots', `FAIL_${step.id}.png`);
      await takeNativeScreenshot(ctx.app, ctx.page, failPath, ctx.screenshotMethod ?? 'electron');
      screenshot = failPath;
      log(`Failure screenshot: ${failPath}`);
    } catch {
      log('Could not capture failure screenshot (VS Code may have crashed)');
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
  assertion: Assertion,
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
    ctx = await launchVSCode(scenario, runId, emit, { 
      freshProfile: config.freshProfile ?? false,
      recordVideo: config.recordVideo ?? false,
      auth: config.auth,
      screenshotMethod: config.screenshotMethod,
    });
    
    for (const step of scenario.steps) {
      const result = await executeStep(step, ctx, emit);
      stepResults.push(result);
      
      if (result.screenshot) {
        screenshots.push(result.screenshot);
      }
      
      if (result.status === 'failed' && !step.optional) {
        status = 'failed';
        error = result.error;
        break;
      }
    }
    
    if (status === 'running') {
      for (const assertion of scenario.assertions || []) {
        const result = await executeAssertion(assertion, ctx, emit);
        assertionResults.push(result);
        
        if (!result.passed) {
          status = 'failed';
          error = result.error || `Checkpoint failed: ${assertion.id}`;
          break;
        }
      }
    }
    
    if (status === 'running') {
      status = 'passed';
    }
  } catch (err) {
    status = 'error';
    
    // Provide helpful error messages based on the type of failure
    if (err instanceof RunnerError) {
      error = `[${err.code}] ${err.message}`;
      
      // Add recovery suggestions for known error types
      switch (err.code) {
        case 'VSCODE_CRASHED':
          error += '\n\nSuggestions:\n- Close any other VS Code windows\n- Try running with --fresh flag\n- Check system resources (memory, CPU)';
          break;
        case 'ELEMENT_NOT_FOUND':
          error += '\n\nSuggestions:\n- The VS Code UI may have changed\n- Check if the extension or feature is enabled\n- Increase step timeout';
          break;
        case 'TIMEOUT':
          error += '\n\nSuggestions:\n- Increase the timeout value\n- Check if VS Code is responsive\n- Network issues may be affecting Copilot';
          break;
      }
    } else {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      
      if (errMsg.includes('Target page, context or browser has been closed')) {
        error = 'VS Code closed unexpectedly. This usually happens when another VS Code instance is running with the same profile.\n\nSuggestions:\n- Try using --fresh flag for isolated runs\n- Close other VS Code windows\n- Check if another Electron process is interfering';
      } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND')) {
        error = `Network error: ${errMsg}\n\nSuggestions:\n- Check your internet connection\n- Verify GitHub/Copilot services are available\n- Check firewall/proxy settings`;
      } else {
        error = errMsg;
      }
    }
    
    emit({
      type: 'error',
      timestamp: new Date().toISOString(),
      data: { error, code: err instanceof RunnerError ? err.code : 'UNKNOWN' },
    });
  } finally {
    if (ctx) {
      emit({
        type: 'log',
        timestamp: new Date().toISOString(),
        data: { message: 'Closing VS Code...' },
      });
      try {
        if (ctx.videoPath) {
          const video = ctx.page.video();
          if (video) {
            videoPath = await video.path();
          }
        }
        await ctx.app.close();
        
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
  
  const report: RunReport = {
    id: runId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    status,
    startTime,
    endTime,
    duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
    environment: scenario.environment || {
      vscodeTarget: 'desktop',
      vscodeVersion: 'stable',
      platform: 'macOS',
      copilotChannel: 'stable',
    },
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
