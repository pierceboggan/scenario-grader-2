import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';

// ============================================================================
// GitHub Device Flow Authentication
// ============================================================================

/**
 * Configuration directory for scenario-runner
 */
const CONFIG_DIR = path.join(os.homedir(), '.scenario-runner');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

/**
 * GitHub OAuth App Client ID
 * This is a public client ID - device flow apps don't need a secret
 * You can register your own at: https://github.com/settings/developers
 */
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23liHQWQdP2pKL2m2j';

/**
 * GitHub device flow endpoints
 */
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

/**
 * Stored authentication data
 */
export interface StoredAuth {
  accessToken: string;
  tokenType: string;
  scope: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  authenticatedAt: string;
  expiresAt?: string;
}

/**
 * Device code response from GitHub
 */
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/**
 * Access token response from GitHub
 */
interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * GitHub user info
 */
interface GitHubUser {
  login: string;
  email: string | null;
  avatar_url: string;
  name: string | null;
}

/**
 * Make an HTTPS POST request
 */
function httpsPost(url: string, data: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Make an HTTPS GET request
 */
function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'scenario-runner',
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Sleep for given milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the GitHub device code flow
 * Returns the device code response with user_code and verification_uri
 */
export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
  const data = `client_id=${GITHUB_CLIENT_ID}&scope=read:user%20user:email`;
  
  const response = await httpsPost(GITHUB_DEVICE_CODE_URL, data, {});
  const result = JSON.parse(response) as DeviceCodeResponse;
  
  if (!result.device_code) {
    throw new Error(`Failed to start device flow: ${response}`);
  }
  
  return result;
}

/**
 * Poll for the access token after user authorizes
 */
export async function pollForToken(
  deviceCode: string,
  interval: number,
  expiresIn: number,
  onStatus?: (status: string) => void
): Promise<TokenResponse> {
  const startTime = Date.now();
  const expiresAt = startTime + expiresIn * 1000;
  let pollInterval = interval * 1000; // Convert to milliseconds
  
  while (Date.now() < expiresAt) {
    await sleep(pollInterval);
    
    const data = `client_id=${GITHUB_CLIENT_ID}&device_code=${deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;
    
    try {
      const response = await httpsPost(GITHUB_TOKEN_URL, data, {});
      const result = JSON.parse(response) as TokenResponse;
      
      if (result.access_token) {
        return result;
      }
      
      if (result.error === 'authorization_pending') {
        onStatus?.('Waiting for authorization...');
        continue;
      }
      
      if (result.error === 'slow_down') {
        // GitHub wants us to slow down - increase interval
        pollInterval += 5000;
        onStatus?.('Slowing down polling...');
        continue;
      }
      
      if (result.error === 'expired_token') {
        throw new Error('Device code expired. Please try again.');
      }
      
      if (result.error === 'access_denied') {
        throw new Error('Authorization was denied by the user.');
      }
      
      if (result.error) {
        throw new Error(`Authorization error: ${result.error} - ${result.error_description || ''}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Authorization')) {
        throw err;
      }
      // Network error - continue polling
      onStatus?.('Network error, retrying...');
    }
  }
  
  throw new Error('Device code expired. Please try again.');
}

/**
 * Get GitHub user info using access token
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await httpsGet(GITHUB_USER_URL, {
    'Authorization': `Bearer ${accessToken}`,
  });
  
  return JSON.parse(response) as GitHubUser;
}

/**
 * Complete the device flow authentication
 * Returns the stored auth data
 */
export async function authenticateWithDeviceFlow(
  onUserCode: (code: string, verificationUri: string) => void,
  onStatus?: (status: string) => void
): Promise<StoredAuth> {
  // Start device flow
  const deviceResponse = await startDeviceFlow();
  
  // Show user code to user
  onUserCode(deviceResponse.user_code, deviceResponse.verification_uri);
  
  // Poll for token
  const tokenResponse = await pollForToken(
    deviceResponse.device_code,
    deviceResponse.interval,
    deviceResponse.expires_in,
    onStatus
  );
  
  if (!tokenResponse.access_token) {
    throw new Error('Failed to get access token');
  }
  
  // Get user info
  onStatus?.('Getting user info...');
  const user = await getGitHubUser(tokenResponse.access_token);
  
  // Store authentication
  const auth: StoredAuth = {
    accessToken: tokenResponse.access_token,
    tokenType: tokenResponse.token_type || 'bearer',
    scope: tokenResponse.scope || '',
    username: user.login,
    email: user.email || undefined,
    avatarUrl: user.avatar_url,
    authenticatedAt: new Date().toISOString(),
  };
  
  await saveAuth(auth);
  
  return auth;
}

/**
 * Save authentication data to disk
 */
export async function saveAuth(auth: StoredAuth): Promise<void> {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

/**
 * Load saved authentication data
 */
export function loadAuth(): StoredAuth | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      return null;
    }
    
    const data = fs.readFileSync(AUTH_FILE, 'utf-8');
    return JSON.parse(data) as StoredAuth;
  } catch {
    return null;
  }
}

/**
 * Check if we have valid stored authentication
 */
export function hasValidAuth(): boolean {
  const auth = loadAuth();
  if (!auth) return false;
  
  // Check if token is expired (if we have expiry info)
  if (auth.expiresAt) {
    const expiresAt = new Date(auth.expiresAt);
    if (expiresAt < new Date()) {
      return false;
    }
  }
  
  return !!auth.accessToken;
}

/**
 * Clear stored authentication
 */
export function clearAuth(): void {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }
}

/**
 * Get auth status summary
 */
export function getAuthStatus(): { authenticated: boolean; username?: string; email?: string } {
  const auth = loadAuth();
  if (!auth || !auth.accessToken) {
    return { authenticated: false };
  }
  
  return {
    authenticated: true,
    username: auth.username,
    email: auth.email,
  };
}

/**
 * Verify that stored token is still valid by calling GitHub API
 */
export async function verifyAuth(): Promise<boolean> {
  const auth = loadAuth();
  if (!auth?.accessToken) {
    return false;
  }
  
  try {
    const user = await getGitHubUser(auth.accessToken);
    return !!user.login;
  } catch {
    return false;
  }
}

/**
 * Generate VS Code settings.json content with GitHub auth
 * This can be used to pre-configure a fresh VS Code profile
 */
export function generateVSCodeGitHubAuth(_auth: StoredAuth): Record<string, unknown> {
  // Note: VS Code Copilot auth is handled via secure storage, not settings.json
  // The settings here just configure the auth provider preference
  return {
    // GitHub authentication for Copilot
    'github.copilot.advanced': {
      'authProvider': 'github',
    },
    // Store the auth token for extensions
    'github-enterprise.uri': '',
  };
}

/**
 * Setup VS Code profile with stored authentication
 * Writes necessary files to the user-data directory
 */
export async function setupVSCodeAuth(userDataDir: string): Promise<boolean> {
  const auth = loadAuth();
  if (!auth?.accessToken) {
    return false;
  }
  
  try {
    // Create User directory
    const userDir = path.join(userDataDir, 'User');
    fs.mkdirSync(userDir, { recursive: true });
    
    // Write settings.json with auth config
    const settingsPath = path.join(userDir, 'settings.json');
    const settings = generateVSCodeGitHubAuth(auth);
    
    // Merge with existing settings if present
    let existingSettings = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch {
        // Ignore parse errors
      }
    }
    
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ ...existingSettings, ...settings }, null, 2)
    );
    
    // Create state database directory for extensions
    const globalStoragePath = path.join(userDataDir, 'globalStorage');
    fs.mkdirSync(globalStoragePath, { recursive: true });
    
    // Store GitHub auth in a way extensions can use
    // Note: This is a simplified approach - real Copilot uses secure storage
    const githubAuthPath = path.join(globalStoragePath, 'github-auth.json');
    fs.writeFileSync(
      githubAuthPath,
      JSON.stringify({
        token: auth.accessToken,
        username: auth.username,
        email: auth.email,
      }, null, 2),
      { mode: 0o600 }
    );
    
    return true;
  } catch (err) {
    console.error('Failed to setup VS Code auth:', err);
    return false;
  }
}
