import { Page } from 'playwright';
import {
  TelemetryConfig,
  TelemetryExpectation,
  TelemetryValidationResult,
  CapturedTelemetryEvent,
} from './types';

// ============================================================================
// Telemetry Capture and Validation
// ============================================================================

/**
 * Telemetry collector that intercepts VS Code telemetry events
 */
export class TelemetryCollector {
  private events: CapturedTelemetryEvent[] = [];
  private config: TelemetryConfig;
  private isActive = false;
  private currentStepId?: string;

  constructor(config: TelemetryConfig) {
    this.config = config;
  }

  /**
   * Start collecting telemetry from the VS Code page
   */
  async start(page: Page): Promise<void> {
    if (!this.config.enabled) return;
    
    this.isActive = true;
    this.events = [];

    // Inject telemetry interceptor into VS Code's renderer process
    await page.evaluate(() => {
      // Store original telemetry sender
      const win = window as any;
      
      // Try to intercept the telemetry service
      // VS Code uses different mechanisms, we'll try multiple approaches
      
      // Approach 1: Intercept fetch calls to telemetry endpoints
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = args[0]?.toString() || '';
        if (url.includes('telemetry') || url.includes('vortex')) {
          try {
            const body = args[1]?.body;
            if (body) {
              const data = typeof body === 'string' ? JSON.parse(body) : body;
              win.__scenarioTelemetry = win.__scenarioTelemetry || [];
              win.__scenarioTelemetry.push({
                type: 'fetch',
                url,
                data,
                timestamp: new Date().toISOString(),
              });
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
        return originalFetch.apply(this, args);
      };

      // Approach 2: Listen for custom telemetry events
      window.addEventListener('vscode-telemetry', (e: any) => {
        win.__scenarioTelemetry = win.__scenarioTelemetry || [];
        win.__scenarioTelemetry.push({
          type: 'event',
          event: e.detail?.eventName,
          properties: e.detail?.properties,
          timestamp: new Date().toISOString(),
        });
      });

      // Approach 3: Intercept console for telemetry logs (debug mode)
      const originalLog = console.log;
      console.log = function(...args) {
        const msg = args.join(' ');
        if (msg.includes('telemetry') || msg.includes('TELEMETRY')) {
          win.__scenarioTelemetry = win.__scenarioTelemetry || [];
          win.__scenarioTelemetry.push({
            type: 'log',
            message: msg,
            timestamp: new Date().toISOString(),
          });
        }
        return originalLog.apply(this, args);
      };

      win.__scenarioTelemetry = [];
    });
  }

  /**
   * Set the current step ID for event correlation
   */
  setCurrentStep(stepId: string): void {
    this.currentStepId = stepId;
  }

  /**
   * Collect any new telemetry events from the page
   */
  async collect(page: Page): Promise<CapturedTelemetryEvent[]> {
    if (!this.config.enabled || !this.isActive) return [];

    const rawEvents = await page.evaluate(() => {
      const win = window as any;
      const events = win.__scenarioTelemetry || [];
      win.__scenarioTelemetry = []; // Clear collected
      return events;
    });

    const newEvents: CapturedTelemetryEvent[] = rawEvents.map((raw: any) => ({
      event: raw.event || raw.type || 'unknown',
      properties: raw.properties || raw.data || { raw },
      timestamp: raw.timestamp,
      stepId: this.currentStepId,
    }));

    this.events.push(...newEvents);
    return newEvents;
  }

  /**
   * Stop collecting and return all events
   */
  async stop(page: Page): Promise<CapturedTelemetryEvent[]> {
    if (!this.config.enabled) return [];
    
    // Final collection
    await this.collect(page);
    this.isActive = false;

    // Clean up
    await page.evaluate(() => {
      const win = window as any;
      delete win.__scenarioTelemetry;
    });

    return this.events;
  }

  /**
   * Get all captured events
   */
  getEvents(): CapturedTelemetryEvent[] {
    return [...this.events];
  }

  /**
   * Validate captured events against expectations
   */
  validate(): TelemetryValidationResult {
    const expectedResults = this.config.expectedEvents.map(expectation => {
      const matchedEvent = this.findMatchingEvent(expectation);
      return {
        event: expectation.event,
        expected: expectation.required,
        found: !!matchedEvent,
        matchedEvent,
        error: expectation.required && !matchedEvent 
          ? `Required event "${expectation.event}" was not captured`
          : undefined,
      };
    });

    const missingEvents = expectedResults
      .filter(r => r.expected && !r.found)
      .map(r => r.event);

    // Find unexpected events (if not in captureAll mode, these are events we didn't expect)
    const expectedEventNames = new Set(this.config.expectedEvents.map(e => e.event));
    const unexpectedEvents = this.events
      .filter(e => !expectedEventNames.has(e.event))
      .map(e => e.event);

    return {
      enabled: this.config.enabled,
      capturedEvents: this.events,
      expectedResults,
      passed: missingEvents.length === 0 || !this.config.failOnMissing,
      missingEvents,
      unexpectedEvents: this.config.captureAll ? unexpectedEvents : [],
    };
  }

  /**
   * Find an event matching the expectation
   */
  private findMatchingEvent(expectation: TelemetryExpectation): CapturedTelemetryEvent | undefined {
    return this.events.find(event => {
      // Match event name
      if (!event.event.includes(expectation.event) && 
          expectation.event !== event.event) {
        return false;
      }

      // Match step if specified
      if (expectation.duringStep && event.stepId !== expectation.duringStep) {
        return false;
      }

      // Match properties if specified
      if (expectation.properties) {
        for (const [key, value] of Object.entries(expectation.properties)) {
          if (event.properties[key] !== value) {
            return false;
          }
        }
      }

      return true;
    });
  }
}

/**
 * Generate telemetry validation report
 */
export function generateTelemetryReport(result: TelemetryValidationResult): string {
  const lines: string[] = [];

  lines.push('# Telemetry Validation Report');
  lines.push('');

  if (!result.enabled) {
    lines.push('Telemetry validation was not enabled for this run.');
    return lines.join('\n');
  }

  const status = result.passed ? '✅ PASSED' : '❌ FAILED';
  lines.push(`**Status:** ${status}`);
  lines.push(`**Events Captured:** ${result.capturedEvents.length}`);
  lines.push('');

  // Expected events table
  lines.push('## Expected Events');
  lines.push('');
  lines.push('| Event | Required | Found | Status |');
  lines.push('|-------|----------|-------|--------|');

  for (const r of result.expectedResults) {
    const status = r.found ? '✅' : (r.expected ? '❌' : '⚠️');
    lines.push(`| ${r.event} | ${r.expected ? 'Yes' : 'No'} | ${r.found ? 'Yes' : 'No'} | ${status} |`);
  }
  lines.push('');

  // Missing events
  if (result.missingEvents.length > 0) {
    lines.push('## Missing Required Events');
    lines.push('');
    for (const event of result.missingEvents) {
      lines.push(`- ❌ ${event}`);
    }
    lines.push('');
  }

  // Captured events detail
  if (result.capturedEvents.length > 0) {
    lines.push('## Captured Events');
    lines.push('');
    lines.push('| Timestamp | Event | Step | Properties |');
    lines.push('|-----------|-------|------|------------|');

    for (const event of result.capturedEvents.slice(0, 50)) { // Limit to 50
      const props = JSON.stringify(event.properties).substring(0, 50);
      lines.push(`| ${event.timestamp} | ${event.event} | ${event.stepId || '-'} | ${props}... |`);
    }

    if (result.capturedEvents.length > 50) {
      lines.push(`| ... | *${result.capturedEvents.length - 50} more events* | | |`);
    }
  }

  return lines.join('\n');
}
