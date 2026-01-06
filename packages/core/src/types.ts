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
  // Legacy: assertions (deprecated, use checkpoints)
  assertions: z.array(AssertionSchema).optional(),
  outputs: OutputsSchema.optional(),
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
