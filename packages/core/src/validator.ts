import { Scenario, ValidationIssue, KNOWN_ACTIONS, Step } from './types';

/**
 * Extended validation result with more details
 */
export interface ExtendedValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate a scenario before running (semantic validation)
 * Checks for unknown actions, missing required fields, and potential issues
 * This is different from schema validation - it checks if the scenario makes sense
 */
export function validateScenarioSemantics(scenario: Scenario): ExtendedValidationResult {
  const issues: ValidationIssue[] = [];

  // Check required top-level fields
  if (!scenario.id) {
    issues.push({
      severity: 'error',
      message: 'Scenario is missing required field: id',
      field: 'id',
    });
  }

  if (!scenario.name) {
    issues.push({
      severity: 'error',
      message: 'Scenario is missing required field: name',
      field: 'name',
    });
  }

  if (!scenario.steps || scenario.steps.length === 0) {
    issues.push({
      severity: 'error',
      message: 'Scenario has no steps defined',
      field: 'steps',
    });
  }

  // Validate each step
  const stepIds = new Set<string>();
  for (const step of scenario.steps || []) {
    const stepIssues = validateStep(step, stepIds);
    issues.push(...stepIssues);
    stepIds.add(step.id);
  }

  // Check screenshot references
  if (scenario.outputs?.screenshots) {
    for (const screenshot of scenario.outputs.screenshots) {
      if (!stepIds.has(screenshot.atStep)) {
        issues.push({
          severity: 'warning',
          message: `Screenshot references unknown step: "${screenshot.atStep}"`,
          field: 'outputs.screenshots',
          suggestion: `Valid step IDs are: ${Array.from(stepIds).join(', ')}`,
        });
      }
    }
  }

  // Check for observations without screenshots (auto-fix suggestion)
  for (const step of scenario.steps || []) {
    if (step.observations && step.observations.length > 0) {
      const hasScreenshot = scenario.outputs?.screenshots?.some(s => s.atStep === step.id);
      if (!hasScreenshot) {
        issues.push({
          severity: 'info',
          message: `Step "${step.id}" has observations but no explicit screenshot configured`,
          stepId: step.id,
          suggestion: 'Screenshots will be auto-captured for steps with observations',
        });
      }
    }
  }

  // Check terminology checks
  if (scenario.terminologyChecks) {
    for (const check of scenario.terminologyChecks) {
      if (!check.expectedTerms || check.expectedTerms.length === 0) {
        issues.push({
          severity: 'warning',
          message: 'Terminology check has no expected terms',
          field: 'terminologyChecks',
        });
      }
    }
  }

  return {
    valid: !issues.some(i => i.severity === 'error'),
    issues,
  };
}

/**
 * Validate a single step
 */
function validateStep(step: Step, existingIds: Set<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for duplicate step IDs
  if (existingIds.has(step.id)) {
    issues.push({
      severity: 'error',
      message: `Duplicate step ID: "${step.id}"`,
      stepId: step.id,
    });
  }

  // Check if action is known
  if (!KNOWN_ACTIONS.includes(step.action as any)) {
    issues.push({
      severity: 'warning',
      message: `Unknown action: "${step.action}"`,
      stepId: step.id,
      suggestion: `Known actions: ${KNOWN_ACTIONS.slice(0, 10).join(', ')}...`,
    });
  }

  // Check for common action-specific issues
  switch (step.action) {
    case 'sendChatMessage':
      if (!step.args?.message) {
        issues.push({
          severity: 'error',
          message: 'sendChatMessage requires a "message" argument',
          stepId: step.id,
        });
      }
      break;

    case 'typeText':
      if (!step.args?.text) {
        issues.push({
          severity: 'error',
          message: 'typeText requires a "text" argument',
          stepId: step.id,
        });
      }
      break;

    case 'pressKey':
      if (!step.args?.key) {
        issues.push({
          severity: 'error',
          message: 'pressKey requires a "key" argument',
          stepId: step.id,
        });
      }
      break;

    case 'wait':
      if (!step.args?.duration) {
        issues.push({
          severity: 'warning',
          message: 'wait action has no duration specified, will use default',
          stepId: step.id,
        });
      }
      break;

    case 'clickElement':
      if (!step.args?.selector && !step.args?.target) {
        issues.push({
          severity: 'error',
          message: 'clickElement requires a "selector" or "target" argument',
          stepId: step.id,
        });
      }
      break;

    case 'openFile':
      if (!step.args?.path) {
        issues.push({
          severity: 'error',
          message: 'openFile requires a "path" argument',
          stepId: step.id,
        });
      }
      break;
  }

  // Warn about very long timeouts
  if (step.timeout && step.timeout > 60000) {
    issues.push({
      severity: 'warning',
      message: `Step has unusually long timeout: ${step.timeout}ms (${step.timeout / 1000}s)`,
      stepId: step.id,
    });
  }

  return issues;
}

/**
 * Format validation results for display
 */
export function formatValidationResult(result: ExtendedValidationResult): string {
  if (result.valid && result.issues.length === 0) {
    return '✓ Scenario is valid';
  }

  const lines: string[] = [];
  
  if (!result.valid) {
    lines.push('✗ Scenario has validation errors:\n');
  } else {
    lines.push('⚠ Scenario has warnings:\n');
  }

  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');

  for (const issue of errors) {
    lines.push(`  ✗ ERROR: ${issue.message}`);
    if (issue.stepId) lines.push(`    Step: ${issue.stepId}`);
    if (issue.suggestion) lines.push(`    Suggestion: ${issue.suggestion}`);
  }

  for (const issue of warnings) {
    lines.push(`  ⚠ WARNING: ${issue.message}`);
    if (issue.stepId) lines.push(`    Step: ${issue.stepId}`);
    if (issue.suggestion) lines.push(`    Suggestion: ${issue.suggestion}`);
  }

  for (const issue of infos) {
    lines.push(`  ℹ INFO: ${issue.message}`);
    if (issue.suggestion) lines.push(`    ${issue.suggestion}`);
  }

  return lines.join('\n');
}
