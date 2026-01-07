import { z } from 'zod';

// ============================================================================
// Core Scenario Types
// ============================================================================

export const PrioritySchema = z.enum(['P0', 'P1', 'P2']);
export type Priority = z.infer<typeof PrioritySchema>;

export const VSCodeTargetSchema = z.enum(['desktop', 'web']);
export type VSCodeTarget = z.infer<typeof VSCodeTargetSchema>;

export const VSCodeVersionSchema = z.enum(['stable', 'insiders', 'exploration']);
export type VSCodeVersion = z.infer<typeof VSCodeVersionSchema>;

export const PlatformSchema = z.enum(['macOS', 'windows', 'linux']);
export type Platform = z.infer<typeof PlatformSchema>;

export const CopilotChannelSchema = z.enum(['stable', 'prerelease', 'nightly']);
export type CopilotChannel = z.infer<typeof CopilotChannelSchema>;

// Environment Configuration (simplified - uses current user's auth)
export const EnvironmentSchema = z.object({
  vscodeTarget: VSCodeTargetSchema.default('desktop'),
  vscodeVersion: VSCodeVersionSchema.default('stable'),
  platform: PlatformSchema.default('macOS'),
  workspacePath: z.string().optional(),
  copilotChannel: CopilotChannelSchema.default('stable'),
  // Repository-based workspace configuration
  repository: z.object({
    /** Git repository URL (HTTPS or SSH) */
    url: z.string(),
    /** Branch, tag, or commit to checkout */
    ref: z.string().optional(),
    /** Subdirectory to open as workspace (relative to repo root) */
    subdir: z.string().optional(),
    /** Commands to run after cloning (e.g., npm install) */
    setupCommands: z.array(z.string()).optional(),
    /** Use sparse checkout for large repos */
    sparse: z.boolean().optional(),
    /** Paths to include in sparse checkout */
    sparsePaths: z.array(z.string()).optional(),
  }).optional(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

// Step Hint Types
export const HintTypeSchema = z.enum(['click', 'type', 'wait', 'keyboard', 'hover']);
export type HintType = z.infer<typeof HintTypeSchema>;

export const HintSchema = z.object({
  type: HintTypeSchema,
  target: z.string().optional(),
  value: z.string().optional(),
  timeout: z.number().optional(),
});
export type Hint = z.infer<typeof HintSchema>;

// Step-level observation - a question to answer at a specific step
export const StepObservationSchema = z.object({
  question: z.string(),
  category: z.enum(['usability', 'performance', 'clarity', 'friction']).optional(),
});
export type StepObservation = z.infer<typeof StepObservationSchema>;

// Step Definition
export const StepSchema = z.object({
  id: z.string(),
  description: z.string(),
  action: z.string(),
  args: z.record(z.any()).optional(),
  hints: z.array(HintSchema).optional(),
  timeout: z.number().optional(),
  optional: z.boolean().default(false),
  // Observations specific to this step
  observations: z.array(StepObservationSchema).optional(),
});
export type Step = z.infer<typeof StepSchema>;

// Checkpoint Types (optional validation points during a journey)
export const CheckpointTypeSchema = z.enum([
  'elementVisible',
  'elementNotVisible',
  'textContains',
  'textEquals',
  'fileExists',
  'configEquals',
  'custom',
]);
export type CheckpointType = z.infer<typeof CheckpointTypeSchema>;

export const CheckpointSchema = z.object({
  id: z.string(),
  type: CheckpointTypeSchema,
  target: z.string().optional(),
  expected: z.any().optional(),
  description: z.string().optional(),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

// Observation - questions to answer about the user experience
export const ObservationSchema = z.object({
  id: z.string().optional(),
  question: z.string(),
  category: z.enum(['usability', 'performance', 'clarity', 'friction', 'terminology']).optional(),
});
export type Observation = z.infer<typeof ObservationSchema>;

// Terminology check - compare UI strings against documentation
export const TerminologyCheckSchema = z.object({
  id: z.string().optional(),
  uiElement: z.string().describe('Selector or description of UI element to check'),
  expectedTerms: z.array(z.string()).describe('Terms that should appear based on docs'),
  docSource: z.string().optional().describe('URL or path to documentation source'),
});
export type TerminologyCheck = z.infer<typeof TerminologyCheckSchema>;

// Documentation verification - verify UI matches public documentation
export const DocumentationCheckSchema = z.object({
  id: z.string(),
  /** URL of the documentation page to fetch */
  docUrl: z.string().url(),
  /** What aspect to verify (used in LLM prompt) */
  verifyAspect: z.string().describe('What to verify, e.g., "button labels", "menu structure", "terminology"'),
  /** Specific questions for the LLM to answer about doc/UI consistency */
  questions: z.array(z.string()).optional(),
  /** Description of what this check verifies */
  description: z.string().optional(),
});
export type DocumentationCheck = z.infer<typeof DocumentationCheckSchema>;

// Legacy Assertion Types (deprecated - use Checkpoint instead)
export const AssertionTypeSchema = CheckpointTypeSchema;
export type AssertionType = CheckpointType;
export const AssertionSchema = CheckpointSchema;
export type Assertion = Checkpoint;

// Screenshot Configuration
export const ScreenshotConfigSchema = z.object({
  atStep: z.string(),
  name: z.string().optional(),
});
export type ScreenshotConfig = z.infer<typeof ScreenshotConfigSchema>;

// Output Configuration
export const OutputsSchema = z.object({
  captureVideo: z.boolean().default(false),
  screenshots: z.array(ScreenshotConfigSchema).optional(),
  storeChatTranscript: z.boolean().default(false),
  storeLogs: z.boolean().default(true),
});
export type Outputs = z.infer<typeof OutputsSchema>;

// ============================================================================
// Orchestrated Scenario Types (for complex, long-running scenarios)
// ============================================================================

/** Condition to wait for during orchestration */
export const WaitConditionSchema = z.object({
  /** Type of condition to wait for */
  type: z.enum([
    'element',           // Wait for UI element
    'text',             // Wait for text to appear
    'notification',     // Wait for VS Code notification
    'file',             // Wait for file to exist
    'gitStatus',        // Wait for git status change
    'prStatus',         // Wait for PR to be created/merged
    'agentComplete',    // Wait for background agent to complete
    'timeout',          // Just wait for a duration
    'manual',           // Wait for manual confirmation
  ]),
  /** Target selector or identifier */
  target: z.string().optional(),
  /** Expected value or pattern */
  expected: z.string().optional(),
  /** Maximum time to wait in milliseconds */
  timeout: z.number().default(300000), // 5 min default
  /** Interval between checks in milliseconds */
  pollInterval: z.number().default(5000), // 5 sec default
  /** Description of what we're waiting for */
  description: z.string().optional(),
});
export type WaitCondition = z.infer<typeof WaitConditionSchema>;

/** A milestone in an orchestrated scenario */
export const MilestoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  /** Steps to execute for this milestone */
  steps: z.array(StepSchema),
  /** Conditions to wait for after steps complete */
  waitFor: z.array(WaitConditionSchema).optional(),
  /** Screenshot to take at this milestone */
  screenshot: z.boolean().default(true),
  /** Timeout for this entire milestone */
  timeout: z.number().optional(),
  /** Can this milestone run in parallel with others? */
  parallel: z.boolean().default(false),
  /** Milestones that must complete before this one */
  dependsOn: z.array(z.string()).optional(),
  /** Whether failure of this milestone should stop the scenario */
  critical: z.boolean().default(true),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

/** Session configuration for multi-instance scenarios */
export const SessionConfigSchema = z.object({
  id: z.string(),
  /** Workspace to open in this session */
  workspacePath: z.string().optional(),
  /** Repository to clone for this session */
  repository: EnvironmentSchema.shape.repository.optional(),
  /** Whether this session should use a fresh profile */
  freshProfile: z.boolean().default(true),
  /** VS Code version for this session */
  vscodeVersion: VSCodeVersionSchema.optional(),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

/** Configuration for orchestrated scenarios */
export const OrchestratedScenarioConfigSchema = z.object({
  /** Enable orchestration mode */
  enabled: z.boolean().default(false),
  /** Maximum total runtime for the scenario */
  totalTimeout: z.number().default(1800000), // 30 min default
  /** Milestones to achieve (replaces steps when orchestration enabled) */
  milestones: z.array(MilestoneSchema).optional(),
  /** Multiple VS Code sessions to manage */
  sessions: z.array(SessionConfigSchema).optional(),
  /** Checkpoint save interval (for resumability) */
  checkpointInterval: z.number().default(60000), // 1 min
  /** Path to save/restore checkpoint state */
  checkpointPath: z.string().optional(),
  /** Strategy when a non-critical milestone fails */
  failureStrategy: z.enum(['continue', 'retry', 'skip', 'abort']).default('continue'),
  /** Number of retries for failed milestones */
  maxRetries: z.number().default(2),
});
export type OrchestratedScenarioConfig = z.infer<typeof OrchestratedScenarioConfigSchema>;

// ============================================================================
// Telemetry Validation Types
// ============================================================================

/** Expected telemetry event to capture */
export const TelemetryExpectationSchema = z.object({
  /** Event name to look for */
  event: z.string(),
  /** Optional: properties that must be present */
  properties: z.record(z.any()).optional(),
  /** Optional: step during which this event should fire */
  duringStep: z.string().optional(),
  /** Whether this event is required or optional */
  required: z.boolean().default(true),
  /** Timeout to wait for event (ms) */
  timeout: z.number().default(10000),
});
export type TelemetryExpectation = z.infer<typeof TelemetryExpectationSchema>;

/** Telemetry validation configuration */
export const TelemetryConfigSchema = z.object({
  /** Enable telemetry capture */
  enabled: z.boolean().default(false),
  /** Expected events to verify */
  expectedEvents: z.array(TelemetryExpectationSchema),
  /** Capture all events (not just expected ones) for debugging */
  captureAll: z.boolean().default(false),
  /** Fail scenario if required events are missing */
  failOnMissing: z.boolean().default(true),
});
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

// ============================================================================
// Error Recovery Testing Types
// ============================================================================

/** Types of errors that can be injected */
export const ErrorInjectionTypeSchema = z.enum([
  'networkTimeout',
  'networkError', 
  'apiRateLimit',
  'apiError',
  'extensionCrash',
  'authExpired',
  'diskFull',
  'permissionDenied',
]);
export type ErrorInjectionType = z.infer<typeof ErrorInjectionTypeSchema>;

/** Expected recovery behaviors */
export const RecoveryBehaviorSchema = z.enum([
  'errorMessageShown',
  'retryBehavior',
  'fallbackUsed',
  'gracefulDegradation',
  'reconnectAttempt',
  'userPrompted',
  'operationCancelled',
  'statePreserved',
]);
export type RecoveryBehavior = z.infer<typeof RecoveryBehaviorSchema>;

/** Error injection scenario */
export const ErrorScenarioSchema = z.object({
  id: z.string(),
  /** Type of error to inject */
  inject: ErrorInjectionTypeSchema,
  /** Step or action during which to inject */
  duringStep: z.string().optional(),
  /** Action type to intercept */
  duringAction: z.string().optional(),
  /** Expected recovery behavior(s) */
  expectRecovery: z.array(RecoveryBehaviorSchema),
  /** Timeout to verify recovery (ms) */
  recoveryTimeout: z.number().default(30000),
  /** Description of what we're testing */
  description: z.string().optional(),
});
export type ErrorScenario = z.infer<typeof ErrorScenarioSchema>;

/** Error recovery testing configuration */
export const ErrorRecoveryConfigSchema = z.object({
  /** Enable error injection testing */
  enabled: z.boolean().default(false),
  /** Error scenarios to test */
  scenarios: z.array(ErrorScenarioSchema),
  /** Run each error scenario in isolation */
  isolateScenarios: z.boolean().default(true),
});
export type ErrorRecoveryConfig = z.infer<typeof ErrorRecoveryConfigSchema>;

// Complete Scenario Definition
export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priority: PrioritySchema,
  version: z.string().optional(),
  author: z.string().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).optional(),
  environment: EnvironmentSchema.optional(),
  preconditions: z.array(z.string()).optional(),
  steps: z.array(StepSchema),
  // New: optional checkpoints for validation
  checkpoints: z.array(CheckpointSchema).optional(),
  // New: observations to capture about UX
  observations: z.array(ObservationSchema).optional(),
  // New: terminology checks to compare UI against docs
  terminologyChecks: z.array(TerminologyCheckSchema).optional(),
  // New: documentation checks to verify UI matches public docs
  documentationChecks: z.array(DocumentationCheckSchema).optional(),
  // Legacy: assertions (deprecated, use checkpoints)
  assertions: z.array(AssertionSchema).optional(),
  outputs: OutputsSchema.optional(),
  // Orchestration config for complex, long-running scenarios
  orchestration: OrchestratedScenarioConfigSchema.optional(),
  // Telemetry validation
  telemetry: TelemetryConfigSchema.optional(),
  // Error recovery testing
  errorRecovery: ErrorRecoveryConfigSchema.optional(),
  // Feature discovery tracking
  featureDiscovery: z.lazy(() => z.object({
    enabled: z.boolean().default(false),
    features: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      critical: z.boolean().default(false),
      entryPoints: z.array(z.object({
        type: z.enum(['keyboard', 'menu', 'context-menu', 'command-palette', 'button', 'notification', 'quick-action', 'welcome', 'walkthrough']),
        identifier: z.string(),
        label: z.string().optional(),
        selector: z.string().optional(),
        shortcut: z.string().optional(),
      })),
      preferredEntryPoint: z.string().optional(),
    })),
    trackAllInteractions: z.boolean().default(false),
    captureScreenshots: z.boolean().default(false),
  })).optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

// ============================================================================
// Run Status Types
// ============================================================================

export type RunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'skipped';

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export type AssertionStatus = 'pending' | 'passed' | 'failed';

export type CheckpointStatus = AssertionStatus;

// ============================================================================
// Result Types
// ============================================================================

export interface StepResult {
  stepId: string;
  status: StepStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  error?: string;
  screenshot?: string;
  logs?: string[];
}

export interface AssertionResult {
  assertionId: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  error?: string;
}

export interface CheckpointResult {
  checkpointId: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  note?: string;
}

export interface ObservationResult {
  observationId: string;
  stepId?: string;
  question: string;
  answer: string;
  category?: string;
}

export interface TerminologyResult {
  checkId: string;
  uiElement: string;
  expectedTerms: string[];
  actualText: string;
  matches: boolean;
  missingTerms: string[];
  docSource?: string;
}

/** Result of a documentation verification check */
export interface DocumentationCheckResult {
  checkId: string;
  docUrl: string;
  docFetched: boolean;
  docContent?: string;
  /** LLM's assessment of whether UI matches docs */
  matches: boolean;
  /** Confidence score 0-100 */
  confidence: number;
  /** LLM's explanation */
  explanation: string;
  /** Specific discrepancies found */
  discrepancies: string[];
  /** Suggestions for fixing mismatches */
  suggestions: string[];
  error?: string;
}

/** Result of a milestone in an orchestrated scenario */
export interface MilestoneResult {
  milestoneId: string;
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'waiting';
  startTime?: string;
  endTime?: string;
  duration?: number;
  stepResults: StepResult[];
  waitResults?: Array<{
    conditionType: string;
    target?: string;
    passed: boolean;
    waitTime: number;
    error?: string;
  }>;
  screenshot?: string;
  error?: string;
  retryCount?: number;
}

/** Captured telemetry event */
export interface CapturedTelemetryEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
  stepId?: string;
}

/** Result of telemetry validation */
export interface TelemetryValidationResult {
  enabled: boolean;
  capturedEvents: CapturedTelemetryEvent[];
  expectedResults: Array<{
    event: string;
    expected: boolean;
    found: boolean;
    matchedEvent?: CapturedTelemetryEvent;
    error?: string;
  }>;
  passed: boolean;
  missingEvents: string[];
  unexpectedEvents: string[];
}

/** Result of an error recovery test */
export interface ErrorRecoveryResult {
  scenarioId: string;
  injectedError: string;
  recoveryBehaviors: Array<{
    behavior: string;
    observed: boolean;
    evidence?: string;
  }>;
  passed: boolean;
  recoveryTime?: number;
  screenshot?: string;
  error?: string;
}

// ============================================================================
// LLM Evaluation Types
// ============================================================================

export interface EvaluationDimension {
  id?: string;
  name: string;
  score: number;
  maxScore?: number;
  feedback: string;
}

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  labels: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface LLMEvaluation {
  overallScore: number;
  dimensions: EvaluationDimension[];
  suggestions: Suggestion[];
  // Structured observation answers
  observations?: ObservationResult[];
  // Terminology check results
  terminologyResults?: TerminologyResult[];
  // Documentation check results
  documentationResults?: DocumentationCheckResult[];
  rawResponse?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  field?: string;
  stepId?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// Known/supported actions for validation
export const KNOWN_ACTIONS = [
  'launchVSCodeWithProfile',
  'openCommandPalette',
  'openCopilotChat',
  'openInlineChat',
  'sendChatMessage',
  'typeText',
  'pressKey',
  'wait',
  'clickElement',
  'selectFromList',
  'selectFromDropdown',
  'createFile',
  'selectAll',
  'openFile',
  'openSettings',
  'acceptSuggestion',
  'setBreakpoint',
  'runTerminalCommand',
  'hover',
  'githubLogin',
  'signInWithGitHub',
  // Semantic actions (high-level)
  'clickModelPicker',
  'selectModel',
  'openExtensionsPanel',
  'searchExtensions',
  'installExtension',
  'openAgentMode',
  'startBackgroundAgent',
] as const;

export type KnownAction = typeof KNOWN_ACTIONS[number];

// ============================================================================
// Run Report Types
// ============================================================================

export interface RunArtifacts {
  screenshots: string[];
  video?: string;
  logs: string;
  chatTranscript?: string;
}

export interface RunReport {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: RunStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  environment: Environment;
  steps: StepResult[];
  assertions: AssertionResult[];
  llmEvaluation?: LLMEvaluation;
  artifacts: RunArtifacts;
  error?: string;
  // Comparison data if run with --compare
  comparisonBaseline?: string;
  // Documentation verification results
  documentationChecks?: DocumentationCheckResult[];
  // Milestone results for orchestrated scenarios
  milestones?: MilestoneResult[];
  // Workspace setup info
  workspaceSetup?: {
    repositoryUrl?: string;
    ref?: string;
    clonePath?: string;
    setupCommandsRun?: boolean;
    setupDuration?: number;
  };
  // Telemetry validation results
  telemetryValidation?: TelemetryValidationResult;
  // Error recovery test results
  errorRecoveryResults?: ErrorRecoveryResult[];
}

// ============================================================================
// Authentication Configuration
// ============================================================================

/**
 * GitHub authentication credentials for first-run scenarios.
 * Loaded from environment variables:
 *   - SCENARIO_GITHUB_EMAIL
 *   - SCENARIO_GITHUB_PASSWORD
 */
export interface AuthConfig {
  /** GitHub account email for login */
  email?: string;
  /** GitHub account password */
  password?: string;
}

// ============================================================================
// Run Configuration
// ============================================================================

export interface RunConfig {
  scenarioId: string;
  vscodeVersion?: VSCodeVersion;
  profileName?: string;
  workspacePath?: string;
  resetSandbox: boolean;
  captureArtifacts: boolean;
  enableLLMGrading: boolean;
  timeout?: number;
  /** Use fresh VS Code profile with isolated user-data and extensions (default: false) */
  freshProfile?: boolean;
  /** Record video of the scenario run (default: false) */
  recordVideo?: boolean;
  /** GitHub authentication config for fresh profile scenarios */
  auth?: AuthConfig;
  /** Preferred screenshot capture method (default: 'electron') */
  screenshotMethod?: ScreenshotMethod;
}

// Screenshot capture method preference
export type ScreenshotMethod = 'electron' | 'os' | 'playwright';

// ============================================================================
// GitHub Issue Types
// ============================================================================

export interface GitHubIssue {
  title: string;
  body: string;
  labels: string[];
  assignees?: string[];
}

export interface GitHubIssueCreationResult {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}
