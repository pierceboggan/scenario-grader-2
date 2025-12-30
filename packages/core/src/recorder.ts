import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { Scenario, Step, Priority, ScreenshotConfig } from './types';
import { scenarioToYAML } from './parser';
import { nanoid } from 'nanoid';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';

/**
 * VS Code Scenario Recorder
 * 
 * Launches VS Code with Playwright and records user interactions
 * to generate scenario YAML files automatically.
 */

// ============================================================================
// Error Types
// ============================================================================

export class RecorderError extends Error {
  constructor(
    message: string,
    public readonly code: RecorderErrorCode,
    public readonly recoverable: boolean = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RecorderError';
  }
}

export type RecorderErrorCode =
  | 'VSCODE_NOT_FOUND'
  | 'VSCODE_LAUNCH_FAILED'
  | 'VSCODE_CRASHED'
  | 'VSCODE_UNRESPONSIVE'
  | 'WORKSPACE_NOT_FOUND'
  | 'RECORDING_INTERRUPTED'
  | 'SAVE_FAILED'
  | 'EVENT_INJECTION_FAILED';

/** Health check interval in milliseconds */
const HEALTH_CHECK_INTERVAL = 5000;

/** Timeout for health check responses */
const HEALTH_CHECK_TIMEOUT = 3000;

/** Maximum consecutive health check failures before declaring crash */
const MAX_HEALTH_FAILURES = 3;

// ============================================================================
// Types
// ============================================================================

export interface RecordedAction {
  timestamp: number;
  type: 'keyboard' | 'click' | 'type' | 'wait';
  key?: string;
  keys?: string[];
  target?: string;
  text?: string;
  duration?: number;
  selector?: string;
  description?: string;
}

export interface RecorderConfig {
  /** Output path for the generated scenario YAML */
  outputPath?: string;
  /** Scenario name (will prompt if not provided) */
  scenarioName?: string;
  /** Scenario description */
  scenarioDescription?: string;
  /** Scenario priority */
  priority?: Priority;
  /** Tags for the scenario */
  tags?: string[];
  /** Owner of the scenario */
  owner?: string;
  /** Workspace path to open in VS Code */
  workspacePath?: string;
  /** Auto-detect action descriptions using context */
  autoDescribe?: boolean;
  /** Capture screenshots during recording */
  captureScreenshots?: boolean;
}

export interface RecorderContext {
  app: ElectronApplication;
  page: Page;
  actions: RecordedAction[];
  startTime: number;
  config: RecorderConfig;
  recordingDir: string;
  screenshotCounter: number;
  isRecording: boolean;
  lastActionTime: number;
  /** Health check interval ID */
  healthCheckInterval?: ReturnType<typeof setInterval>;
  /** Count of consecutive health check failures */
  healthFailureCount: number;
  /** Whether VS Code crashed during recording */
  crashed: boolean;
  /** Partial scenario saved on crash */
  partialSavePath?: string;
}

export type RecorderEventType =
  | 'recorder:start'
  | 'recorder:stop'
  | 'recorder:action'
  | 'recorder:screenshot'
  | 'recorder:saved'
  | 'recorder:log'
  | 'recorder:error'
  | 'recorder:health_check'
  | 'recorder:crash_detected'
  | 'recorder:partial_save';

export interface RecorderEvent {
  type: RecorderEventType;
  timestamp: string;
  data: any;
}

export type RecorderEventHandler = (event: RecorderEvent) => void;

// ============================================================================
// Constants
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.scenario-runner');
const RECORDINGS_DIR = path.join(CONFIG_DIR, 'recordings');

// Well-known keyboard shortcuts mapped to actions
const KEYBOARD_ACTION_MAP: Record<string, { action: string; description: string }> = {
  'Meta+Shift+P': { action: 'openCommandPalette', description: 'Open Command Palette' },
  'Control+Shift+P': { action: 'openCommandPalette', description: 'Open Command Palette' },
  'Meta+Shift+I': { action: 'openCopilotChat', description: 'Open Copilot Chat' },
  'Control+Shift+I': { action: 'openCopilotChat', description: 'Open Copilot Chat' },
  'Meta+I': { action: 'openInlineChat', description: 'Open Inline Chat' },
  'Control+I': { action: 'openInlineChat', description: 'Open Inline Chat' },
  'Meta+P': { action: 'quickOpen', description: 'Quick Open File' },
  'Control+P': { action: 'quickOpen', description: 'Quick Open File' },
  'Meta+,': { action: 'openSettings', description: 'Open Settings' },
  'Control+,': { action: 'openSettings', description: 'Open Settings' },
  'Meta+`': { action: 'toggleTerminal', description: 'Toggle Terminal' },
  'Control+`': { action: 'toggleTerminal', description: 'Toggle Terminal' },
  'Meta+B': { action: 'toggleSidebar', description: 'Toggle Sidebar' },
  'Control+B': { action: 'toggleSidebar', description: 'Toggle Sidebar' },
  'Meta+Shift+E': { action: 'openExplorer', description: 'Open Explorer' },
  'Control+Shift+E': { action: 'openExplorer', description: 'Open Explorer' },
  'Meta+Shift+F': { action: 'openSearch', description: 'Open Search' },
  'Control+Shift+F': { action: 'openSearch', description: 'Open Search' },
  'Meta+Shift+G': { action: 'openSourceControl', description: 'Open Source Control' },
  'Control+Shift+G': { action: 'openSourceControl', description: 'Open Source Control' },
  'Meta+Shift+X': { action: 'openExtensions', description: 'Open Extensions' },
  'Control+Shift+X': { action: 'openExtensions', description: 'Open Extensions' },
  'F5': { action: 'startDebugging', description: 'Start Debugging' },
  'Shift+F5': { action: 'stopDebugging', description: 'Stop Debugging' },
  'F9': { action: 'toggleBreakpoint', description: 'Toggle Breakpoint' },
  'Tab': { action: 'acceptSuggestion', description: 'Accept Suggestion' },
  'Escape': { action: 'dismissSuggestion', description: 'Dismiss/Cancel' },
  'Enter': { action: 'confirmAction', description: 'Confirm Action' },
};

// ============================================================================
// VS Code Path Finder
// ============================================================================

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
    throw new RecorderError(
      'VS Code not found. Install VS Code or VS Code Insiders at /Applications/',
      'VSCODE_NOT_FOUND',
      false,
      { searchedPaths: paths, platform }
    );
  } else if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const paths = [
      path.join(localAppData, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
      path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    throw new RecorderError(
      'VS Code not found. Install VS Code from https://code.visualstudio.com/',
      'VSCODE_NOT_FOUND',
      false,
      { searchedPaths: paths, platform }
    );
  } else {
    const paths = ['/usr/bin/code-insiders', '/usr/bin/code', '/usr/share/code/code'];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    throw new RecorderError(
      'VS Code not found. Install VS Code using your package manager or from https://code.visualstudio.com/',
      'VSCODE_NOT_FOUND',
      false,
      { searchedPaths: paths, platform }
    );
  }
}

// ============================================================================
// Health Check & Crash Recovery
// ============================================================================

/**
 * Check if VS Code is still responsive
 */
async function checkVSCodeHealth(ctx: RecorderContext): Promise<boolean> {
  try {
    // Try to evaluate a simple expression in the page context
    const result = await Promise.race([
      ctx.page.evaluate(() => document.readyState),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT)
      ),
    ]);
    return result === 'complete';
  } catch {
    return false;
  }
}

/**
 * Start periodic health checks for VS Code
 */
function startHealthCheck(ctx: RecorderContext, emit: RecorderEventHandler): void {
  ctx.healthCheckInterval = setInterval(async () => {
    if (!ctx.isRecording) {
      stopHealthCheck(ctx);
      return;
    }
    
    const isHealthy = await checkVSCodeHealth(ctx);
    
    emit({
      type: 'recorder:health_check',
      timestamp: new Date().toISOString(),
      data: { healthy: isHealthy, failureCount: ctx.healthFailureCount },
    });
    
    if (!isHealthy) {
      ctx.healthFailureCount++;
      
      if (ctx.healthFailureCount >= MAX_HEALTH_FAILURES) {
        ctx.crashed = true;
        ctx.isRecording = false;
        stopHealthCheck(ctx);
        
        emit({
          type: 'recorder:crash_detected',
          timestamp: new Date().toISOString(),
          data: { 
            message: 'VS Code appears to have crashed or become unresponsive',
            actionsRecorded: ctx.actions.length,
          },
        });
        
        // Attempt to save partial recording
        await savePartialRecording(ctx, emit);
      }
    } else {
      ctx.healthFailureCount = 0;
    }
  }, HEALTH_CHECK_INTERVAL);
}

/**
 * Stop health check interval
 */
function stopHealthCheck(ctx: RecorderContext): void {
  if (ctx.healthCheckInterval) {
    clearInterval(ctx.healthCheckInterval);
    ctx.healthCheckInterval = undefined;
  }
}

/**
 * Save partial recording when crash is detected
 */
async function savePartialRecording(ctx: RecorderContext, emit: RecorderEventHandler): Promise<void> {
  if (ctx.actions.length === 0) {
    emit({
      type: 'recorder:log',
      timestamp: new Date().toISOString(),
      data: { message: 'No actions recorded - nothing to save' },
    });
    return;
  }
  
  try {
    // Convert recorded actions to steps
    const steps = actionsToSteps(ctx.actions);
    
    const scenarioName = ctx.config.scenarioName || `partial-recording-${nanoid(6)}`;
    const scenarioId = scenarioName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const scenario: Scenario = {
      id: scenarioId,
      name: `[PARTIAL] ${scenarioName}`,
      description: `Partial recording - VS Code crashed after ${ctx.actions.length} actions. ${ctx.config.scenarioDescription || ''}`,
      priority: ctx.config.priority || 'P1',
      owner: ctx.config.owner,
      tags: [...(ctx.config.tags || []), 'partial', 'recovered'],
      environment: {
        vscodeTarget: 'desktop',
        vscodeVersion: 'stable',
        platform: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'windows' : 'linux',
        copilotChannel: 'stable',
        workspacePath: ctx.config.workspacePath,
      },
      preconditions: [
        'VS Code installed with GitHub Copilot extension',
        'NOTE: This is a partial recording that was recovered after a crash',
      ],
      steps,
      assertions: [],
      outputs: {
        captureVideo: false,
        storeChatTranscript: false,
        storeLogs: true,
      },
    };
    
    const yaml = scenarioToYAML(scenario);
    const partialPath = path.join(ctx.recordingDir, `${scenarioId}-PARTIAL.yaml`);
    
    fs.writeFileSync(partialPath, yaml, 'utf-8');
    ctx.partialSavePath = partialPath;
    
    emit({
      type: 'recorder:partial_save',
      timestamp: new Date().toISOString(),
      data: { 
        path: partialPath,
        actionsRecorded: ctx.actions.length,
        stepsGenerated: steps.length,
      },
    });
    
    emit({
      type: 'recorder:log',
      timestamp: new Date().toISOString(),
      data: { message: `⚠️  Partial recording saved to: ${partialPath}` },
    });
    
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    emit({
      type: 'recorder:error',
      timestamp: new Date().toISOString(),
      data: { 
        message: `Failed to save partial recording: ${errMsg}`,
        code: 'SAVE_FAILED',
      },
    });
  }
}

// ============================================================================
// Action Recording & Detection
// ============================================================================

/**
 * Detect the semantic action from a keyboard event
 */
function detectKeyboardAction(key: string): { action: string; description: string } | null {
  // Normalize key for comparison
  const normalizedKey = key
    .replace('Control', 'Control')
    .replace('Command', 'Meta')
    .replace('Cmd', 'Meta');
  
  return KEYBOARD_ACTION_MAP[normalizedKey] || null;
}

/**
 * Convert recorded actions to scenario steps
 */
function actionsToSteps(actions: RecordedAction[]): Step[] {
  const steps: Step[] = [];
  let stepCounter = 1;
  let pendingText = '';
  let lastTextAction: RecordedAction | null = null;
  
  // Add launch step
  steps.push({
    id: 'launch',
    description: 'Launch VS Code',
    action: 'launchVSCodeWithProfile',
    args: {},
    optional: false,
  });
  
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    
    // Accumulate typed text
    if (action.type === 'type' && action.text) {
      pendingText += action.text;
      lastTextAction = action;
      continue;
    }
    
    // Flush pending text before other actions
    if (pendingText && action.type !== 'type') {
      const textId = `step_${stepCounter++}`;
      
      // Check if next action is Enter - this might be a chat message
      const nextIsEnter = action.type === 'keyboard' && action.key === 'Enter';
      
      if (nextIsEnter) {
        // This is likely a chat message or command palette input
        steps.push({
          id: textId,
          description: lastTextAction?.description || `Send message: "${pendingText.substring(0, 50)}${pendingText.length > 50 ? '...' : ''}"`,
          action: 'sendChatMessage',
          args: {
            message: pendingText,
            waitForResponse: true,
          },
          timeout: 30000,
          optional: false,
        });
        // Skip the Enter key since it's part of sendChatMessage
        pendingText = '';
        lastTextAction = null;
        continue;
      } else {
        steps.push({
          id: textId,
          description: lastTextAction?.description || `Type: "${pendingText.substring(0, 50)}${pendingText.length > 50 ? '...' : ''}"`,
          action: 'typeText',
          args: { text: pendingText },
          optional: false,
        });
      }
      
      pendingText = '';
      lastTextAction = null;
    }
    
    // Process the action
    switch (action.type) {
      case 'keyboard':
        if (action.key) {
          const semanticAction = detectKeyboardAction(action.key);
          
          if (semanticAction) {
            steps.push({
              id: `step_${stepCounter++}`,
              description: semanticAction.description,
              action: semanticAction.action,
              hints: [{ type: 'keyboard', value: action.key }],
              timeout: 5000,
              optional: false,
            });
          } else if (action.key !== 'Enter') {
            // Generic key press (skip standalone Enter as it's usually part of sendChatMessage)
            steps.push({
              id: `step_${stepCounter++}`,
              description: action.description || `Press ${action.key}`,
              action: 'pressKey',
              args: { key: action.key },
              optional: false,
            });
          }
        }
        break;
        
      case 'click':
        steps.push({
          id: `step_${stepCounter++}`,
          description: action.description || `Click on ${action.target || 'element'}`,
          action: 'click',
          args: { target: action.target || action.selector },
          optional: false,
        });
        break;
        
      case 'wait':
        if (action.duration && action.duration >= 1000) {
          steps.push({
            id: `step_${stepCounter++}`,
            description: action.description || `Wait ${action.duration}ms`,
            action: 'wait',
            args: { duration: action.duration },
            optional: true,
          });
        }
        break;
    }
  }
  
  // Flush any remaining text
  if (pendingText) {
    steps.push({
      id: `step_${stepCounter++}`,
      description: lastTextAction?.description || `Type: "${pendingText.substring(0, 50)}${pendingText.length > 50 ? '...' : ''}"`,
      action: 'typeText',
      args: { text: pendingText },
      optional: false,
    });
  }
  
  // Add a wait at the end to capture final state
  steps.push({
    id: 'wait_final',
    description: 'Wait for final state',
    action: 'wait',
    args: { duration: 3000 },
    optional: true,
  });
  
  return steps;
}

// ============================================================================
// Keyboard Hook Injection
// ============================================================================

/**
 * Inject keyboard and mouse event listeners into the VS Code page
 */
async function injectEventListeners(ctx: RecorderContext, emit: RecorderEventHandler): Promise<void> {
  const { page } = ctx;
  
  // Expose functions to the page context
  await page.exposeFunction('__recordKeyEvent', async (eventData: any) => {
    if (!ctx.isRecording) return;
    
    const now = Date.now();
    
    // Add implicit wait if there was a significant pause
    const timeSinceLastAction = now - ctx.lastActionTime;
    if (timeSinceLastAction > 2000 && ctx.actions.length > 0) {
      ctx.actions.push({
        timestamp: ctx.lastActionTime + 100,
        type: 'wait',
        duration: timeSinceLastAction - 100,
        description: `Wait ${Math.round(timeSinceLastAction / 1000)}s`,
      });
    }
    
    const action: RecordedAction = {
      timestamp: now,
      type: eventData.type === 'keypress' ? 'type' : 'keyboard',
      key: eventData.key,
      text: eventData.type === 'keypress' ? eventData.key : undefined,
    };
    
    ctx.actions.push(action);
    ctx.lastActionTime = now;
    
    emit({
      type: 'recorder:action',
      timestamp: new Date().toISOString(),
      data: action,
    });
  });
  
  await page.exposeFunction('__recordClickEvent', async (eventData: any) => {
    if (!ctx.isRecording) return;
    
    const now = Date.now();
    
    const action: RecordedAction = {
      timestamp: now,
      type: 'click',
      target: eventData.target,
      selector: eventData.selector,
    };
    
    ctx.actions.push(action);
    ctx.lastActionTime = now;
    
    emit({
      type: 'recorder:action',
      timestamp: new Date().toISOString(),
      data: action,
    });
  });
  
  // Inject the event listeners
  await page.evaluate(() => {
    // Track modifier keys
    let modifiers: string[] = [];
    
    document.addEventListener('keydown', (e) => {
      // Update modifiers
      if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') {
        if (!modifiers.includes(e.key)) {
          modifiers.push(e.key);
        }
        return;
      }
      
      // Build key combination string
      const keyParts = [...modifiers];
      if (e.key.length === 1) {
        keyParts.push(e.key.toUpperCase());
      } else {
        keyParts.push(e.key);
      }
      
      const keyCombo = keyParts.join('+');
      
      // Determine if this is a shortcut or typing
      const isShortcut = modifiers.length > 0 || e.key.length > 1;
      
      (window as any).__recordKeyEvent({
        type: isShortcut ? 'keydown' : 'keypress',
        key: isShortcut ? keyCombo : e.key,
        modifiers: [...modifiers],
      });
    }, true);
    
    document.addEventListener('keyup', (e) => {
      // Remove released modifier
      modifiers = modifiers.filter(m => m !== e.key);
    }, true);
    
    // Track clicks on interactive elements
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // Try to get a meaningful identifier
      let identifier = '';
      let selector = '';
      
      // Check aria-label
      const ariaLabel = target.getAttribute('aria-label');
      if (ariaLabel) {
        identifier = ariaLabel;
        selector = `[aria-label="${ariaLabel}"]`;
      }
      // Check title
      else if (target.title) {
        identifier = target.title;
        selector = `[title="${target.title}"]`;
      }
      // Check class for known VS Code elements
      else if (target.className.includes('codicon')) {
        const iconClass = target.className.split(' ').find((c: string) => c.startsWith('codicon-'));
        if (iconClass) {
          identifier = iconClass.replace('codicon-', '');
          selector = `.${iconClass}`;
        }
      }
      // Check text content
      else if (target.textContent && target.textContent.length < 50) {
        identifier = target.textContent.trim();
        selector = `text="${identifier}"`;
      }
      
      if (identifier) {
        (window as any).__recordClickEvent({
          target: identifier,
          selector: selector,
        });
      }
    }, true);
  });
}

// ============================================================================
// Main Recorder Functions
// ============================================================================

/**
 * Start recording a new scenario
 */
export async function startRecording(
  config: RecorderConfig = {},
  onEvent?: RecorderEventHandler
): Promise<RecorderContext> {
  const emit: RecorderEventHandler = onEvent || (() => {});
  const recordingId = nanoid(8);
  const recordingDir = path.join(RECORDINGS_DIR, recordingId);
  
  // Create recording directory
  fs.mkdirSync(recordingDir, { recursive: true });
  fs.mkdirSync(path.join(recordingDir, 'screenshots'), { recursive: true });
  
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: `Recording directory: ${recordingDir}` },
  });
  
  // Get VS Code path
  const vscodePath = getVSCodePath();
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: `VS Code: ${vscodePath}` },
  });
  
  // Build launch args
  const args: string[] = [
    '--disable-telemetry',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
  ];
  
  // Add workspace if specified
  if (config.workspacePath) {
    const workspacePath = config.workspacePath.replace(/^~/, os.homedir());
    if (fs.existsSync(workspacePath)) {
      args.push(workspacePath);
      emit({
        type: 'recorder:log',
        timestamp: new Date().toISOString(),
        data: { message: `Workspace: ${workspacePath}` },
      });
    }
  }
  
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: 'Launching VS Code for recording...' },
  });
  
  // Launch VS Code
  const app = await electron.launch({
    executablePath: vscodePath,
    args,
    timeout: 60000,
  });
  
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  
  // Wait for VS Code to be ready
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: 'Waiting for VS Code to initialize...' },
  });
  
  await page.waitForSelector('.monaco-workbench', {
    state: 'visible',
    timeout: 60000,
  });
  
  await page.waitForTimeout(2000);
  
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: 'VS Code ready!' },
  });
  
  // Create context
  const ctx: RecorderContext = {
    app,
    page,
    actions: [],
    startTime: Date.now(),
    config,
    recordingDir,
    screenshotCounter: 0,
    isRecording: true,
    lastActionTime: Date.now(),
    healthFailureCount: 0,
    crashed: false,
  };
  
  // Inject event listeners
  await injectEventListeners(ctx, emit);
  
  // Start health monitoring
  startHealthCheck(ctx, emit);
  
  emit({
    type: 'recorder:start',
    timestamp: new Date().toISOString(),
    data: { recordingId, recordingDir },
  });
  
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: '🔴 Recording started! Perform your actions in VS Code.' },
  });
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: '   Press Ctrl+C in the terminal to stop recording.' },
  });
  
  return ctx;
}

/**
 * Take a screenshot during recording
 */
export async function takeRecordingScreenshot(
  ctx: RecorderContext,
  name?: string,
  emit?: RecorderEventHandler
): Promise<string> {
  ctx.screenshotCounter++;
  const filename = name || `screenshot_${ctx.screenshotCounter}`;
  const screenshotPath = path.join(
    ctx.recordingDir,
    'screenshots',
    `${String(ctx.screenshotCounter).padStart(3, '0')}_${filename}.png`
  );
  
  await ctx.page.screenshot({ path: screenshotPath, fullPage: true });
  
  if (emit) {
    emit({
      type: 'recorder:screenshot',
      timestamp: new Date().toISOString(),
      data: { path: screenshotPath },
    });
  }
  
  return screenshotPath;
}

/**
 * Stop recording and generate the scenario YAML
 */
export async function stopRecording(
  ctx: RecorderContext,
  onEvent?: RecorderEventHandler
): Promise<{ scenario: Scenario; yamlPath: string; yaml: string }> {
  const emit: RecorderEventHandler = onEvent || (() => {});
  
  ctx.isRecording = false;
  
  // Stop health monitoring
  stopHealthCheck(ctx);
  
  // If VS Code crashed and we have a partial save, return that
  if (ctx.crashed && ctx.partialSavePath) {
    emit({
      type: 'recorder:log',
      timestamp: new Date().toISOString(),
      data: { message: '⚠️  Recording was interrupted due to VS Code crash. Using partial save.' },
    });
    
    const partialYaml = fs.readFileSync(ctx.partialSavePath, 'utf-8');
    const { parseScenarioYAML } = await import('./parser');
    const partialScenario = parseScenarioYAML(partialYaml);
    
    return { scenario: partialScenario, yamlPath: ctx.partialSavePath, yaml: partialYaml };
  }
  
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: '⏹️  Stopping recording...' },
  });
  
  // Take final screenshot (only if VS Code is still running)
  if (!ctx.crashed) {
    try {
      await takeRecordingScreenshot(ctx, 'final', emit);
    } catch (err) {
      emit({
        type: 'recorder:log',
        timestamp: new Date().toISOString(),
        data: { message: '⚠️  Could not capture final screenshot' },
      });
    }
  }
  
  // Convert actions to steps
  const steps = actionsToSteps(ctx.actions);
  
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: `Recorded ${ctx.actions.length} actions → ${steps.length} steps` },
  });
  
  // Generate scenario ID from name or timestamp
  const scenarioName = ctx.config.scenarioName || `recorded-scenario-${nanoid(6)}`;
  const scenarioId = scenarioName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Build screenshot configs from captured screenshots
  const screenshotConfigs: ScreenshotConfig[] = [];
  if (ctx.config.captureScreenshots && ctx.screenshotCounter > 0) {
    screenshotConfigs.push({
      atStep: 'wait_final',
      name: 'final-state',
    });
  }
  
  // Create scenario object
  const scenario: Scenario = {
    id: scenarioId,
    name: scenarioName,
    description: ctx.config.scenarioDescription || 'Recorded scenario',
    priority: ctx.config.priority || 'P1',
    owner: ctx.config.owner,
    tags: ctx.config.tags || ['recorded'],
    environment: {
      vscodeTarget: 'desktop',
      vscodeVersion: 'stable',
      platform: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'windows' : 'linux',
      copilotChannel: 'stable',
      workspacePath: ctx.config.workspacePath,
    },
    preconditions: [
      'VS Code installed with GitHub Copilot extension',
      'User authenticated to GitHub Copilot',
    ],
    steps,
    assertions: [
      {
        id: 'llm_quality_check',
        type: 'llmGrade',
        expected: '>=80',
        required: false,
      },
    ],
    outputs: {
      captureVideo: true,
      screenshots: screenshotConfigs.length > 0 ? screenshotConfigs : undefined,
      storeChatTranscript: true,
      storeLogs: true,
    },
  };
  
  // Generate YAML
  const yaml = scenarioToYAML(scenario);
  
  // Determine output path
  const outputPath = ctx.config.outputPath || path.join(ctx.recordingDir, `${scenarioId}.yaml`);
  
  // Write YAML file
  fs.writeFileSync(outputPath, yaml, 'utf-8');
  
  emit({
    type: 'recorder:log',
    timestamp: new Date().toISOString(),
    data: { message: `📝 Scenario saved to: ${outputPath}` },
  });
  
  // Close VS Code
  try {
    await ctx.app.close();
  } catch {
    // May already be closed
  }
  
  emit({
    type: 'recorder:stop',
    timestamp: new Date().toISOString(),
    data: { scenarioId, yamlPath: outputPath },
  });
  
  emit({
    type: 'recorder:saved',
    timestamp: new Date().toISOString(),
    data: { scenario, yamlPath: outputPath },
  });
  
  return { scenario, yamlPath: outputPath, yaml };
}

/**
 * Interactive recording session with CLI prompts
 */
export async function interactiveRecord(
  config: RecorderConfig = {},
  onEvent?: RecorderEventHandler
): Promise<{ scenario: Scenario; yamlPath: string; yaml: string }> {
  const emit: RecorderEventHandler = onEvent || (() => {});
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };
  
  try {
    // Gather scenario metadata if not provided
    if (!config.scenarioName) {
      config.scenarioName = await question('📝 Scenario name: ');
    }
    
    if (!config.scenarioDescription) {
      config.scenarioDescription = await question('📄 Description: ');
    }
    
    if (!config.tags || config.tags.length === 0) {
      const tagsInput = await question('🏷️  Tags (comma-separated): ');
      config.tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    }
    
    if (!config.priority) {
      const priorityInput = await question('⭐ Priority (P0/P1/P2) [P1]: ');
      config.priority = (['P0', 'P1', 'P2'].includes(priorityInput) ? priorityInput : 'P1') as Priority;
    }
    
    console.log('\n');
    
    // Start recording
    const ctx = await startRecording(config, emit);
    
    // Wait for user to stop recording
    await new Promise<void>((resolve) => {
      console.log('\n📍 Recording in progress...');
      console.log('   Perform your scenario steps in VS Code.');
      console.log('   Press Enter here when done, or Ctrl+C to cancel.\n');
      
      rl.question('', () => {
        resolve();
      });
    });
    
    // Stop recording and generate scenario
    const result = await stopRecording(ctx, emit);
    
    return result;
  } finally {
    rl.close();
  }
}

/**
 * Simple recording without prompts (for programmatic use)
 */
export async function record(
  config: RecorderConfig,
  durationMs?: number,
  onEvent?: RecorderEventHandler
): Promise<{ scenario: Scenario; yamlPath: string; yaml: string }> {
  const ctx = await startRecording(config, onEvent);
  
  if (durationMs) {
    // Record for specified duration
    await new Promise(resolve => setTimeout(resolve, durationMs));
  } else {
    // Wait indefinitely until process is killed
    await new Promise(() => {});
  }
  
  return stopRecording(ctx, onEvent);
}

// ============================================================================
// Exports
// ============================================================================

export {
  actionsToSteps,
  detectKeyboardAction,
  KEYBOARD_ACTION_MAP,
  // Note: RecorderError and RecorderErrorCode are already exported from their class/type declarations
};
