// Browser-safe exports (no Playwright/Electron dependencies)

// Types
export * from './types';

// Parser & Validation (no Playwright deps)
export { parseScenarioYAML, scenarioToYAML, validateScenario, patchScenario } from './parser';

// Natural Language Compiler (uses nanoid, but that's OK for browser)
export { compileNaturalLanguage, generateScenarioDiff } from './compiler';

// GitHub Integration (just string formatting)
export {
  generateIssueFromSuggestion,
  generateIssueFromFailure,
  createGitHubIssue,
  formatIssuePreview,
} from './github';

// Sample Scenarios  
export { SAMPLE_SCENARIOS, getSampleScenario, getAllSampleScenarios } from './samples';
