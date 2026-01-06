// Types
export * from './types';

// Parser & Schema Validation
export { 
  parseScenarioYAML, 
  parseScenarioFile, 
  scenarioToYAML, 
  validateScenario, 
  patchScenario,
  looksLikeScenario,
  ScenarioParseError,
  type ParseErrorCode,
  type ParseErrorDetail,
  type ValidationResult,
} from './parser';

// Semantic Validation
export {
  validateScenarioSemantics,
  formatValidationResult,
  type ExtendedValidationResult,
} from './validator';

// Natural Language Compiler
export { compileNaturalLanguage, generateScenarioDiff } from './compiler';

// Scenario Runner
export { 
  runScenario, 
  resetSandbox, 
  cleanupRun, 
  RunnerError,
  type RunnerErrorCode,
  type RetryConfig,
  type RunEvent, 
  type RunEventHandler, 
  type RunEventType,
} from './runner';

// Scenario Recorder
export {
  startRecording,
  stopRecording,
  takeRecordingScreenshot,
  interactiveRecord,
  record,
  actionsToSteps,
  detectKeyboardAction,
  KEYBOARD_ACTION_MAP,
  RecorderError,
  type RecorderErrorCode,
  type RecordedAction,
  type RecorderConfig,
  type RecorderContext,
  type RecorderEvent,
  type RecorderEventHandler,
  type RecorderEventType,
} from './recorder';

// LLM Evaluator
export { 
  evaluateScenarioRun, 
  generateEvaluationPrompt, 
  getEvaluationDimensions,
  type EvaluatorConfig 
} from './evaluator';

// GitHub Integration
export {
  generateIssueFromSuggestion,
  generateIssueFromFailure,
  createGitHubIssue,
  formatIssuePreview,
} from './github';

// Sample Scenarios
export { SAMPLE_SCENARIOS, getSampleScenario, getAllSampleScenarios } from './samples';

// Handoff & Gap Analysis
export {
  generateScenarioPrompt,
  generateImplementationPrompt,
  generateGapReport,
  formatGapReport,
  compareIterations,
  type NaturalLanguageScenario,
  type GapReport,
  type GapReportItem,
  type IterationRecord,
} from './handoff';
