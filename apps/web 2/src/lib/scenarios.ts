// Sample scenarios for the web app (no external dependencies)
import { Scenario } from './types';

export const SAMPLE_SCENARIOS: Scenario[] = [
  {
    id: 'copilot-chat-basic',
    name: 'Basic Copilot Chat Interaction',
    owner: '@copilot-team',
    tags: ['copilot', 'chat', 'P1'],
    description: 'Validates basic Copilot Chat functionality including opening chat, sending messages, and receiving responses.',
    priority: 'P1',
    environment: {
      vscodeTarget: 'desktop',
      vscodeVersion: 'stable',
      platform: 'macOS',
      copilotChannel: 'stable',
    },
    preconditions: ['Copilot subscription is active'],
    steps: [
      { id: 'launch', description: 'Launch VS Code', action: 'launchVSCodeWithProfile', args: {}, optional: false },
      { id: 'open_chat', description: 'Open Copilot Chat panel', action: 'openCopilotChat', args: {}, hints: [{ type: 'keyboard', value: 'Cmd+Shift+I' }], optional: false },
      { id: 'send_greeting', description: 'Send a simple greeting', action: 'sendChatMessage', args: { message: 'Hello! Can you help me write a simple Python function?' }, optional: false },
      { id: 'wait_response', description: 'Wait for response to complete', action: 'wait', args: { duration: 5000 }, optional: false },
    ],
    assertions: [{ id: 'llm_evaluation', type: 'llmGrade', rubricId: 'chat-experience', required: false }],
    outputs: { captureVideo: false, screenshots: [{ atStep: 'send_greeting', name: 'chat-input' }, { atStep: 'wait_response', name: 'chat-response' }], storeChatTranscript: true, storeLogs: true },
  },
  {
    id: 'extension-install-marketplace',
    name: 'Install Extension from Marketplace',
    owner: '@extensions-team',
    tags: ['extensions', 'marketplace', 'P1'],
    description: 'Validates the experience of searching for and installing an extension from the VS Code Marketplace.',
    priority: 'P1',
    environment: { vscodeTarget: 'desktop', vscodeVersion: 'stable', platform: 'macOS', copilotChannel: 'stable' },
    preconditions: ['Network connectivity available'],
    steps: [
      { id: 'launch', description: 'Launch VS Code', action: 'launchVSCodeWithProfile', args: {}, optional: false },
      { id: 'open_extensions', description: 'Open Extensions view', action: 'openCommandPalette', args: {}, optional: false },
      { id: 'type_extensions_command', description: 'Type Extensions command', action: 'typeText', args: { text: 'View: Show Extensions' }, optional: false },
      { id: 'execute_command', description: 'Execute command', action: 'pressKey', args: { key: 'Enter' }, optional: false },
      { id: 'wait_extensions', description: 'Wait for extensions view', action: 'wait', args: { duration: 2000 }, optional: false },
      { id: 'search_extension', description: 'Search for Python extension', action: 'typeText', args: { text: 'Python' }, optional: false },
      { id: 'wait_search', description: 'Wait for search results', action: 'wait', args: { duration: 3000 }, optional: false },
    ],
    assertions: [{ id: 'llm_evaluation', type: 'llmGrade', rubricId: 'extension-install-experience', required: false }],
    outputs: { captureVideo: true, screenshots: [{ atStep: 'wait_search', name: 'search-results' }], storeChatTranscript: false, storeLogs: true },
  },
  {
    id: 'command-palette-navigation',
    name: 'Command Palette Navigation',
    owner: '@vscode-team',
    tags: ['navigation', 'command-palette', 'P1'],
    description: 'Tests basic command palette opening and navigation.',
    priority: 'P1',
    environment: { vscodeTarget: 'desktop', vscodeVersion: 'stable', platform: 'macOS', copilotChannel: 'stable' },
    preconditions: [],
    steps: [
      { id: 'launch', description: 'Launch VS Code', action: 'launchVSCodeWithProfile', args: {}, optional: false },
      { id: 'open_palette', description: 'Open command palette', action: 'openCommandPalette', args: {}, optional: false },
      { id: 'type_command', description: 'Type a command', action: 'typeText', args: { text: 'Preferences: Color Theme' }, optional: false },
      { id: 'wait_results', description: 'Wait for results', action: 'wait', args: { duration: 1000 }, optional: false },
      { id: 'execute', description: 'Execute command', action: 'pressKey', args: { key: 'Enter' }, optional: false },
      { id: 'wait_theme', description: 'Wait for theme picker', action: 'wait', args: { duration: 1000 }, optional: false },
      { id: 'close_picker', description: 'Close theme picker', action: 'pressKey', args: { key: 'Escape' }, optional: false },
    ],
    assertions: [],
    outputs: { captureVideo: false, screenshots: [{ atStep: 'wait_results', name: 'command-results' }, { atStep: 'wait_theme', name: 'theme-picker' }], storeChatTranscript: false, storeLogs: true },
  },
];

export function getSampleScenario(id: string): Scenario | undefined {
  return SAMPLE_SCENARIOS.find((s) => s.id === id);
}

export function getAllSampleScenarios(): Scenario[] {
  return [...SAMPLE_SCENARIOS];
}

// Helper functions
export function generateIssueFromSuggestion(suggestion: any, runReport: any) {
  return {
    title: suggestion.title,
    body: `## Summary\n${suggestion.description}\n\n## Source\n- Scenario: ${runReport.scenarioName}\n- Run ID: ${runReport.id}`,
    labels: suggestion.labels,
  };
}

export function formatIssuePreview(issue: any) {
  return `# ${issue.title}\n\n${issue.body}\n\nLabels: ${issue.labels.join(', ')}`;
}

export function scenarioToYAML(scenario: Scenario): string {
  // Simple YAML-like output
  return JSON.stringify(scenario, null, 2);
}

export function compileNaturalLanguage(text: string): Scenario {
  // Mock compiler - returns a basic scenario
  return {
    id: `generated-${Date.now()}`,
    name: 'Generated Scenario',
    owner: '@user',
    tags: ['generated'],
    description: text,
    priority: 'P2',
    environment: { vscodeTarget: 'desktop', vscodeVersion: 'stable', platform: 'macOS', copilotChannel: 'stable' },
    preconditions: [],
    steps: [{ id: 'step1', description: 'Generated step', action: 'wait', args: { duration: 1000 }, optional: false }],
    assertions: [],
  };
}
