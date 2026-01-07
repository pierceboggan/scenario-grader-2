import { Page, Route } from 'playwright';
import {
  ErrorRecoveryConfig,
  ErrorRecoveryResult,
  ErrorInjectionType,
  RecoveryBehavior,
} from './types';

// ============================================================================
// Error Injection and Recovery Testing
// ============================================================================

/**
 * Error injector that simulates various failure scenarios
 */
export class ErrorInjector {
  private activeInjections: Map<string, () => Promise<void>> = new Map();
  private page?: Page;

  constructor(_config: ErrorRecoveryConfig) {
    // Config stored for potential future use
  }

  /**
   * Initialize the injector with a page
   */
  async initialize(page: Page): Promise<void> {
    this.page = page;
  }

  /**
   * Inject an error during scenario execution
   */
  async injectError(
    errorType: ErrorInjectionType,
    log: (msg: string) => void
  ): Promise<void> {
    if (!this.page) {
      throw new Error('ErrorInjector not initialized with a page');
    }

    log(`Injecting error: ${errorType}`);

    switch (errorType) {
      case 'networkTimeout':
        await this.injectNetworkTimeout();
        break;

      case 'networkError':
        await this.injectNetworkError();
        break;

      case 'apiRateLimit':
        await this.injectApiRateLimit();
        break;

      case 'apiError':
        await this.injectApiError();
        break;

      case 'extensionCrash':
        await this.injectExtensionCrash();
        break;

      case 'authExpired':
        await this.injectAuthExpired();
        break;

      case 'diskFull':
        await this.injectDiskFull();
        break;

      case 'permissionDenied':
        await this.injectPermissionDenied();
        break;

      default:
        throw new Error(`Unknown error type: ${errorType}`);
    }
  }

  /**
   * Remove all injected errors
   */
  async clearInjections(): Promise<void> {
    for (const [_id, cleanup] of this.activeInjections) {
      try {
        await cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.activeInjections.clear();
  }

  /**
   * Inject network timeout for API calls
   */
  private async injectNetworkTimeout(): Promise<void> {
    if (!this.page) return;

    await this.page.route('**/*api*/**', async (route: Route) => {
      // Delay indefinitely (will timeout)
      await new Promise(resolve => setTimeout(resolve, 60000));
      await route.abort('timedout');
    });

    this.activeInjections.set('networkTimeout', async () => {
      await this.page?.unroute('**/*api*/**');
    });
  }

  /**
   * Inject network error
   */
  private async injectNetworkError(): Promise<void> {
    if (!this.page) return;

    await this.page.route('**/*api*/**', async (route: Route) => {
      await route.abort('connectionfailed');
    });

    this.activeInjections.set('networkError', async () => {
      await this.page?.unroute('**/*api*/**');
    });
  }

  /**
   * Inject API rate limit (429 response)
   */
  private async injectApiRateLimit(): Promise<void> {
    if (!this.page) return;

    await this.page.route('**/*api*/**', async (route: Route) => {
      await route.fulfill({
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Remaining': '0',
        },
        body: JSON.stringify({
          error: 'rate_limit_exceeded',
          message: 'Too many requests. Please try again later.',
        }),
      });
    });

    this.activeInjections.set('apiRateLimit', async () => {
      await this.page?.unroute('**/*api*/**');
    });
  }

  /**
   * Inject API error (500 response)
   */
  private async injectApiError(): Promise<void> {
    if (!this.page) return;

    await this.page.route('**/*api*/**', async (route: Route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({
          error: 'internal_server_error',
          message: 'An unexpected error occurred.',
        }),
      });
    });

    this.activeInjections.set('apiError', async () => {
      await this.page?.unroute('**/*api*/**');
    });
  }

  /**
   * Simulate extension crash via evaluation
   */
  private async injectExtensionCrash(): Promise<void> {
    if (!this.page) return;

    await this.page.evaluate(() => {
      // Trigger an error in extension host context
      const win = window as any;
      if (win.vscode?.extensions) {
        // Try to crash a specific extension
        win.__extensionCrashSimulated = true;
      }
      // Dispatch error event
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'Extension host crashed',
        error: new Error('Simulated extension crash'),
      }));
    });

    this.activeInjections.set('extensionCrash', async () => {
      await this.page?.evaluate(() => {
        const win = window as any;
        delete win.__extensionCrashSimulated;
      });
    });
  }

  /**
   * Simulate authentication expiration
   */
  private async injectAuthExpired(): Promise<void> {
    if (!this.page) return;

    // Intercept auth-related API calls
    await this.page.route('**/*auth*/**', async (route: Route) => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({
          error: 'token_expired',
          message: 'Your session has expired. Please sign in again.',
        }),
      });
    });

    // Also intercept GitHub API calls
    await this.page.route('**/api.github.com/**', async (route: Route) => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest',
        }),
      });
    });

    this.activeInjections.set('authExpired', async () => {
      await this.page?.unroute('**/*auth*/**');
      await this.page?.unroute('**/api.github.com/**');
    });
  }

  /**
   * Simulate disk full errors
   */
  private async injectDiskFull(): Promise<void> {
    if (!this.page) return;

    await this.page.evaluate(() => {
      // Override localStorage to throw
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function() {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      };
      (window as any).__originalSetItem = originalSetItem;
    });

    this.activeInjections.set('diskFull', async () => {
      await this.page?.evaluate(() => {
        const win = window as any;
        if (win.__originalSetItem) {
          Storage.prototype.setItem = win.__originalSetItem;
          delete win.__originalSetItem;
        }
      });
    });
  }

  /**
   * Simulate permission denied
   */
  private async injectPermissionDenied(): Promise<void> {
    if (!this.page) return;

    await this.page.route('**/*file*/**', async (route: Route) => {
      await route.fulfill({
        status: 403,
        body: JSON.stringify({
          error: 'permission_denied',
          message: 'You do not have permission to access this resource.',
        }),
      });
    });

    this.activeInjections.set('permissionDenied', async () => {
      await this.page?.unroute('**/*file*/**');
    });
  }
}

/**
 * Verify recovery behavior after error injection
 */
export async function verifyRecoveryBehavior(
  page: Page,
  expectedBehavior: RecoveryBehavior,
  timeout: number,
  log: (msg: string) => void
): Promise<{ observed: boolean; evidence?: string }> {
  const startTime = Date.now();

  log(`Checking for recovery behavior: ${expectedBehavior}`);

  while (Date.now() - startTime < timeout) {
    try {
      let observed = false;
      let evidence: string | undefined;

      switch (expectedBehavior) {
        case 'errorMessageShown':
          // Look for error notifications or messages
          const errorElement = await page.$('.notification-toast.error, .error-message, [aria-label*="error"]');
          if (errorElement) {
            observed = true;
            evidence = await errorElement.textContent() || 'Error message displayed';
          }
          break;

        case 'retryBehavior':
          // Look for retry buttons or automatic retry indicators
          const retryElement = await page.$('button:has-text("Retry"), .retry-indicator, [aria-label*="retry"]');
          if (retryElement) {
            observed = true;
            evidence = 'Retry option available';
          }
          // Also check for loading/spinner that might indicate auto-retry
          const spinner = await page.$('.loading, .spinner, [aria-busy="true"]');
          if (spinner) {
            observed = true;
            evidence = 'Auto-retry in progress (loading indicator)';
          }
          break;

        case 'fallbackUsed':
          // Look for fallback UI or cached content indicators
          const fallbackElement = await page.$('.fallback, .offline-mode, .cached-content');
          if (fallbackElement) {
            observed = true;
            evidence = await fallbackElement.textContent() || 'Fallback content displayed';
          }
          break;

        case 'gracefulDegradation':
          // Check that the UI is still responsive and shows degraded state
          const degradedElement = await page.$('.degraded-mode, .limited-functionality, .offline-indicator');
          if (degradedElement) {
            observed = true;
            evidence = 'Graceful degradation indicator present';
          }
          // Also verify UI is still interactive
          const isInteractive = await page.evaluate(() => {
            return document.body.classList.contains('monaco-workbench');
          });
          if (isInteractive) {
            observed = true;
            evidence = evidence || 'UI remains interactive';
          }
          break;

        case 'reconnectAttempt':
          // Look for reconnection indicators
          const reconnectElement = await page.$('.reconnecting, [aria-label*="reconnect"], .connection-status');
          if (reconnectElement) {
            observed = true;
            evidence = await reconnectElement.textContent() || 'Reconnection attempt detected';
          }
          break;

        case 'userPrompted':
          // Look for dialogs or prompts
          const dialog = await page.$('.monaco-dialog-box, [role="dialog"], .notification-toast');
          if (dialog) {
            observed = true;
            evidence = await dialog.textContent() || 'User prompt displayed';
          }
          break;

        case 'operationCancelled':
          // Look for cancellation confirmation
          const cancelledElement = await page.$('.cancelled, :has-text("cancelled"), :has-text("aborted")');
          if (cancelledElement) {
            observed = true;
            evidence = 'Operation cancelled confirmation';
          }
          break;

        case 'statePreserved':
          // Verify editor content or workspace state is preserved
          const editorContent = await page.$('.monaco-editor .view-lines');
          if (editorContent) {
            const text = await editorContent.textContent();
            if (text && text.length > 0) {
              observed = true;
              evidence = 'Editor content preserved';
            }
          }
          break;
      }

      if (observed) {
        log(`  ✓ Observed: ${expectedBehavior} - ${evidence}`);
        return { observed: true, evidence };
      }
    } catch (err) {
      // Continue checking
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  log(`  ✗ Not observed: ${expectedBehavior}`);
  return { observed: false };
}

/**
 * Run error recovery scenarios
 */
export async function runErrorRecoveryTests(
  page: Page,
  config: ErrorRecoveryConfig,
  log: (msg: string) => void
): Promise<ErrorRecoveryResult[]> {
  if (!config.enabled) {
    return [];
  }

  const results: ErrorRecoveryResult[] = [];
  const injector = new ErrorInjector(config);
  await injector.initialize(page);

  for (const scenario of config.scenarios) {
    log(`\nRunning error recovery scenario: ${scenario.id}`);
    log(`  Injecting: ${scenario.inject}`);
    log(`  Expected recovery: ${scenario.expectRecovery.join(', ')}`);

    const result: ErrorRecoveryResult = {
      scenarioId: scenario.id,
      injectedError: scenario.inject,
      recoveryBehaviors: [],
      passed: false,
    };

    const startTime = Date.now();

    try {
      // Inject the error
      await injector.injectError(scenario.inject, log);

      // Wait a moment for error to take effect
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify each expected recovery behavior
      for (const expectedBehavior of scenario.expectRecovery) {
        const verification = await verifyRecoveryBehavior(
          page,
          expectedBehavior,
          scenario.recoveryTimeout,
          log
        );
        result.recoveryBehaviors.push({
          behavior: expectedBehavior,
          observed: verification.observed,
          evidence: verification.evidence,
        });
      }

      result.recoveryTime = Date.now() - startTime;
      result.passed = result.recoveryBehaviors.every(b => b.observed);

    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      log(`  Error: ${result.error}`);
    } finally {
      // Clean up injected errors
      if (config.isolateScenarios) {
        await injector.clearInjections();
      }
    }

    const status = result.passed ? '✓ PASSED' : '✗ FAILED';
    log(`  Result: ${status}`);
    results.push(result);
  }

  // Final cleanup
  await injector.clearInjections();

  return results;
}

/**
 * Generate error recovery report
 */
export function generateErrorRecoveryReport(results: ErrorRecoveryResult[]): string {
  const lines: string[] = [];

  lines.push('# Error Recovery Test Report');
  lines.push('');

  if (results.length === 0) {
    lines.push('No error recovery tests were configured.');
    return lines.join('\n');
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  lines.push(`**Overall:** ${passed}/${total} scenarios passed`);
  lines.push('');

  lines.push('## Test Results');
  lines.push('');
  lines.push('| Scenario | Error Injected | Status | Recovery Time |');
  lines.push('|----------|----------------|--------|---------------|');

  for (const result of results) {
    const status = result.passed ? '✅ Passed' : '❌ Failed';
    const time = result.recoveryTime ? `${result.recoveryTime}ms` : 'N/A';
    lines.push(`| ${result.scenarioId} | ${result.injectedError} | ${status} | ${time} |`);
  }
  lines.push('');

  // Detailed results
  lines.push('## Detailed Results');
  lines.push('');

  for (const result of results) {
    lines.push(`### ${result.scenarioId}`);
    lines.push(`- **Injected Error:** ${result.injectedError}`);
    lines.push(`- **Status:** ${result.passed ? '✅ Passed' : '❌ Failed'}`);
    
    if (result.error) {
      lines.push(`- **Error:** ${result.error}`);
    }

    lines.push('- **Recovery Behaviors:**');
    for (const behavior of result.recoveryBehaviors) {
      const icon = behavior.observed ? '✅' : '❌';
      lines.push(`  - ${icon} ${behavior.behavior}: ${behavior.evidence || 'Not observed'}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
