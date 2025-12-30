import { Scenario, LLMEvaluation, EvaluationDimension, Suggestion, RunReport } from './types';
import { nanoid } from 'nanoid';

/**
 * Mock LLM Evaluator
 * 
 * In production, this would call Azure AI Foundry.
 * For now, it generates realistic mock evaluations.
 */

const EVALUATION_DIMENSIONS = [
  { id: 'discoverability', name: 'Discoverability', weight: 0.2 },
  { id: 'clarity', name: 'UI Clarity', weight: 0.2 },
  { id: 'responsiveness', name: 'Responsiveness', weight: 0.15 },
  { id: 'error-handling', name: 'Error Handling', weight: 0.15 },
  { id: 'completion', name: 'Task Completion', weight: 0.2 },
  { id: 'polish', name: 'Overall Polish', weight: 0.1 },
];

const SAMPLE_FEEDBACK = {
  discoverability: [
    'The entry point for this feature was intuitive and easy to find.',
    'Users may struggle to discover this functionality without guidance.',
    'Clear iconography and placement make this feature highly discoverable.',
    'Consider adding a tooltip or walkthrough for first-time users.',
  ],
  clarity: [
    'The UI elements are well-labeled and self-explanatory.',
    'Some terminology may be confusing to new users.',
    'Excellent use of visual hierarchy to guide user attention.',
    'The flow could benefit from clearer step indicators.',
  ],
  responsiveness: [
    'Actions complete quickly with appropriate feedback.',
    'Some operations feel sluggish and could use loading indicators.',
    'Excellent perceived performance throughout the workflow.',
    'Consider adding skeleton loaders for async operations.',
  ],
  'error-handling': [
    'Error messages are clear and actionable.',
    'Some edge cases result in cryptic error messages.',
    'Recovery from errors is smooth and well-guided.',
    'Consider providing more specific troubleshooting steps.',
  ],
  completion: [
    'Users can successfully complete the intended task.',
    'Some users may get stuck at intermediate steps.',
    'The happy path is well-defined and reliable.',
    'Consider adding progress persistence for complex workflows.',
  ],
  polish: [
    'The experience feels polished and professional.',
    'Minor visual inconsistencies detract from the experience.',
    'Attention to detail is evident throughout.',
    'Some animations could be smoother.',
  ],
};

const SAMPLE_SUGGESTIONS: Omit<Suggestion, 'id'>[] = [
  {
    title: 'Add contextual help for MCP configuration',
    description: 'Consider adding an inline help panel or documentation link when users are configuring MCP servers. This would reduce friction for first-time users.',
    labels: ['area:mcp', 'type:ux', 'good-first-issue'],
    severity: 'medium',
  },
  {
    title: 'Improve error message specificity',
    description: 'When MCP server connection fails, provide more specific error messages indicating whether the issue is network-related, authentication-related, or configuration-related.',
    labels: ['area:mcp', 'type:bug', 'priority:high'],
    severity: 'high',
  },
  {
    title: 'Add confirmation dialog for destructive actions',
    description: 'When removing an MCP server configuration, show a confirmation dialog to prevent accidental deletions.',
    labels: ['area:mcp', 'type:ux'],
    severity: 'low',
  },
  {
    title: 'Implement MCP server health indicator',
    description: 'Add a visual indicator showing the connection status of configured MCP servers in the sidebar.',
    labels: ['area:mcp', 'type:feature'],
    severity: 'medium',
  },
  {
    title: 'Support keyboard navigation in MCP panel',
    description: 'Ensure all MCP panel actions are accessible via keyboard shortcuts for power users and accessibility.',
    labels: ['area:mcp', 'type:accessibility'],
    severity: 'medium',
  },
];

function randomScore(min: number = 2, max: number = 5): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateDimensionEvaluation(dimensionId: string): EvaluationDimension {
  const dimension = EVALUATION_DIMENSIONS.find((d) => d.id === dimensionId)!;
  const feedback = SAMPLE_FEEDBACK[dimensionId as keyof typeof SAMPLE_FEEDBACK] || SAMPLE_FEEDBACK.clarity;
  
  return {
    id: dimensionId,
    name: dimension.name,
    score: randomScore(3, 5),
    feedback: randomChoice(feedback),
  };
}

function selectSuggestions(count: number = 2): Suggestion[] {
  const shuffled = [...SAMPLE_SUGGESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((s) => ({
    ...s,
    id: nanoid(),
  }));
}

/**
 * Generate a mock LLM evaluation for a scenario run
 */
export async function evaluateScenarioRun(
  _scenario: Scenario,
  _runReport: Partial<RunReport>
): Promise<LLMEvaluation> {
  // Simulate API latency
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
  
  const dimensions = EVALUATION_DIMENSIONS.map((d) =>
    generateDimensionEvaluation(d.id)
  );
  
  // Calculate weighted overall score
  const overallScore = dimensions.reduce((acc, dim) => {
    const weight = EVALUATION_DIMENSIONS.find((d) => d.id === dim.id)?.weight || 0.1;
    return acc + dim.score * weight;
  }, 0);
  
  // Generate 1-3 suggestions based on scores
  const lowScoreDimensions = dimensions.filter((d) => d.score < 4);
  const suggestionCount = Math.min(3, Math.max(1, lowScoreDimensions.length));
  
  return {
    overallScore: Math.round(overallScore * 10) / 10,
    dimensions,
    suggestions: selectSuggestions(suggestionCount),
  };
}

/**
 * Generate evaluation prompt for real LLM (for future use)
 */
export function generateEvaluationPrompt(
  scenario: Scenario,
  _artifacts: { screenshots: string[]; logs: string; chatTranscript?: string }
): string {
  return `
You are evaluating a VS Code user experience scenario.

## Scenario
- **Name**: ${scenario.name}
- **Description**: ${scenario.description}
- **Priority**: ${scenario.priority}

## Steps Executed
${scenario.steps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

## Evaluation Criteria
Please evaluate the following dimensions on a scale of 1-5:
${EVALUATION_DIMENSIONS.map((d) => `- **${d.name}** (${d.id})`).join('\n')}

## Required Output Format
Return a JSON object with this exact structure:
{
  "overallScore": <number 1-5>,
  "dimensions": [
    { "id": "<dimension-id>", "name": "<name>", "score": <1-5>, "feedback": "<string>" }
  ],
  "suggestions": [
    { "title": "<string>", "description": "<markdown>", "labels": ["<string>"], "severity": "low|medium|high|critical" }
  ]
}

Analyze the provided artifacts and generate your evaluation.
`.trim();
}
