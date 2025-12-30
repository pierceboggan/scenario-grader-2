import { Scenario, LLMEvaluation, EvaluationDimension, Suggestion, RunReport, RunArtifacts } from './types';
import { nanoid } from 'nanoid';
import OpenAI from 'openai';

/**
 * LLM Evaluator using OpenAI GPT-5.2
 * 
 * Evaluates VS Code scenario runs using LLM analysis of screenshots,
 * logs, and execution artifacts.
 */

// ============================================================================
// Configuration
// ============================================================================

export interface EvaluatorConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Model to use (defaults to gpt-5.2) */
  model?: string;
  /** Whether to use mock evaluation instead of real API */
  useMock?: boolean;
}

const DEFAULT_MODEL = 'gpt-5.2';

const EVALUATION_DIMENSIONS = [
  { id: 'discoverability', name: 'Discoverability', weight: 0.2 },
  { id: 'clarity', name: 'UI Clarity', weight: 0.2 },
  { id: 'responsiveness', name: 'Responsiveness', weight: 0.15 },
  { id: 'error-handling', name: 'Error Handling', weight: 0.15 },
  { id: 'completion', name: 'Task Completion', weight: 0.2 },
  { id: 'polish', name: 'Overall Polish', weight: 0.1 },
];

// ============================================================================
// OpenAI Client
// ============================================================================

let openaiClient: OpenAI | null = null;

function getOpenAIClient(apiKey?: string): OpenAI {
  if (!openaiClient) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable or pass apiKey in config.');
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

// ============================================================================
// Evaluation Prompts
// ============================================================================

const SYSTEM_PROMPT = `You are an expert UX evaluator for VS Code. Your job is to analyze scenario execution artifacts (screenshots, logs, transcripts) and provide detailed evaluation scores and actionable suggestions.

You evaluate across these dimensions:
- **Discoverability**: How easy is it to find and access the feature?
- **UI Clarity**: Are the UI elements well-labeled and self-explanatory?
- **Responsiveness**: Does the UI respond quickly with appropriate feedback?
- **Error Handling**: Are errors communicated clearly with recovery paths?
- **Task Completion**: Can users successfully complete the intended task?
- **Overall Polish**: Does the experience feel professional and refined?

Score each dimension from 1-5:
- 1: Critical issues, feature is unusable
- 2: Major issues that significantly impact usability
- 3: Works but has noticeable friction
- 4: Good experience with minor improvements possible
- 5: Excellent, polished experience

Provide specific, actionable feedback tied to what you observe in the artifacts.`;

function buildUserPrompt(
  scenario: Scenario,
  runReport: Partial<RunReport>,
  artifacts: RunArtifacts
): string {
  const stepsExecuted = runReport.steps?.map((s, i) => {
    const step = scenario.steps.find(st => st.id === s.stepId);
    return `${i + 1}. [${s.status.toUpperCase()}] ${step?.description || s.stepId}${s.error ? ` - Error: ${s.error}` : ''}`;
  }).join('\n') || 'No step details available';

  return `## Scenario Under Evaluation

**Name**: ${scenario.name}
**Description**: ${scenario.description}
**Priority**: ${scenario.priority}
**Tags**: ${(scenario.tags || []).join(', ') || 'None'}

## Execution Summary
- **Status**: ${runReport.status || 'unknown'}
- **Duration**: ${runReport.duration ? `${runReport.duration}ms` : 'unknown'}
- **Steps Passed**: ${runReport.steps?.filter(s => s.status === 'passed').length || 0}/${runReport.steps?.length || 0}

## Steps Executed
${stepsExecuted}

## Logs
\`\`\`
${artifacts.logs?.slice(0, 5000) || 'No logs available'}
\`\`\`

${artifacts.chatTranscript ? `## Chat Transcript\n\`\`\`\n${artifacts.chatTranscript.slice(0, 3000)}\n\`\`\`` : ''}

## Required Output
Analyze the execution and provide your evaluation as a JSON object with this exact structure:
{
  "overallScore": <number 1-5>,
  "dimensions": [
    { "id": "<dimension-id>", "name": "<Dimension Name>", "score": <1-5>, "feedback": "<specific feedback>" }
  ],
  "suggestions": [
    { 
      "title": "<short title>", 
      "description": "<detailed markdown description with specific recommendations>", 
      "labels": ["area:<feature>", "type:<bug|ux|feature|accessibility>"],
      "severity": "low|medium|high|critical"
    }
  ]
}

Ensure dimensions array includes all 6 dimensions: discoverability, clarity, responsiveness, error-handling, completion, polish.
Generate 1-5 suggestions based on issues found. Focus on actionable improvements.`;
}

// ============================================================================
// Main Evaluation Function
// ============================================================================

/**
 * Evaluate a scenario run using OpenAI GPT-5.2
 */
export async function evaluateScenarioRun(
  scenario: Scenario,
  runReport: Partial<RunReport>,
  config: EvaluatorConfig = {}
): Promise<LLMEvaluation> {
  // Use mock if configured or if no API key
  if (config.useMock || (!config.apiKey && !process.env.OPENAI_API_KEY)) {
    console.log('Using mock evaluation (no OpenAI API key configured)');
    return generateMockEvaluation();
  }

  const artifacts = runReport.artifacts || {
    screenshots: [],
    logs: '',
  };

  try {
    const client = getOpenAIClient(config.apiKey);
    const model = config.model || DEFAULT_MODEL;

    console.log(`Evaluating scenario with ${model}...`);

    // Build messages with optional vision support for screenshots
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // If we have screenshots, use vision capability
    if (artifacts.screenshots && artifacts.screenshots.length > 0) {
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: buildUserPrompt(scenario, runReport, artifacts) },
      ];

      // Add up to 5 screenshots as images
      for (const screenshot of artifacts.screenshots.slice(0, 5)) {
        // Check if it's a base64 data URL or file path
        if (screenshot.startsWith('data:')) {
          content.push({
            type: 'image_url',
            image_url: { url: screenshot, detail: 'high' },
          });
        } else if (screenshot.startsWith('http')) {
          content.push({
            type: 'image_url',
            image_url: { url: screenshot, detail: 'high' },
          });
        }
        // Skip file paths - would need to read and convert to base64
      }

      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: buildUserPrompt(scenario, runReport, artifacts) });
    }

    const response = await client.chat.completions.create({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_completion_tokens: 2000,
    });

    const rawResponse = response.choices[0]?.message?.content || '';
    
    try {
      const parsed = JSON.parse(rawResponse);
      
      // Validate and normalize the response
      const evaluation = normalizeEvaluation(parsed, rawResponse);
      return evaluation;
    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError);
      console.error('Raw response:', rawResponse);
      
      // Return a fallback evaluation with the raw response
      return {
        overallScore: 3,
        dimensions: EVALUATION_DIMENSIONS.map(d => ({
          id: d.id,
          name: d.name,
          score: 3,
          feedback: 'Evaluation parsing failed - manual review recommended',
        })),
        suggestions: [{
          id: nanoid(),
          title: 'Review evaluation manually',
          description: 'The LLM evaluation response could not be parsed. Please review the raw response.',
          labels: ['type:evaluation-error'],
          severity: 'medium',
        }],
        rawResponse,
      };
    }
  } catch (error) {
    console.error('LLM evaluation failed:', error);
    
    // Fall back to mock on API error
    const mockEval = await generateMockEvaluation();
    mockEval.suggestions.unshift({
      id: nanoid(),
      title: 'LLM evaluation failed',
      description: `API error: ${error instanceof Error ? error.message : 'Unknown error'}. Using mock evaluation as fallback.`,
      labels: ['type:evaluation-error'],
      severity: 'low',
    });
    return mockEval;
  }
}

/**
 * Normalize and validate evaluation response from LLM
 */
function normalizeEvaluation(parsed: any, rawResponse: string): LLMEvaluation {
  // Ensure all dimensions are present
  const dimensions: EvaluationDimension[] = EVALUATION_DIMENSIONS.map(dim => {
    const found = parsed.dimensions?.find((d: any) => d.id === dim.id);
    return {
      id: dim.id,
      name: dim.name,
      score: Math.min(5, Math.max(1, found?.score || 3)),
      feedback: found?.feedback || 'No specific feedback provided',
    };
  });

  // Calculate weighted overall score if not provided
  const overallScore = parsed.overallScore || dimensions.reduce((acc, dim) => {
    const weight = EVALUATION_DIMENSIONS.find(d => d.id === dim.id)?.weight || 0.1;
    return acc + dim.score * weight;
  }, 0);

  // Normalize suggestions
  const suggestions: Suggestion[] = (parsed.suggestions || []).map((s: any) => ({
    id: nanoid(),
    title: s.title || 'Untitled suggestion',
    description: s.description || '',
    labels: Array.isArray(s.labels) ? s.labels : [],
    severity: ['low', 'medium', 'high', 'critical'].includes(s.severity) ? s.severity : 'medium',
  }));

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    dimensions,
    suggestions,
    rawResponse,
  };
}

// ============================================================================
// Mock Evaluation (for testing without API)
// ============================================================================

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
 * Generate a mock LLM evaluation for testing
 */
async function generateMockEvaluation(): Promise<LLMEvaluation> {
  // Simulate API latency
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));
  
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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate evaluation prompt for debugging or manual evaluation
 */
export function generateEvaluationPrompt(
  scenario: Scenario,
  artifacts: RunArtifacts
): string {
  return `${SYSTEM_PROMPT}

---

${buildUserPrompt(scenario, {}, artifacts)}`;
}

/**
 * Get list of evaluation dimensions with weights
 */
export function getEvaluationDimensions() {
  return [...EVALUATION_DIMENSIONS];
}
