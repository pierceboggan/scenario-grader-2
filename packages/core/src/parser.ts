import yaml from 'yaml';
import fs from 'fs';
import { ScenarioSchema, Scenario } from './types';
import { z } from 'zod';

// ============================================================================
// Error Types
// ============================================================================

export class ScenarioParseError extends Error {
  constructor(
    message: string,
    public readonly code: ParseErrorCode,
    public readonly filePath?: string,
    public readonly line?: number,
    public readonly column?: number,
    public readonly details?: ParseErrorDetail[]
  ) {
    super(message);
    this.name = 'ScenarioParseError';
  }
  
  /**
   * Format error for display with helpful context
   */
  format(): string {
    const lines: string[] = [
      `\n❌ Scenario Parse Error: ${this.message}`,
    ];
    
    if (this.filePath) {
      lines.push(`   File: ${this.filePath}`);
    }
    
    if (this.line !== undefined) {
      lines.push(`   Location: line ${this.line}${this.column !== undefined ? `, column ${this.column}` : ''}`);
    }
    
    if (this.details && this.details.length > 0) {
      lines.push('\n   Issues found:');
      for (const detail of this.details) {
        lines.push(`   • ${detail.path}: ${detail.message}`);
        if (detail.received !== undefined) {
          lines.push(`     Received: ${JSON.stringify(detail.received)}`);
        }
        if (detail.expected) {
          lines.push(`     Expected: ${detail.expected}`);
        }
        if (detail.suggestion) {
          lines.push(`     💡 ${detail.suggestion}`);
        }
      }
    }
    
    return lines.join('\n');
  }
}

export type ParseErrorCode =
  | 'YAML_SYNTAX_ERROR'
  | 'SCHEMA_VALIDATION_ERROR'
  | 'FILE_NOT_FOUND'
  | 'FILE_READ_ERROR'
  | 'EMPTY_FILE'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FIELD_TYPE'
  | 'INVALID_FIELD_VALUE';

export interface ParseErrorDetail {
  path: string;
  message: string;
  received?: unknown;
  expected?: string;
  suggestion?: string;
}

// ============================================================================
// Field Suggestions
// ============================================================================

/** Common misspellings and their corrections */
const FIELD_SUGGESTIONS: Record<string, string> = {
  'scenario_id': 'id',
  'scenarioId': 'id',
  'scenarioid': 'id',
  'title': 'name',
  'scenario_name': 'name',
  'desc': 'description',
  'step': 'steps',
  'action': 'steps',
  'actions': 'steps',
  'assert': 'assertions',
  'assertion': 'assertions',
  'checks': 'assertions',
  'env': 'environment',
  'config': 'environment',
  'pre': 'preconditions',
  'prerequisites': 'preconditions',
  'requires': 'preconditions',
  'output': 'outputs',
  'artifacts': 'outputs',
  'label': 'tags',
  'labels': 'tags',
  'category': 'tags',
};

/** Expected values for enum fields */
const ENUM_SUGGESTIONS: Record<string, string[]> = {
  priority: ['P0', 'P1', 'P2'],
  'environment.vscodeTarget': ['desktop', 'web'],
  'environment.vscodeVersion': ['stable', 'insiders', 'exploration'],
  'environment.platform': ['macOS', 'windows', 'linux'],
  'environment.copilotChannel': ['stable', 'prerelease', 'nightly'],
  'assertions.type': ['accountEquals', 'elementVisible', 'elementNotVisible', 'textContains', 'textEquals', 'fileExists', 'configEquals', 'llmGrade', 'custom'],
  'hints.type': ['click', 'type', 'wait', 'keyboard', 'hover'],
};

/**
 * Get a suggestion for a misspelled field
 */
function getSuggestion(field: string, parentPath: string): string | undefined {
  const fullPath = parentPath ? `${parentPath}.${field}` : field;
  
  // Check for common misspellings
  if (FIELD_SUGGESTIONS[field]) {
    return `Did you mean "${FIELD_SUGGESTIONS[field]}"?`;
  }
  
  // Check for enum value suggestions
  if (ENUM_SUGGESTIONS[fullPath]) {
    return `Valid values are: ${ENUM_SUGGESTIONS[fullPath].join(', ')}`;
  }
  
  return undefined;
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse a YAML string into a validated Scenario object
 */
export function parseScenarioYAML(yamlContent: string, filePath?: string): Scenario {
  // Check for empty content
  if (!yamlContent || yamlContent.trim() === '') {
    throw new ScenarioParseError(
      'Scenario file is empty',
      'EMPTY_FILE',
      filePath,
      undefined,
      undefined,
      [{ path: '', message: 'The file contains no content', suggestion: 'Add scenario YAML content to the file' }]
    );
  }
  
  // Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.parse(yamlContent);
  } catch (err) {
    const yamlError = err as { message?: string; linePos?: { start?: { line?: number; col?: number } } };
    const line = yamlError.linePos?.start?.line;
    const column = yamlError.linePos?.start?.col;
    
    throw new ScenarioParseError(
      `Invalid YAML syntax: ${yamlError.message || 'unknown error'}`,
      'YAML_SYNTAX_ERROR',
      filePath,
      line,
      column,
      [{
        path: '',
        message: yamlError.message || 'YAML parsing failed',
        suggestion: 'Check for proper indentation, missing colons, or unquoted special characters',
      }]
    );
  }
  
  // Check if parsed result is an object
  if (parsed === null || typeof parsed !== 'object') {
    throw new ScenarioParseError(
      'Scenario must be a YAML object/mapping',
      'SCHEMA_VALIDATION_ERROR',
      filePath,
      undefined,
      undefined,
      [{
        path: '',
        message: `Expected an object but got ${parsed === null ? 'null' : typeof parsed}`,
        received: parsed,
        suggestion: 'Ensure your YAML starts with key-value pairs like "id: my-scenario"',
      }]
    );
  }
  
  // Validate against schema
  const result = ScenarioSchema.safeParse(parsed);
  
  if (result.success) {
    return result.data;
  }
  
  // Convert Zod errors to detailed error messages
  const details = result.error.errors.map((err): ParseErrorDetail => {
    const path = err.path.join('.');
    const parentPath = err.path.slice(0, -1).join('.');
    const fieldName = err.path[err.path.length - 1];
    
    let message = err.message;
    let suggestion: string | undefined;
    let expected: string | undefined;
    
    // Enhance error messages based on error code
    switch (err.code) {
      case 'invalid_type':
        message = `Expected ${err.expected} but received ${err.received}`;
        expected = String(err.expected);
        break;
        
      case 'invalid_enum_value':
        message = `Invalid value for "${path}"`;
        const enumPath = path.includes('.') ? path : path;
        if (ENUM_SUGGESTIONS[enumPath]) {
          expected = ENUM_SUGGESTIONS[enumPath].join(' | ');
          suggestion = `Valid values are: ${ENUM_SUGGESTIONS[enumPath].join(', ')}`;
        }
        break;
        
      case 'unrecognized_keys':
        const keys = (err as any).keys as string[];
        message = `Unknown field(s): ${keys.join(', ')}`;
        const suggestions = keys
          .map(k => getSuggestion(k, parentPath))
          .filter(Boolean);
        if (suggestions.length > 0) {
          suggestion = suggestions.join('; ');
        }
        break;
        
      case 'too_small':
        if ((err as any).minimum === 1 && (err as any).type === 'array') {
          message = `"${path}" requires at least one item`;
          suggestion = `Add at least one item to the "${fieldName}" array`;
        }
        break;
        
      case 'invalid_string':
        message = `Invalid string format for "${path}"`;
        break;
    }
    
    // Add field-specific suggestions
    if (!suggestion && typeof fieldName === 'string') {
      suggestion = getSuggestion(fieldName, parentPath);
    }
    
    return {
      path: path || '(root)',
      message,
      received: (err as any).received,
      expected,
      suggestion,
    };
  });
  
  // Find missing required fields
  const requiredFields = ['id', 'name', 'description', 'priority', 'steps'];
  const parsedObj = parsed as Record<string, unknown>;
  const missingFields = requiredFields.filter(f => !(f in parsedObj));
  
  if (missingFields.length > 0) {
    for (const field of missingFields) {
      if (!details.some(d => d.path === field)) {
        details.unshift({
          path: field,
          message: `Missing required field "${field}"`,
          suggestion: `Add "${field}:" to your scenario`,
        });
      }
    }
  }
  
  throw new ScenarioParseError(
    `Invalid scenario: ${details.length} validation error(s)`,
    'SCHEMA_VALIDATION_ERROR',
    filePath,
    undefined,
    undefined,
    details
  );
}

/**
 * Load and parse a scenario from a YAML file
 */
export function parseScenarioFile(filePath: string): Scenario {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new ScenarioParseError(
      `Scenario file not found: ${filePath}`,
      'FILE_NOT_FOUND',
      filePath,
      undefined,
      undefined,
      [{
        path: '',
        message: 'The specified file does not exist',
        suggestion: `Check the file path or create the file at: ${filePath}`,
      }]
    );
  }
  
  // Read file
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new ScenarioParseError(
      `Failed to read scenario file: ${err instanceof Error ? err.message : String(err)}`,
      'FILE_READ_ERROR',
      filePath,
      undefined,
      undefined,
      [{
        path: '',
        message: 'Could not read the file',
        suggestion: 'Check file permissions and ensure the file is accessible',
      }]
    );
  }
  
  return parseScenarioYAML(content, filePath);
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
 * Validation result with detailed error information
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ParseErrorDetail[];
  /** Formatted error message for display */
  formattedError?: string;
}

/**
 * Validate a scenario object without parsing from YAML
 * Returns detailed, actionable error messages
 */
export function validateScenario(scenario: unknown): ValidationResult {
  const result = ScenarioSchema.safeParse(scenario);
  
  if (result.success) {
    return { valid: true };
  }
  
  const details = result.error.errors.map((err): ParseErrorDetail => {
    const path = err.path.join('.');
    const parentPath = err.path.slice(0, -1).join('.');
    const fieldName = err.path[err.path.length - 1];
    
    let message = err.message;
    let suggestion: string | undefined;
    let expected: string | undefined;
    
    switch (err.code) {
      case 'invalid_type':
        message = `Expected ${err.expected} but received ${err.received}`;
        expected = String(err.expected);
        break;
        
      case 'invalid_enum_value':
        message = `Invalid enum value`;
        const enumPath = path.includes('.') ? path : path;
        if (ENUM_SUGGESTIONS[enumPath]) {
          expected = ENUM_SUGGESTIONS[enumPath].join(' | ');
          suggestion = `Valid values are: ${ENUM_SUGGESTIONS[enumPath].join(', ')}`;
        }
        break;
    }
    
    if (!suggestion && typeof fieldName === 'string') {
      suggestion = getSuggestion(fieldName, parentPath);
    }
    
    return {
      path: path || '(root)',
      message,
      received: (err as any).received,
      expected,
      suggestion,
    };
  });
  
  // Build formatted error message
  const lines = ['Scenario validation failed:'];
  for (const detail of details) {
    lines.push(`  • ${detail.path}: ${detail.message}`);
    if (detail.suggestion) {
      lines.push(`    💡 ${detail.suggestion}`);
    }
  }
  
  return {
    valid: false,
    errors: details,
    formattedError: lines.join('\n'),
  };
}

/**
 * Merge partial scenario updates into existing scenario
 * Throws ScenarioParseError with detailed messages on failure
 */
export function patchScenario(
  existing: Scenario,
  patch: Partial<Scenario>
): Scenario {
  const merged = { ...existing, ...patch };
  
  try {
    return ScenarioSchema.parse(merged);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const details = err.errors.map((e): ParseErrorDetail => ({
        path: e.path.join('.'),
        message: e.message,
        received: (e as any).received,
      }));
      
      throw new ScenarioParseError(
        'Failed to patch scenario: invalid resulting object',
        'SCHEMA_VALIDATION_ERROR',
        undefined,
        undefined,
        undefined,
        details
      );
    }
    throw err;
  }
}

/**
 * Quick check if a YAML string looks like a valid scenario
 * (faster than full parsing, useful for filtering files)
 */
export function looksLikeScenario(yamlContent: string): boolean {
  if (!yamlContent || yamlContent.trim() === '') {
    return false;
  }
  
  // Check for required top-level fields
  const hasId = /^id:/m.test(yamlContent);
  const hasName = /^name:/m.test(yamlContent);
  const hasSteps = /^steps:/m.test(yamlContent);
  
  return hasId && hasName && hasSteps;
}
