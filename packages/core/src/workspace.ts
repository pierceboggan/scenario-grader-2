import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawn } from 'child_process';
import { Environment } from './types';

// ============================================================================
// Workspace Setup - Clone and prepare real repositories
// ============================================================================

const WORKSPACES_DIR = path.join(os.homedir(), '.scenario-runner', 'workspaces');

export interface WorkspaceSetupResult {
  success: boolean;
  workspacePath: string;
  repositoryUrl?: string;
  ref?: string;
  setupDuration: number;
  error?: string;
  setupLogs: string[];
}

/**
 * Setup workspace from environment configuration
 * Clones repositories, runs setup commands, etc.
 */
export async function setupWorkspace(
  environment: Environment,
  runId: string,
  log: (message: string) => void
): Promise<WorkspaceSetupResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  
  const addLog = (msg: string) => {
    logs.push(msg);
    log(msg);
  };
  
  // If just a workspace path is specified, use it directly
  if (environment.workspacePath && !environment.repository) {
    const resolvedPath = environment.workspacePath.replace(/^~/, os.homedir());
    
    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        workspacePath: resolvedPath,
        setupDuration: Date.now() - startTime,
        error: `Workspace path does not exist: ${resolvedPath}`,
        setupLogs: logs,
      };
    }
    
    addLog(`Using existing workspace: ${resolvedPath}`);
    return {
      success: true,
      workspacePath: resolvedPath,
      setupDuration: Date.now() - startTime,
      setupLogs: logs,
    };
  }
  
  // If no repository configured, return empty workspace
  if (!environment.repository) {
    addLog('No workspace or repository configured');
    return {
      success: true,
      workspacePath: '',
      setupDuration: Date.now() - startTime,
      setupLogs: logs,
    };
  }
  
  const repo = environment.repository;
  
  // Create workspace directory
  const repoName = extractRepoName(repo.url);
  const workspacePath = path.join(WORKSPACES_DIR, runId, repoName);
  fs.mkdirSync(workspacePath, { recursive: true });
  
  addLog(`Setting up workspace from repository: ${repo.url}`);
  addLog(`Workspace path: ${workspacePath}`);
  
  try {
    // Clone the repository
    await cloneRepository(repo.url, workspacePath, repo.ref, repo.sparse, repo.sparsePaths, addLog);
    
    // Change to subdirectory if specified
    let finalPath = workspacePath;
    if (repo.subdir) {
      finalPath = path.join(workspacePath, repo.subdir);
      if (!fs.existsSync(finalPath)) {
        throw new Error(`Subdirectory does not exist: ${repo.subdir}`);
      }
      addLog(`Using subdirectory: ${repo.subdir}`);
    }
    
    // Run setup commands
    if (repo.setupCommands && repo.setupCommands.length > 0) {
      addLog(`Running ${repo.setupCommands.length} setup commands...`);
      for (const cmd of repo.setupCommands) {
        await runSetupCommand(cmd, finalPath, addLog);
      }
    }
    
    return {
      success: true,
      workspacePath: finalPath,
      repositoryUrl: repo.url,
      ref: repo.ref,
      setupDuration: Date.now() - startTime,
      setupLogs: logs,
    };
    
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    addLog(`ERROR: ${error}`);
    
    return {
      success: false,
      workspacePath,
      repositoryUrl: repo.url,
      ref: repo.ref,
      setupDuration: Date.now() - startTime,
      error,
      setupLogs: logs,
    };
  }
}

/**
 * Extract repository name from URL
 */
function extractRepoName(url: string): string {
  // Handle various URL formats
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  // https://github.com/owner/repo
  
  const match = url.match(/[\/:]([^\/]+)\/([^\/]+?)(\.git)?$/);
  if (match) {
    return `${match[1]}_${match[2]}`;
  }
  
  // Fallback: use hash of URL
  return `repo_${hashString(url)}`;
}

/**
 * Simple string hash for fallback naming
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

/**
 * Clone a git repository
 */
async function cloneRepository(
  url: string,
  targetPath: string,
  ref?: string,
  sparse?: boolean,
  sparsePaths?: string[],
  log?: (msg: string) => void
): Promise<void> {
  const addLog = log || console.log;
  
  // Check if git is available
  try {
    execSync('git --version', { stdio: 'pipe' });
  } catch {
    throw new Error('Git is not installed or not in PATH');
  }
  
  // Handle sparse checkout for large repos
  if (sparse && sparsePaths && sparsePaths.length > 0) {
    addLog('Using sparse checkout for large repository...');
    
    // Initialize empty repo
    execSync('git init', { cwd: targetPath, stdio: 'pipe' });
    
    // Add remote
    execSync(`git remote add origin "${url}"`, { cwd: targetPath, stdio: 'pipe' });
    
    // Enable sparse checkout
    execSync('git config core.sparseCheckout true', { cwd: targetPath, stdio: 'pipe' });
    
    // Write sparse-checkout paths
    const sparseCheckoutPath = path.join(targetPath, '.git', 'info', 'sparse-checkout');
    fs.mkdirSync(path.dirname(sparseCheckoutPath), { recursive: true });
    fs.writeFileSync(sparseCheckoutPath, sparsePaths.join('\n') + '\n');
    
    // Fetch and checkout
    const refArg = ref || 'HEAD';
    addLog(`Fetching ${refArg}...`);
    execSync(`git fetch --depth=1 origin ${refArg}`, { cwd: targetPath, stdio: 'pipe' });
    execSync(`git checkout FETCH_HEAD`, { cwd: targetPath, stdio: 'pipe' });
    
  } else {
    // Regular clone
    const cloneArgs = ['clone', '--depth=1'];
    
    if (ref) {
      cloneArgs.push('--branch', ref);
    }
    
    cloneArgs.push(url, targetPath);
    
    addLog(`Cloning repository...`);
    execSync(`git ${cloneArgs.join(' ')}`, { stdio: 'pipe' });
  }
  
  addLog('Repository cloned successfully');
}

/**
 * Run a setup command in the workspace
 */
async function runSetupCommand(
  command: string,
  cwd: string,
  log: (msg: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    log(`Running: ${command}`);
    
    const proc = spawn('sh', ['-c', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Disable interactive prompts
        CI: 'true',
        TERM: 'dumb',
      },
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        log(`  ✓ Command completed`);
        resolve();
      } else {
        const error = `Command failed with code ${code}: ${stderr || stdout}`;
        log(`  ✗ ${error}`);
        reject(new Error(error));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out after 5 minutes: ${command}`));
    }, 300000);
  });
}

/**
 * Cleanup workspace after run
 */
export async function cleanupWorkspace(runId: string): Promise<void> {
  const workspacePath = path.join(WORKSPACES_DIR, runId);
  
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
}

/**
 * List cached workspaces
 */
export function listCachedWorkspaces(): Array<{
  runId: string;
  path: string;
  size: number;
  createdAt: Date;
}> {
  if (!fs.existsSync(WORKSPACES_DIR)) {
    return [];
  }
  
  const entries = fs.readdirSync(WORKSPACES_DIR);
  const results: Array<{
    runId: string;
    path: string;
    size: number;
    createdAt: Date;
  }> = [];
  
  for (const entry of entries) {
    const entryPath = path.join(WORKSPACES_DIR, entry);
    const stat = fs.statSync(entryPath);
    
    if (stat.isDirectory()) {
      results.push({
        runId: entry,
        path: entryPath,
        size: getDirectorySize(entryPath),
        createdAt: stat.birthtime,
      });
    }
  }
  
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get total size of a directory
 */
function getDirectorySize(dirPath: string): number {
  let size = 0;
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip .git directories for speed
        if (entry.name === '.git') {
          size += 1000000; // Estimate 1MB for .git
        } else {
          size += getDirectorySize(fullPath);
        }
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch {
    // Ignore permission errors
  }
  
  return size;
}

/**
 * Prune old cached workspaces
 */
export function pruneWorkspaces(maxAgeDays: number = 7): number {
  const workspaces = listCachedWorkspaces();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  
  let pruned = 0;
  
  for (const workspace of workspaces) {
    if (workspace.createdAt < cutoff) {
      try {
        fs.rmSync(workspace.path, { recursive: true, force: true });
        pruned++;
      } catch {
        // Ignore cleanup errors
      }
    }
  }
  
  return pruned;
}
