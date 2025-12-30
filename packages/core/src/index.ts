// Types
export * from './types';

// Parser & Validation
export { parseScenarioYAML, parseScenarioFile, scenarioToYAML, validateScenario, patchScenario } from './parser';

// Natural Language Compiler
export { compileNaturalLanguage, generateScenarioDiff } from './compiler';

// Scenario Runner
export { runScenario, resetSandbox, cleanupRun, type RunEvent, type RunEventHandler, type RunEventType } from './runner';

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
