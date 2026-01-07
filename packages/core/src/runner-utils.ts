import { Step, StepResult } from './types';
import { Page } from 'playwright';
import { RunEventHandler } from './runner';

/**
 * Execute a single step (simplified version for orchestrator)
 * This is a lighter weight version of executeStep that doesn't need full VSCodeContext
 */
export async function executeStepSimple(
  step: Step,
  page: Page,
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
  
  let error: string | undefined;
  let status: 'passed' | 'failed' = 'passed';
  
  try {
    const args = step.args || {};
    const isMac = process.platform === 'darwin';
    
    switch (step.action) {
      case 'openCommandPalette':
        await page.keyboard.press(isMac ? 'Meta+Shift+P' : 'Control+Shift+P');
        await page.waitForSelector('.quick-input-widget', { timeout: 5000 });
        break;
        
      case 'openCopilotChat':
        await page.keyboard.press(isMac ? 'Meta+Shift+I' : 'Control+Shift+I');
        await page.waitForTimeout(2000);
        break;
        
      case 'typeText':
        const text = args.text || args.message || '';
        await page.keyboard.type(text, { delay: 30 });
        break;
        
      case 'sendChatMessage':
        const message = args.message || '';
        await page.keyboard.type(message, { delay: 30 });
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        if (args.waitForResponse) {
          await page.waitForTimeout(step.timeout || 10000);
        }
        break;
        
      case 'pressKey':
        await page.keyboard.press(args.key || '');
        break;
        
      case 'click':
        const target = args.target || '';
        await clickElement(page, target, log);
        break;
        
      case 'wait':
        await page.waitForTimeout(args.duration || 1000);
        break;
        
      case 'openFile':
        await page.keyboard.press(isMac ? 'Meta+P' : 'Control+P');
        await page.waitForTimeout(300);
        await page.keyboard.type(args.path || '', { delay: 30 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        break;
        
      case 'runTerminalCommand':
        await page.keyboard.press(isMac ? 'Meta+`' : 'Control+`');
        await page.waitForTimeout(1000);
        await page.keyboard.type(args.command || '', { delay: 20 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        break;
        
      case 'selectFromList':
        const selectIndex = args.index ?? 0;
        for (let i = 0; i < selectIndex; i++) {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(100);
        }
        await page.keyboard.press('Enter');
        break;
        
      default:
        log(`Action not implemented in simple executor: ${step.action}`);
    }
    
  } catch (err) {
    status = 'failed';
    error = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${error}`);
  }
  
  const endTime = new Date().toISOString();
  
  const result: StepResult = {
    stepId: step.id,
    status,
    startTime,
    endTime,
    duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
    logs,
    error,
  };
  
  emit({
    type: 'step:complete',
    timestamp: endTime,
    data: result,
  });
  
  return result;
}

/**
 * Click an element using multiple selector strategies
 */
async function clickElement(page: Page, target: string, _log: (msg: string) => void): Promise<void> {
  const strategies = [
    target,
    `text="${target}"`,
    `[aria-label="${target}"]`,
    `[aria-label*="${target}"]`,
    `[title="${target}"]`,
    `role=button[name="${target}"]`,
  ];
  
  for (const selector of strategies) {
    try {
      const element = await page.$(selector);
      if (element && await element.isVisible()) {
        await element.scrollIntoViewIfNeeded();
        await element.click();
        return;
      }
    } catch {
      // Try next strategy
    }
  }
  
  throw new Error(`Element not found: "${target}"`);
}
