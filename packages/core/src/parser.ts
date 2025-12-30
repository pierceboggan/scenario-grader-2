import yaml from 'yaml';
import fs from 'fs';
import { ScenarioSchema, Scenario } from './types';

/**
 * Parse a YAML string into a validated Scenario object
 */
export function parseScenarioYAML(yamlContent: string): Scenario {
  const parsed = yaml.parse(yamlContent);
  return ScenarioSchema.parse(parsed);
}

/**
 * Load and parse a scenario from a YAML file
 */
export function parseScenarioFile(filePath: string): Scenario {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseScenarioYAML(content);
}

/**
 * Convert a Scenario object to YAML string
 */
export function scenarioToYAML(scenario: Scenario): string {
  return yaml.stringify(scenario, {
    indent: 2,
    lineWidth: 120,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
}

/**
 * Validate a scenario object without parsing from YAML
 */
export function validateScenario(scenario: unknown): { valid: boolean; errors?: string[] } {
  const result = ScenarioSchema.safeParse(scenario);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: result.error.errors.map(
      (e) => `${e.path.join('.')}: ${e.message}`
    ),
  };
}

/**
 * Merge partial scenario updates into existing scenario
 */
export function patchScenario(
  existing: Scenario,
  patch: Partial<Scenario>
): Scenario {
  const merged = { ...existing, ...patch };
  return ScenarioSchema.parse(merged);
}
