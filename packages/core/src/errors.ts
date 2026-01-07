/**
 * Structured Error Handling System
 * 
 * Provides a consistent error hierarchy with:
 * - Error codes for programmatic handling
 * - User-friendly messages
 * - Recovery suggestions
 * - Context for debugging
 */

// ============================================================================
// Error Codes
// ============================================================================

export enum ErrorCode {
  // Parser Errors (1xxx)
  PARSE_INVALID_YAML = 1001,
  PARSE_INVALID_SCHEMA = 1002,
  PARSE_MISSING_REQUIRED = 1003,
  PARSE_FILE_NOT_FOUND = 1004,
  PARSE_FILE_READ_ERROR = 1005,

  // Validation Errors (2xxx)
  VALIDATE_STEP_INVALID = 2001,
  VALIDATE_CHECKPOINT_INVALID = 2002,
  VALIDATE_ENVIRONMENT_INVALID = 2003,
  VALIDATE_DUPLICATE_ID = 2004,
  VALIDATE_REFERENCE_NOT_FOUND = 2005,

  // Runner Errors (3xxx)
  RUNNER_VSCODE_NOT_FOUND = 3001,
  RUNNER_VSCODE_LAUNCH_FAILED = 3002,
  RUNNER_VSCODE_CRASHED = 3003,
  RUNNER_VSCODE_TIMEOUT = 3004,
  RUNNER_STEP_FAILED = 3005,
  RUNNER_STEP_TIMEOUT = 3006,
  RUNNER_ELEMENT_NOT_FOUND = 3007,
  RUNNER_SCREENSHOT_FAILED = 3008,

  // Authentication Errors (4xxx)
  AUTH_NOT_CONFIGURED = 4001,
  AUTH_EXPIRED = 4002,
  AUTH_INVALID = 4003,
  AUTH_DEVICE_FLOW_FAILED = 4004,
  AUTH_SCOPE_INSUFFICIENT = 4005,

  // Workspace Errors (5xxx)
  WORKSPACE_CLONE_FAILED = 5001,
  WORKSPACE_NOT_FOUND = 5002,
  WORKSPACE_SETUP_FAILED = 5003,
  WORKSPACE_PERMISSION_DENIED = 5004,

  // Evaluator Errors (6xxx)
  EVAL_API_ERROR = 6001,
  EVAL_RATE_LIMITED = 6002,
  EVAL_RESPONSE_INVALID = 6003,
  EVAL_NO_API_KEY = 6004,

  // Network Errors (7xxx)
  NETWORK_TIMEOUT = 7001,
  NETWORK_CONNECTION_FAILED = 7002,
  NETWORK_DNS_FAILED = 7003,

  // General Errors (9xxx)
  UNKNOWN = 9999,
}

// ============================================================================
// Error Severity
// ============================================================================

export enum ErrorSeverity {
  /** Informational - operation continued */
  INFO = 'info',
  /** Warning - operation completed with issues */
  WARNING = 'warning',
  /** Error - operation failed but may be recoverable */
  ERROR = 'error',
  /** Critical - operation failed, requires intervention */
  CRITICAL = 'critical',
}

// ============================================================================
// Base Error Class
// ============================================================================

export interface ErrorContext {
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Severity level */
  severity: ErrorSeverity;
  /** Original error if wrapped */
  cause?: Error;
  /** Additional context for debugging */
  details?: Record<string, unknown>;
  /** Suggestions for recovery */
  suggestions?: string[];
  /** Whether this error is recoverable */
  recoverable: boolean;
  /** Timestamp when error occurred */
  timestamp: string;
}

export class ScenarioError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly cause?: Error;
  public readonly details: Record<string, unknown>;
  public readonly suggestions: string[];
  public readonly recoverable: boolean;
  public readonly timestamp: string;

  constructor(context: Partial<ErrorContext> & { code: ErrorCode; message: string }) {
    super(context.message);
    this.name = 'ScenarioError';
    this.code = context.code;
    this.severity = context.severity ?? ErrorSeverity.ERROR;
    this.cause = context.cause;
    this.details = context.details ?? {};
    this.suggestions = context.suggestions ?? [];
    this.recoverable = context.recoverable ?? false;
    this.timestamp = context.timestamp ?? new Date().toISOString();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ScenarioError);
    }
  }

  /** Get a user-friendly error description */
  getUserMessage(): string {
    let msg = this.message;
    if (this.suggestions.length > 0) {
      msg += '\n\nSuggestions:\n' + this.suggestions.map(s => `  • ${s}`).join('\n');
    }
    return msg;
  }

  /** Get full error context for logging */
  toContext(): ErrorContext {
    return {
      code: this.code,
      message: this.message,
      severity: this.severity,
      cause: this.cause,
      details: this.details,
      suggestions: this.suggestions,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
    };
  }

  /** Serialize for JSON logging */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      codeLabel: ErrorCode[this.code],
      message: this.message,
      severity: this.severity,
      details: this.details,
      suggestions: this.suggestions,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

// ============================================================================
// Specialized Error Classes
// ============================================================================

export class ParseError extends ScenarioError {
  constructor(message: string, options?: {
    code?: ErrorCode;
    cause?: Error;
    filePath?: string;
    line?: number;
    column?: number;
    suggestions?: string[];
  }) {
    super({
      code: options?.code ?? ErrorCode.PARSE_INVALID_YAML,
      message,
      severity: ErrorSeverity.ERROR,
      cause: options?.cause,
      details: {
        filePath: options?.filePath,
        line: options?.line,
        column: options?.column,
      },
      suggestions: options?.suggestions ?? [
        'Check YAML syntax for errors',
        'Ensure all required fields are present',
        'Run `scenario-runner validate <file>` for details',
      ],
      recoverable: false,
    });
    this.name = 'ParseError';
  }
}

export class ValidationError extends ScenarioError {
  constructor(message: string, options?: {
    code?: ErrorCode;
    field?: string;
    value?: unknown;
    expected?: string;
    suggestions?: string[];
  }) {
    super({
      code: options?.code ?? ErrorCode.VALIDATE_STEP_INVALID,
      message,
      severity: ErrorSeverity.ERROR,
      details: {
        field: options?.field,
        value: options?.value,
        expected: options?.expected,
      },
      suggestions: options?.suggestions ?? [
        'Check the scenario schema documentation',
        'Ensure field values match expected types',
      ],
      recoverable: false,
    });
    this.name = 'ValidationError';
  }
}

export class RunnerError extends ScenarioError {
  constructor(message: string, options?: {
    code?: ErrorCode;
    cause?: Error;
    stepId?: string;
    screenshot?: string;
    suggestions?: string[];
    recoverable?: boolean;
  }) {
    super({
      code: options?.code ?? ErrorCode.RUNNER_STEP_FAILED,
      message,
      severity: ErrorSeverity.ERROR,
      cause: options?.cause,
      details: {
        stepId: options?.stepId,
        screenshot: options?.screenshot,
      },
      suggestions: options?.suggestions ?? [
        'Check VS Code is running correctly',
        'Verify the UI element exists',
        'Try running with --video for debugging',
      ],
      recoverable: options?.recoverable ?? false,
    });
    this.name = 'RunnerError';
  }
}

export class AuthError extends ScenarioError {
  constructor(message: string, options?: {
    code?: ErrorCode;
    provider?: string;
    suggestions?: string[];
  }) {
    super({
      code: options?.code ?? ErrorCode.AUTH_NOT_CONFIGURED,
      message,
      severity: ErrorSeverity.ERROR,
      details: {
        provider: options?.provider,
      },
      suggestions: options?.suggestions ?? [
        'Run `scenario-runner auth login` to authenticate',
        'Check your credentials are valid',
        'Ensure required scopes are granted',
      ],
      recoverable: true,
    });
    this.name = 'AuthError';
  }
}

export class NetworkError extends ScenarioError {
  constructor(message: string, options?: {
    code?: ErrorCode;
    url?: string;
    cause?: Error;
    suggestions?: string[];
  }) {
    super({
      code: options?.code ?? ErrorCode.NETWORK_CONNECTION_FAILED,
      message,
      severity: ErrorSeverity.ERROR,
      cause: options?.cause,
      details: {
        url: options?.url,
      },
      suggestions: options?.suggestions ?? [
        'Check your internet connection',
        'Verify the URL is correct',
        'Try again later if the service is temporarily unavailable',
      ],
      recoverable: true,
    });
    this.name = 'NetworkError';
  }
}

export class EvaluatorError extends ScenarioError {
  constructor(message: string, options?: {
    code?: ErrorCode;
    cause?: Error;
    model?: string;
    suggestions?: string[];
  }) {
    super({
      code: options?.code ?? ErrorCode.EVAL_API_ERROR,
      message,
      severity: ErrorSeverity.ERROR,
      cause: options?.cause,
      details: {
        model: options?.model,
      },
      suggestions: options?.suggestions ?? [
        'Check your OPENAI_API_KEY is set correctly',
        'Verify you have sufficient API credits',
        'Try again if rate limited',
      ],
      recoverable: true,
    });
    this.name = 'EvaluatorError';
  }
}

// ============================================================================
// Error Factory
// ============================================================================

export const Errors = {
  // Parser errors
  invalidYaml: (cause: Error, filePath?: string) => 
    new ParseError(`Invalid YAML syntax: ${cause.message}`, {
      code: ErrorCode.PARSE_INVALID_YAML,
      cause,
      filePath,
    }),

  invalidSchema: (errors: string[], filePath?: string) =>
    new ParseError(`Schema validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`, {
      code: ErrorCode.PARSE_INVALID_SCHEMA,
      filePath,
    }),

  fileNotFound: (filePath: string) =>
    new ParseError(`File not found: ${filePath}`, {
      code: ErrorCode.PARSE_FILE_NOT_FOUND,
      filePath,
      suggestions: [
        'Check the file path is correct',
        'Ensure the file exists',
        `Try: ls ${filePath}`,
      ],
    }),

  // Runner errors
  vscodeNotFound: () =>
    new RunnerError('VS Code executable not found', {
      code: ErrorCode.RUNNER_VSCODE_NOT_FOUND,
      suggestions: [
        'Install VS Code from https://code.visualstudio.com',
        'Add VS Code to your PATH',
        'Specify --vscode-path if installed in a custom location',
      ],
    }),

  vscodeLaunchFailed: (cause: Error) =>
    new RunnerError(`Failed to launch VS Code: ${cause.message}`, {
      code: ErrorCode.RUNNER_VSCODE_LAUNCH_FAILED,
      cause,
      suggestions: [
        'Try closing other VS Code instances',
        'Check system resources (memory, disk space)',
        'Run with --fresh-profile for a clean environment',
      ],
    }),

  elementNotFound: (selector: string, stepId: string) =>
    new RunnerError(`Element not found: ${selector}`, {
      code: ErrorCode.RUNNER_ELEMENT_NOT_FOUND,
      stepId,
      suggestions: [
        'Verify the selector is correct',
        'The element may take time to appear - increase timeout',
        'The UI may have changed - update the scenario',
      ],
      recoverable: true,
    }),

  stepTimeout: (stepId: string, timeout: number) =>
    new RunnerError(`Step timed out after ${timeout}ms`, {
      code: ErrorCode.RUNNER_STEP_TIMEOUT,
      stepId,
      suggestions: [
        'Increase the step timeout',
        'Check if the step action is completing',
        'Run with --video to see what happened',
      ],
      recoverable: true,
    }),

  // Auth errors
  noAuth: () =>
    new AuthError('Authentication not configured', {
      code: ErrorCode.AUTH_NOT_CONFIGURED,
    }),

  authExpired: () =>
    new AuthError('Authentication has expired', {
      code: ErrorCode.AUTH_EXPIRED,
      suggestions: [
        'Run `scenario-runner auth login` to re-authenticate',
      ],
    }),

  // Evaluator errors
  noApiKey: () =>
    new EvaluatorError('OpenAI API key not configured', {
      code: ErrorCode.EVAL_NO_API_KEY,
      suggestions: [
        'Set OPENAI_API_KEY environment variable',
        'Add to .env file: OPENAI_API_KEY=sk-...',
      ],
    }),

  rateLimited: () =>
    new EvaluatorError('API rate limit exceeded', {
      code: ErrorCode.EVAL_RATE_LIMITED,
      suggestions: [
        'Wait a few minutes and try again',
        'Reduce concurrent scenario runs',
        'Upgrade your OpenAI plan for higher limits',
      ],
    }),

  // Network errors
  networkTimeout: (url: string) =>
    new NetworkError(`Request timed out: ${url}`, {
      code: ErrorCode.NETWORK_TIMEOUT,
      url,
    }),

  connectionFailed: (url: string, cause: Error) =>
    new NetworkError(`Connection failed: ${url}`, {
      code: ErrorCode.NETWORK_CONNECTION_FAILED,
      url,
      cause,
    }),
};

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Wrap an unknown error in a ScenarioError
 */
export function wrapError(error: unknown, context?: string): ScenarioError {
  if (error instanceof ScenarioError) {
    return error;
  }

  const message = error instanceof Error 
    ? error.message 
    : String(error);

  return new ScenarioError({
    code: ErrorCode.UNKNOWN,
    message: context ? `${context}: ${message}` : message,
    cause: error instanceof Error ? error : undefined,
    severity: ErrorSeverity.ERROR,
    recoverable: false,
  });
}

/**
 * Check if an error is of a specific type
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof ScenarioError && error.code === code;
}

/**
 * Check if an error is recoverable
 */
export function isRecoverable(error: unknown): boolean {
  return error instanceof ScenarioError && error.recoverable;
}

/**
 * Format error for console output
 */
export function formatError(error: ScenarioError): string {
  const lines: string[] = [];
  
  const icon = {
    [ErrorSeverity.INFO]: 'ℹ️',
    [ErrorSeverity.WARNING]: '⚠️',
    [ErrorSeverity.ERROR]: '❌',
    [ErrorSeverity.CRITICAL]: '🚨',
  }[error.severity];

  lines.push(`${icon} ${error.name} [${ErrorCode[error.code]}]`);
  lines.push(`   ${error.message}`);

  if (Object.keys(error.details).length > 0) {
    lines.push('');
    lines.push('   Details:');
    for (const [key, value] of Object.entries(error.details)) {
      if (value !== undefined) {
        lines.push(`     ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  if (error.suggestions.length > 0) {
    lines.push('');
    lines.push('   Suggestions:');
    for (const suggestion of error.suggestions) {
      lines.push(`     • ${suggestion}`);
    }
  }

  return lines.join('\n');
}
