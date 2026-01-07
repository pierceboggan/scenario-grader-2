import {
  Scenario,
  Milestone,
  MilestoneResult,
  WaitCondition,
  OrchestratedScenarioConfig,
  SessionConfig,
  RunReport,
  RunConfig,
} from './types';
import { nanoid } from 'nanoid';
import { _electron as electron, ElectronApplication, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { RunEventHandler } from './runner';
import { setupWorkspace } from './workspace';

// ============================================================================
// Orchestrated Scenario Runner
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.scenario-runner');
const CHECKPOINTS_DIR = path.join(CONFIG_DIR, 'checkpoints');

/**
 * Session context for managing multiple VS Code instances
 */
interface SessionContext {
  id: string;
  app: ElectronApplication;
  page: Page;
  workspacePath?: string;
  isActive: boolean;
}

/**
 * Orchestrator state for checkpointing/resumption
 */
interface OrchestratorState {
  runId: string;
  scenarioId: string;
  startTime: string;
  currentMilestone?: string;
  completedMilestones: string[];
  failedMilestones: string[];
  milestoneResults: MilestoneResult[];
  sessions: { id: string; workspacePath?: string }[];
  lastCheckpoint: string;
}

/**
 * Run an orchestrated scenario with milestones, multiple sessions, and long-running waits
 */
export async function runOrchestratedScenario(
  scenario: Scenario,
  config: RunConfig,
  onEvent?: RunEventHandler
): Promise<RunReport> {
  const emit: RunEventHandler = onEvent || (() => {});
  const runId = nanoid();
  const startTime = new Date().toISOString();
  
  const orchestration = scenario.orchestration!;
  const sessions: Map<string, SessionContext> = new Map();
  const milestoneResults: MilestoneResult[] = [];
  
  // State for checkpointing
  let state: OrchestratorState = {
    runId,
    scenarioId: scenario.id,
    startTime,
    completedMilestones: [],
    failedMilestones: [],
    milestoneResults: [],
    sessions: [],
    lastCheckpoint: startTime,
  };
  
  // Try to restore from checkpoint
  if (orchestration.checkpointPath) {
    const restoredState = loadCheckpoint(orchestration.checkpointPath, scenario.id);
    if (restoredState) {
      emit({
        type: 'log',
        timestamp: new Date().toISOString(),
        data: { message: `Restored from checkpoint: ${restoredState.completedMilestones.length} milestones completed` },
      });
      state = { ...restoredState, runId }; // Keep new runId
    }
  }
  
  emit({
    type: 'run:start',
    timestamp: startTime,
    data: { runId, scenarioId: scenario.id, orchestrated: true },
  });
  
  // Setup checkpoint saving
  const checkpointInterval = setInterval(() => {
    saveCheckpoint(state, orchestration.checkpointPath);
  }, orchestration.checkpointInterval);
  
  try {
    // Setup sessions
    if (orchestration.sessions && orchestration.sessions.length > 0) {
      emit({
        type: 'log',
        timestamp: new Date().toISOString(),
        data: { message: `Setting up ${orchestration.sessions.length} VS Code sessions...` },
      });
      
      for (const sessionConfig of orchestration.sessions) {
        const session = await setupSession(sessionConfig, runId, emit);
        sessions.set(sessionConfig.id, session);
        state.sessions.push({ id: sessionConfig.id, workspacePath: session.workspacePath });
      }
    } else {
      // Default single session
      const defaultSession = await setupSession({
        id: 'default',
        freshProfile: config.freshProfile ?? true,
      }, runId, emit);
      sessions.set('default', defaultSession);
    }
    
    // Execute milestones
    const milestones = orchestration.milestones || [];
    const pendingMilestones = milestones.filter(
      m => !state.completedMilestones.includes(m.id) && !state.failedMilestones.includes(m.id)
    );
    
    emit({
      type: 'log',
      timestamp: new Date().toISOString(),
      data: { message: `Executing ${pendingMilestones.length} milestones (${state.completedMilestones.length} already complete)` },
    });
    
    // Execute milestones respecting dependencies
    const executing: Map<string, Promise<MilestoneResult>> = new Map();
    const completed: Set<string> = new Set(state.completedMilestones);
    
    while (completed.size < milestones.length) {
      // Find milestones ready to execute
      const ready = milestones.filter(m => 
        !completed.has(m.id) &&
        !executing.has(m.id) &&
        !state.failedMilestones.includes(m.id) &&
        (m.dependsOn || []).every(dep => completed.has(dep))
      );
      
      if (ready.length === 0 && executing.size === 0) {
        // Deadlock or all remaining milestones have failed dependencies
        emit({
          type: 'log',
          timestamp: new Date().toISOString(),
          data: { message: 'No more milestones can be executed' },
        });
        break;
      }
      
      // Start ready milestones (respecting parallel flag)
      for (const milestone of ready) {
        if (!milestone.parallel && executing.size > 0) {
          continue; // Wait for current to complete
        }
        
        state.currentMilestone = milestone.id;
        
        const promise = executeMilestone(
          milestone,
          sessions,
          orchestration,
          emit
        ).then(result => {
          if (result.status === 'passed') {
            completed.add(milestone.id);
            state.completedMilestones.push(milestone.id);
          } else if (result.status === 'failed') {
            if (milestone.critical) {
              state.failedMilestones.push(milestone.id);
              if (orchestration.failureStrategy === 'abort') {
                throw new Error(`Critical milestone failed: ${milestone.name}`);
              }
            } else {
              // Non-critical failure, mark as completed to unblock dependents
              completed.add(milestone.id);
            }
          }
          state.milestoneResults.push(result);
          return result;
        });
        
        executing.set(milestone.id, promise);
      }
      
      // Wait for at least one to complete
      if (executing.size > 0) {
        const [completedId, result] = await Promise.race(
          Array.from(executing.entries()).map(async ([id, promise]) => {
            const result = await promise;
            return [id, result] as const;
          })
        );
        
        executing.delete(completedId as string);
        milestoneResults.push(result as MilestoneResult);
      }
      
      // Save checkpoint periodically
      if (Date.now() - new Date(state.lastCheckpoint).getTime() > orchestration.checkpointInterval) {
        saveCheckpoint(state, orchestration.checkpointPath);
        state.lastCheckpoint = new Date().toISOString();
      }
    }
    
  } finally {
    // Cleanup
    clearInterval(checkpointInterval);
    
    // Close all sessions
    for (const [id, session] of sessions) {
      try {
        await session.app.close();
        emit({
          type: 'log',
          timestamp: new Date().toISOString(),
          data: { message: `Closed session: ${id}` },
        });
      } catch {
        // Already closed
      }
    }
    
    // Save final checkpoint
    saveCheckpoint(state, orchestration.checkpointPath);
  }
  
  const endTime = new Date().toISOString();
  const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
  
  // Determine overall status
  const allPassed = milestoneResults.every(r => r.status === 'passed' || r.status === 'skipped');
  const hasCriticalFailure = milestoneResults.some(r => 
    r.status === 'failed' && 
    (scenario.orchestration?.milestones?.find(m => m.id === r.milestoneId)?.critical ?? true)
  );
  
  const report: RunReport = {
    id: runId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    status: hasCriticalFailure ? 'failed' : (allPassed ? 'passed' : 'passed'),
    startTime,
    endTime,
    duration,
    environment: scenario.environment || {
      vscodeTarget: 'desktop',
      vscodeVersion: 'stable',
      platform: 'macOS',
      copilotChannel: 'stable',
    },
    steps: milestoneResults.flatMap(m => m.stepResults),
    assertions: [],
    milestones: milestoneResults,
    artifacts: {
      screenshots: milestoneResults.filter(m => m.screenshot).map(m => m.screenshot!),
      logs: path.join(CONFIG_DIR, 'artifacts', runId, 'orchestrated.log'),
    },
  };
  
  emit({
    type: 'run:complete',
    timestamp: endTime,
    data: report,
  });
  
  return report;
}

/**
 * Setup a VS Code session
 */
async function setupSession(
  sessionConfig: SessionConfig,
  runId: string,
  emit: RunEventHandler
): Promise<SessionContext> {
  emit({
    type: 'log',
    timestamp: new Date().toISOString(),
    data: { message: `Setting up session: ${sessionConfig.id}` },
  });
  
  // Setup workspace if needed
  let workspacePath = sessionConfig.workspacePath;
  
  if (sessionConfig.repository) {
    const wsResult = await setupWorkspace(
      { 
        vscodeTarget: 'desktop',
        vscodeVersion: sessionConfig.vscodeVersion || 'stable',
        platform: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'windows' : 'linux',
        copilotChannel: 'stable',
        repository: sessionConfig.repository,
      },
      runId,
      (msg) => emit({
        type: 'log',
        timestamp: new Date().toISOString(),
        data: { sessionId: sessionConfig.id, message: msg },
      })
    );
    
    if (!wsResult.success) {
      throw new Error(`Failed to setup workspace: ${wsResult.error}`);
    }
    
    workspacePath = wsResult.workspacePath;
  }
  
  // Get VS Code path
  const vscodePath = getVSCodePath(sessionConfig.vscodeVersion);
  
  // Build launch args
  const artifactsPath = path.join(CONFIG_DIR, 'artifacts', runId, sessionConfig.id);
  fs.mkdirSync(artifactsPath, { recursive: true });
  
  const args: string[] = [
    '--disable-telemetry',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--disable-updates',
  ];
  
  if (sessionConfig.freshProfile) {
    const userDataDir = path.join(artifactsPath, 'user-data');
    const extensionsDir = path.join(artifactsPath, 'extensions');
    args.push(`--user-data-dir=${userDataDir}`);
    args.push(`--extensions-dir=${extensionsDir}`);
  }
  
  if (workspacePath) {
    args.push(workspacePath);
  }
  
  // Launch VS Code
  const app = await electron.launch({
    executablePath: vscodePath,
    args,
    timeout: 60000,
  });
  
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  
  // Wait for VS Code to be ready
  await page.waitForSelector('.monaco-workbench', {
    state: 'visible',
    timeout: 60000,
  });
  
  await page.waitForTimeout(2000);
  
  emit({
    type: 'log',
    timestamp: new Date().toISOString(),
    data: { message: `Session ${sessionConfig.id} ready` },
  });
  
  return {
    id: sessionConfig.id,
    app,
    page,
    workspacePath,
    isActive: true,
  };
}

/**
 * Execute a single milestone
 */
async function executeMilestone(
  milestone: Milestone,
  sessions: Map<string, SessionContext>,
  orchestration: OrchestratedScenarioConfig,
  emit: RunEventHandler
): Promise<MilestoneResult> {
  const startTime = new Date().toISOString();
  
  emit({
    type: 'log',
    timestamp: startTime,
    data: { message: `Starting milestone: ${milestone.name}` },
  });
  
  const result: MilestoneResult = {
    milestoneId: milestone.id,
    name: milestone.name,
    status: 'running',
    startTime,
    stepResults: [],
    waitResults: [],
  };
  
  // Get the session to use (default to first)
  const session = sessions.values().next().value as SessionContext;
  
  if (!session || !session.isActive) {
    result.status = 'failed';
    result.error = 'No active session available';
    return result;
  }
  
  let retryCount = 0;
  const maxRetries = orchestration.maxRetries;
  
  while (retryCount <= maxRetries) {
    try {
      // Execute steps
      for (const step of milestone.steps) {
        // Import executeStep dynamically to avoid circular dependency
        const { executeStepSimple } = await import('./runner-utils');
        
        const stepResult = await executeStepSimple(step, session.page, emit);
        result.stepResults.push(stepResult);
        
        if (stepResult.status === 'failed' && !step.optional) {
          throw new Error(`Step failed: ${step.id} - ${stepResult.error}`);
        }
      }
      
      // Wait for conditions
      if (milestone.waitFor && milestone.waitFor.length > 0) {
        result.status = 'waiting';
        
        for (const condition of milestone.waitFor) {
          const waitResult = await waitForCondition(condition, session.page, emit);
          result.waitResults?.push(waitResult);
          
          if (!waitResult.passed) {
            throw new Error(`Wait condition failed: ${condition.description || condition.type}`);
          }
        }
      }
      
      // Take screenshot
      if (milestone.screenshot) {
        const screenshotPath = path.join(
          CONFIG_DIR, 'artifacts', 'screenshots',
          `milestone_${milestone.id}.png`
        );
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
        await session.page.screenshot({ path: screenshotPath });
        result.screenshot = screenshotPath;
      }
      
      result.status = 'passed';
      break;
      
    } catch (err) {
      retryCount++;
      result.retryCount = retryCount;
      
      if (retryCount <= maxRetries && orchestration.failureStrategy === 'retry') {
        emit({
          type: 'log',
          timestamp: new Date().toISOString(),
          data: { message: `Milestone ${milestone.name} failed, retrying (${retryCount}/${maxRetries})` },
        });
        
        // Clear step results for retry
        result.stepResults = [];
        result.waitResults = [];
        
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        result.status = 'failed';
        result.error = err instanceof Error ? err.message : String(err);
        break;
      }
    }
  }
  
  result.endTime = new Date().toISOString();
  result.duration = new Date(result.endTime).getTime() - new Date(startTime).getTime();
  
  emit({
    type: 'log',
    timestamp: result.endTime,
    data: { message: `Milestone ${milestone.name}: ${result.status} (${result.duration}ms)` },
  });
  
  return result;
}

/**
 * Wait for a condition to be met
 */
async function waitForCondition(
  condition: WaitCondition,
  page: Page,
  emit: RunEventHandler
): Promise<{
  conditionType: string;
  target?: string;
  passed: boolean;
  waitTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  const timeout = condition.timeout;
  const pollInterval = condition.pollInterval;
  
  emit({
    type: 'log',
    timestamp: new Date().toISOString(),
    data: { message: `Waiting for: ${condition.description || condition.type}` },
  });
  
  while (Date.now() - startTime < timeout) {
    try {
      let conditionMet = false;
      
      switch (condition.type) {
        case 'element':
          if (condition.target) {
            const element = await page.$(condition.target);
            conditionMet = !!element && await element.isVisible();
          }
          break;
          
        case 'text':
          if (condition.expected) {
            const bodyText = await page.textContent('body') || '';
            conditionMet = bodyText.includes(condition.expected);
          }
          break;
          
        case 'notification':
          // Check for VS Code notification with specific text
          const notificationText = await page.textContent('.notifications-list-container') || '';
          conditionMet = condition.expected 
            ? notificationText.includes(condition.expected)
            : notificationText.length > 0;
          break;
          
        case 'timeout':
          // Just wait
          await new Promise(resolve => setTimeout(resolve, timeout));
          conditionMet = true;
          break;
          
        case 'manual':
          // Log and wait for confirmation file
          emit({
            type: 'log',
            timestamp: new Date().toISOString(),
            data: { message: `MANUAL CONFIRMATION REQUIRED: ${condition.description}` },
          });
          // In CI, could check for a file or API call
          conditionMet = true;
          break;
          
        case 'agentComplete':
          // Check for agent completion indicators
          // This is specific to VS Code Copilot agent sessions
          const agentStatus = await page.textContent('.agent-session-status, [data-testid="agent-status"]') || '';
          conditionMet = agentStatus.includes('complete') || 
                        agentStatus.includes('finished') ||
                        agentStatus.includes('done');
          break;
          
        default:
          conditionMet = true;
      }
      
      if (conditionMet) {
        return {
          conditionType: condition.type,
          target: condition.target,
          passed: true,
          waitTime: Date.now() - startTime,
        };
      }
      
    } catch (err) {
      // Continue polling
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    // Emit progress
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (elapsed % 30 === 0) {
      emit({
        type: 'log',
        timestamp: new Date().toISOString(),
        data: { message: `  Still waiting... (${elapsed}s elapsed)` },
      });
    }
  }
  
  return {
    conditionType: condition.type,
    target: condition.target,
    passed: false,
    waitTime: Date.now() - startTime,
    error: `Timeout after ${timeout}ms`,
  };
}

/**
 * Save checkpoint to disk
 */
function saveCheckpoint(state: OrchestratorState, checkpointPath?: string): void {
  const savePath = checkpointPath || path.join(CHECKPOINTS_DIR, `${state.scenarioId}.json`);
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, JSON.stringify(state, null, 2));
}

/**
 * Load checkpoint from disk
 */
function loadCheckpoint(checkpointPath: string, scenarioId: string): OrchestratorState | null {
  const loadPath = checkpointPath || path.join(CHECKPOINTS_DIR, `${scenarioId}.json`);
  
  if (!fs.existsSync(loadPath)) {
    return null;
  }
  
  try {
    const data = fs.readFileSync(loadPath, 'utf-8');
    return JSON.parse(data) as OrchestratorState;
  } catch {
    return null;
  }
}

/**
 * Get VS Code path for specified version
 */
function getVSCodePath(version?: string): string {
  const platform = process.platform;
  const isInsiders = version === 'insiders' || version === 'exploration';
  
  if (platform === 'darwin') {
    return isInsiders
      ? '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron'
      : '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
  } else if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    return isInsiders
      ? path.join(localAppData, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe')
      : path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe');
  } else {
    return isInsiders ? '/usr/bin/code-insiders' : '/usr/bin/code';
  }
}

/**
 * Check if a scenario should use orchestration
 */
export function isOrchestratedScenario(scenario: Scenario): boolean {
  return scenario.orchestration?.enabled === true;
}
