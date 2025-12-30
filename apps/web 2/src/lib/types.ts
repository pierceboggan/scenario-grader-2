// Local type definitions for the web app (browser-safe)

export type Priority = 'P0' | 'P1' | 'P2';
export type VSCodeTarget = 'desktop' | 'web';
export type VSCodeVersion = 'stable' | 'insiders' | 'exploration';
export type Platform = 'macOS' | 'windows' | 'linux';
export type CopilotChannel = 'stable' | 'prerelease' | 'nightly';

export interface Environment {
  vscodeTarget: VSCodeTarget;
  vscodeVersion: VSCodeVersion;
  platform: Platform;
  workspacePath?: string;
  copilotChannel: CopilotChannel;
}

export interface Hint {
  type: 'click' | 'type' | 'wait' | 'keyboard' | 'hover';
  target?: string;
  value?: string;
  timeout?: number;
}

export interface Step {
  id: string;
  description: string;
  action: string;
  args?: Record<string, any>;
  hints?: Hint[];
  timeout?: number;
  optional: boolean;
}

export type AssertionType =
  | 'accountEquals'
  | 'elementVisible'
  | 'elementNotVisible'
  | 'textContains'
  | 'textEquals'
  | 'fileExists'
  | 'configEquals'
  | 'llmGrade'
  | 'custom';

export interface Assertion {
  id: string;
  type: AssertionType;
  target?: string;
  provider?: string;
  expected?: any;
  rubricId?: string;
  required: boolean;
  description?: string;
}

export interface ScreenshotConfig {
  atStep: string;
  name?: string;
}

export interface Outputs {
  captureVideo: boolean;
  screenshots?: ScreenshotConfig[];
  storeChatTranscript: boolean;
  storeLogs: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  owner: string;
  tags: string[];
  description: string;
  priority: Priority;
  environment: Environment;
  preconditions: string[];
  steps: Step[];
  assertions: Assertion[];
  outputs?: Outputs;
}

export type RunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'cancelled' | 'error';
export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface StepResult {
  stepId: string;
  status: StepStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  error?: string;
  screenshot?: string;
  logs: string[];
}

export interface AssertionResult {
  assertionId: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  error?: string;
}

export interface EvaluationDimension {
  id: string;
  name: string;
  score: number;
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
  rawResponse?: string;
}

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
}

export interface RunConfig {
  scenarioId: string;
  vscodeVersion?: VSCodeVersion;
  profileName?: string;
  workspacePath?: string;
  resetSandbox: boolean;
  captureArtifacts: boolean;
  enableLLMGrading: boolean;
  timeout?: number;
  freshProfile?: boolean;
}

export type RunEventType =
  | 'run:start'
  | 'run:complete'
  | 'step:start'
  | 'step:complete'
  | 'assertion:start'
  | 'assertion:complete'
  | 'evaluation:start'
  | 'evaluation:complete'
  | 'log'
  | 'screenshot'
  | 'error';

export interface RunEvent {
  type: RunEventType;
  timestamp: string;
  data: any;
}

export interface GitHubIssue {
  title: string;
  body: string;
  labels: string[];
  assignees?: string[];
}
