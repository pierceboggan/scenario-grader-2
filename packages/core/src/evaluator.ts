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
  { id: 'discoverability', name: 'Discoverability', weight: 0.15 },
  { id: 'clarity', name: 'UI Clarity', weight: 0.15 },
  { id: 'responsiveness', name: 'Speed & Responsiveness', weight: 0.20 },
  { id: 'ai-integration', name: 'AI Integration Quality', weight: 0.20 },
  { id: 'completion', name: 'Task Completion', weight: 0.20 },
  { id: 'polish', name: 'Polish & Delight', weight: 0.10 },
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

const SYSTEM_PROMPT = `You are an expert developer experience (DX) evaluator for AI-powered code editors. Your job is to evaluate VS Code scenarios against best-in-class standards set by Cursor, Windsurf, and other modern AI IDEs.

You evaluate across these dimensions:
- **Discoverability**: How easy is it to find and access AI features? Are entry points intuitive?
- **UI Clarity**: Are AI interactions well-labeled and self-explanatory? Clear affordances?
- **Speed & Responsiveness**: Is the AI fast? Are there streaming responses? Loading indicators? Does it feel instant?
- **AI Integration Quality**: How seamlessly does AI blend into the workflow? Context awareness? Multi-turn conversations? Code application?
- **Task Completion**: Can developers complete their intent quickly? Fewer steps than competitors?
- **Polish & Delight**: Does the experience feel magical? Thoughtful animations? Attention to detail?

Benchmark against modern AI IDE standards:
- Cursor: Inline edits, fast completions, Cmd+K everywhere, agent mode
- Windsurf: Cascade flows, ambient awareness, predictive actions  
- Claude/ChatGPT coding: Context retention, code application, iteration speed

Score each dimension from 1-5:
- 1: Significantly behind competitors, major friction
- 2: Below average, noticeable gaps vs modern AI IDEs
- 3: On par with baseline expectations, some friction
- 4: Good experience, competitive with best-in-class
- 5: Exceptional, sets new standards for AI coding UX

Provide specific, actionable feedback tied to what you observe. Reference competitor features when relevant.`;

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

Ensure dimensions array includes all 6 dimensions: discoverability, clarity, responsiveness, ai-integration, completion, polish.
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
    'Entry points for AI features are intuitive and well-placed.',
    'Users may miss AI capabilities without better visual cues - Cursor shows inline hints.',
    'Clear iconography and keyboard shortcuts make this feature highly discoverable.',
    'Consider a command palette integration similar to Cursor\'s Cmd+K everywhere pattern.',
  ],
  clarity: [
    'AI interactions are well-labeled with clear affordances.',
    'Some terminology may confuse users new to AI coding assistants.',
    'Excellent visual hierarchy guides users through AI workflows.',
    'The flow could benefit from clearer step indicators like Windsurf\'s cascade status.',
  ],
  responsiveness: [
    'Streaming responses feel fast and modern - competitive with Cursor.',
    'Response latency is noticeable - consider optimistic UI or skeleton states.',
    'Excellent perceived performance with instant feedback throughout.',
    'First-token latency could be improved - Windsurf shows thinking indicators sooner.',
  ],
  'ai-integration': [
    'AI seamlessly integrates into the editing workflow without context switching.',
    'Context awareness could be improved - Cursor maintains better conversation context.',
    'Code application is smooth with clear diff previews.',
    'Consider adding ambient awareness features like Windsurf\'s predictive suggestions.',
  ],
  completion: [
    'Developers can complete tasks with minimal friction.',
    'Some users may get stuck at intermediate steps - consider guided flows.',
    'The happy path is efficient and competitive with modern AI IDEs.',
    'Consider reducing clicks/steps - Cursor often achieves tasks in fewer interactions.',
  ],
  polish: [
    'The experience feels magical and delightful - attention to detail is evident.',
    'Minor visual inconsistencies detract from the premium feel.',
    'Thoughtful animations and transitions enhance the experience.',
    'Some micro-interactions could be smoother - compare to Cursor\'s inline edit animations.',
  ],
};

const SAMPLE_SUGGESTIONS: Omit<Suggestion, 'id'>[] = [
  {
    title: 'Add inline AI edit capability (Cmd+K pattern)',
    description: 'Cursor popularized Cmd+K for inline edits anywhere in the editor. Consider a similar pattern for quick AI-powered code modifications without opening a separate chat panel.',
    labels: ['area:copilot', 'type:feature', 'competitor:cursor'],
    severity: 'high',
  },
  {
    title: 'Improve streaming response latency',
    description: 'First-token latency feels slower than Cursor/Windsurf. Consider optimistic UI updates, better caching, or showing a "thinking" indicator sooner to improve perceived performance.',
    labels: ['area:copilot', 'type:performance', 'priority:high'],
    severity: 'high',
  },
  {
    title: 'Add ambient context awareness',
    description: 'Windsurf\'s Cascade shows predictive suggestions based on recent edits. Consider proactive AI suggestions that anticipate developer intent without explicit invocation.',
    labels: ['area:copilot', 'type:feature', 'competitor:windsurf'],
    severity: 'medium',
  },
  {
    title: 'Implement multi-file edit preview',
    description: 'When AI suggests changes across multiple files, show a unified diff view with accept/reject per-file similar to Cursor\'s agent mode output.',
    labels: ['area:copilot', 'type:feature'],
    severity: 'medium',
  },
  {
    title: 'Add conversation context persistence',
    description: 'Chat context is lost between sessions. Consider persisting conversation history and allowing users to reference previous discussions for better continuity.',
    labels: ['area:copilot', 'type:ux'],
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
