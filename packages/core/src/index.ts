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

// Authentication (Device Code Flow)
export {
  authenticateWithDeviceFlow,
  startDeviceFlow,
  pollForToken,
  getGitHubUser,
  saveAuth,
  loadAuth,
  hasValidAuth,
  clearAuth,
  getAuthStatus,
  verifyAuth,
  setupVSCodeAuth,
  generateVSCodeGitHubAuth,
  type StoredAuth,
} from './auth';

// Workspace Setup (Repository Cloning)
export {
  setupWorkspace,
  cleanupWorkspace,
  listCachedWorkspaces,
  pruneWorkspaces,
  type WorkspaceSetupResult,
} from './workspace';

// Documentation Verification
export {
  runDocumentationChecks,
  verifyDocumentationWithLLM,
  generateDocVerificationPrompt,
  generateDocSyncReport,
} from './documentation';

// Telemetry Validation
export {
  TelemetryCollector,
  generateTelemetryReport,
} from './telemetry';

// Error Recovery Testing
export {
  ErrorInjector,
  runErrorRecoveryTests,
  verifyRecoveryBehavior,
  generateErrorRecoveryReport,
} from './error-recovery';

// Scenario Generator (from recordings)
export {
  generateScenarioFromRecording,
  generateScenarioYAML,
  interactiveAnnotation,
  combineSemanticActions,
  detectSemanticAction,
  type RawAction,
  type GeneratorConfig,
} from './scenario-generator';

// Feature Discovery Tracking
export {
  FeatureDiscoveryTracker,
  generateFeatureDiscoveryReport,
  COPILOT_FEATURES,
  type FeatureDefinition,
  type FeatureDiscoveryConfig,
  type FeatureDiscoveryEvent,
  type FeatureDiscoveryResult,
  type MissedFeature,
  type EntryPoint,
} from './feature-discovery';

// Structured Error Handling
export {
  ScenarioError,
  ParseError,
  ValidationError,
  RunnerError as StructuredRunnerError,
  AuthError,
  NetworkError,
  EvaluatorError,
  ErrorCode,
  ErrorSeverity,
  Errors,
  wrapError,
  isErrorCode,
  isRecoverable,
  formatError,
} from './errors';

// Orchestrated Scenarios (Long-running, Multi-session)
export {
  runOrchestratedScenario,
  isOrchestratedScenario,
} from './orchestrator';

// Step Utilities
export {
  executeStepSimple,
} from './runner-utils';
