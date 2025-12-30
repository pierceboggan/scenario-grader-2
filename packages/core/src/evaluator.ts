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

const SYSTEM_PROMPT = `You are an expert developer experience (DX) evaluator specializing in AI-powered developer tools. Your role is to evaluate VS Code + GitHub Copilot scenarios through the lens of real developers at different points in their AI adoption journey.

## Your Evaluation Personas

Think about these two distinct users when evaluating:

**The AI-Curious Developer ("Alex")**
- Has used ChatGPT/Claude for coding questions, but hasn't integrated AI into their IDE workflow
- Skeptical but interested: "Will this actually save me time, or just be another thing to learn?"
- Needs clear value demonstration in the first 30 seconds
- Gets frustrated by: unclear entry points, AI responses that require lots of context-switching, jargon without explanation
- Delighted by: "it just works" moments, AI that understands their actual intent, less typing for common tasks

**The Power User ("Jordan")**  
- Uses Cursor/Windsurf daily, has customized keybindings, knows every shortcut
- Expects: instant responses, keyboard-first workflows, multi-file awareness, agent-level autonomy
- Gets frustrated by: mouse-heavy flows, lack of context retention between sessions, AI that "forgets" project structure
- Evaluates against: Cursor's Cmd+K inline edits, Windsurf's cascade flows, Claude's agentic tool use

## Evaluation Dimensions

Score each 1-5 from BOTH user perspectives. A great experience works for Alex AND Jordan.

### 1. Discoverability (Weight: 15%)
For Alex: Can they find and invoke AI features without reading docs? Are entry points visible where they expect help?
For Jordan: Are there keyboard shortcuts? Can they access features without leaving the flow?

Signs of excellence:
- AI help surfaces contextually (e.g., error squiggles offer "Fix with Copilot")
- Multiple entry points: command palette, keyboard shortcuts, inline triggers, context menus
- Visual cues (icons, hover hints) that teach without interrupting

Red flags:
- Features hidden in nested menus
- No keyboard-first path
- Unclear when AI is available vs. not

### 2. UI Clarity (Weight: 15%)
For Alex: Is it obvious what the AI can do? Do labels use plain language vs. jargon?
For Jordan: Is the UI information-dense enough? Can they see all relevant context at a glance?

Signs of excellence:
- AI interactions clearly labeled ("Copilot is thinking...", "3 files will be modified")
- Preview of changes before applying (diffs, highlighted regions)
- Clear escape hatches ("Reject", "Undo", "Start over")

Red flags:
- "Magic" actions without explanation of what will happen
- No clear indication of AI-generated vs. user-written code
- Terminology that assumes prior AI knowledge

### 3. Speed & Responsiveness (Weight: 20%)
For Alex: Does it feel instant? Do they see feedback immediately?
For Jordan: First-token latency, streaming quality, no perceptible lag vs. competitors

Signs of excellence:
- Streaming responses (not waiting for full completion)
- Optimistic UI updates (typing indicators, "thinking" states appear <100ms)
- Smooth animations that indicate progress without blocking

Red flags:
- Blank states during loading
- "Spinner of uncertainty" - loading with no progress indication
- UI freezes during AI operations
- Response takes >3s with no intermediate feedback

### 4. AI Integration Quality (Weight: 20%)  
For Alex: Does the AI understand what I'm trying to do without lengthy explanations?
For Jordan: Context window utilization, multi-turn coherence, tool/function calling, workspace awareness

Signs of excellence:
- AI references current file, selection, and project structure automatically
- Conversation context persists (follow-up questions work naturally)
- Code suggestions compile and fit the project's patterns
- Agent mode: autonomous planning, file creation, command execution

Red flags:
- AI ignores current selection or file context
- Each message treated as isolated (no conversation memory)
- Suggestions that don't match project language/framework
- Agent hallucinates file paths or uses wrong APIs

### 5. Task Completion (Weight: 20%)
For Alex: Can I accomplish my goal faster than I would manually? Did it reduce cognitive load?
For Jordan: Fewer keystrokes than typing manually? Fewer steps than Cursor/Windsurf?

Signs of excellence:
- Common tasks (explain code, fix error, write test) achievable in 1-2 interactions
- AI handles the boring parts (boilerplate, imports, type definitions)
- Easy to apply suggestions (one-click or Enter to accept)
- Iteration is fast (refine → see update → refine again)

Red flags:
- More steps than doing it manually
- Copy-paste required to apply suggestions
- AI output requires significant manual cleanup
- Dead ends that require starting over

### 6. Polish & Delight (Weight: 10%)
For Alex: Does this feel like a premium, trustworthy tool? Are there "wow" moments?
For Jordan: Attention to detail. The 10% that separates good from great.

Signs of excellence:
- Thoughtful micro-interactions (hover states, transitions, feedback sounds)
- Error handling that helps, not frustrates ("Try rephrasing" vs. "Error 500")
- Surprising capability ("I didn't know it could do that!")
- Consistent visual language

Red flags:
- Janky animations or layout shifts
- Generic error messages
- Inconsistent behavior between similar features
- Feels like an afterthought bolted onto VS Code

## Competitor Benchmarks (for reference)

When suggesting improvements, ground them in real alternatives developers have:
- **Cursor**: Cmd+K inline edits, Tab to accept suggestions, Composer for multi-file, fast completions
- **Windsurf**: Cascade for iterative refinement, ambient context awareness, predictive actions
- **Claude Code/ChatGPT Canvas**: Deep reasoning, code application, artifact generation
- **Continue.dev**: Open source, local model support, customizable

## Scoring Guide

1 = "This actively drives developers away" - Major usability failures, Alex gives up, Jordan switches tools
2 = "Noticeably worse than alternatives" - Works but frustrating, Alex confused, Jordan annoyed
3 = "Meets baseline expectations" - Functional but unremarkable, neither persona is delighted
4 = "Competitive with best-in-class" - Alex impressed, Jordan finds it efficient
5 = "Sets new standards" - Genuinely better than alternatives in meaningful ways

Be specific. Instead of "improve responsiveness", say "First-token latency of ~2s feels slow. Cursor shows thinking indicator within 200ms. Add skeleton UI or typing indicator to bridge the gap."`;


function buildUserPrompt(
  scenario: Scenario,
  runReport: Partial<RunReport>,
  artifacts: RunArtifacts
): string {
  const stepsExecuted = runReport.steps?.map((s, i) => {
    const step = scenario.steps.find(st => st.id === s.stepId);
    return `${i + 1}. [${s.status.toUpperCase()}] ${step?.description || s.stepId}${s.error ? ` - Error: ${s.error}` : ''}`;
  }).join('\n') || 'No step details available';

  const totalDuration = runReport.duration || 0;
  const stepCount = runReport.steps?.length || 0;
  const passedSteps = runReport.steps?.filter(s => s.status === 'passed').length || 0;
  const failedSteps = runReport.steps?.filter(s => s.status === 'failed').length || 0;

  return `## Scenario Under Evaluation

**Name**: ${scenario.name}
**Description**: ${scenario.description}
**Priority**: ${scenario.priority}
**Tags**: ${(scenario.tags || []).join(', ') || 'None'}

---

## What You're Evaluating

This is an automated test run of a VS Code + Copilot scenario. Your job is to evaluate the **developer experience quality** based on:
1. The screenshots captured at key moments (if provided)
2. The execution logs showing what happened
3. The chat transcript (if this scenario involved Copilot Chat)
4. The step-by-step execution details

Think about: "If Alex (AI-curious developer) or Jordan (power user) went through this flow, how would they feel?"

---

## Execution Summary

| Metric | Value |
|--------|-------|
| Status | ${runReport.status || 'unknown'} |
| Total Duration | ${totalDuration ? `${(totalDuration / 1000).toFixed(1)}s` : 'unknown'} |
| Steps Executed | ${stepCount} |
| Passed | ${passedSteps} |
| Failed | ${failedSteps} |

## Detailed Step Execution
${stepsExecuted}

---

## Logs (truncated if long)
\`\`\`
${artifacts.logs?.slice(0, 5000) || 'No logs available'}
\`\`\`

${artifacts.chatTranscript ? `---

## Chat Transcript
This shows the actual conversation between the user and Copilot during this scenario:

\`\`\`
${artifacts.chatTranscript.slice(0, 4000)}
\`\`\`` : ''}

---

## Your Evaluation Task

Analyze this scenario run and provide your evaluation. Consider:

1. **For each dimension**: How would Alex experience this? How would Jordan experience this? What's the gap?

2. **Evidence-based scoring**: Reference specific logs, errors, timings, or observable behaviors in your feedback. Don't guess—evaluate what you can actually see.

3. **Actionable suggestions**: Generate suggestions that a PM or engineer could act on. Include severity (how much does this hurt the experience?) and labels (what area/team owns this?).

---

## Required JSON Output

Return your evaluation as a JSON object with this exact structure:

\`\`\`json
{
  "overallScore": <number 1-5, weighted average based on dimension weights>,
  "dimensions": [
    { 
      "id": "discoverability", 
      "name": "Discoverability", 
      "score": <1-5>,
      "feedback": "<2-3 sentences. What did you observe? How would Alex/Jordan experience this? What's missing?>"
    },
    { 
      "id": "clarity", 
      "name": "UI Clarity", 
      "score": <1-5>,
      "feedback": "<2-3 sentences>"
    },
    { 
      "id": "responsiveness", 
      "name": "Speed & Responsiveness", 
      "score": <1-5>,
      "feedback": "<2-3 sentences. Reference actual timings from logs if available.>"
    },
    { 
      "id": "ai-integration", 
      "name": "AI Integration Quality", 
      "score": <1-5>,
      "feedback": "<2-3 sentences. Did the AI understand context? Was the output relevant?>"
    },
    { 
      "id": "completion", 
      "name": "Task Completion", 
      "score": <1-5>,
      "feedback": "<2-3 sentences. Was the goal achievable? How many steps/interactions?>"
    },
    { 
      "id": "polish", 
      "name": "Polish & Delight", 
      "score": <1-5>,
      "feedback": "<2-3 sentences>"
    }
  ],
  "suggestions": [
    { 
      "title": "<short, actionable title - max 10 words>", 
      "description": "<detailed markdown description. Include: what's wrong, who it affects (Alex/Jordan/both), what 'good' looks like (cite competitor if relevant), specific recommendation>", 
      "labels": ["area:<copilot|editor|chat|agent|inline|mcp>", "type:<bug|ux|feature|performance|accessibility>"],
      "severity": "<low|medium|high|critical - based on how much this hurts the experience>"
    }
  ]
}
\`\`\`

**Important**:
- Include ALL 6 dimensions in the dimensions array
- Generate 1-5 suggestions, prioritized by severity
- Be specific—vague feedback like "could be faster" isn't actionable
- If the scenario failed or had errors, factor that into your scores but also consider what the experience would be if it worked`;
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
    'The Cmd+Shift+I shortcut opens chat quickly, but Alex might not know it exists without prompting. Consider adding a subtle hint when hovering over code errors.',
    'Jordan would appreciate that the command palette includes the action, but first-time users may struggle to find the entry point. Cursor shows inline hints near errors.',
    'Multiple entry points exist (keyboard, command palette, icon), which works for both personas. The chat icon in the sidebar is clearly visible.',
    'Alex could easily miss this feature—there\'s no contextual prompt suggesting AI help. Windsurf shows proactive suggestions based on recent edits.',
  ],
  clarity: [
    'The chat interface is clean and self-explanatory. Both Alex and Jordan would understand what to do immediately.',
    'Some terminology ("Agent mode", "Cascade") might confuse Alex. Plain language like "Let AI do multiple steps" would be clearer.',
    'Clear visual feedback when AI is processing. The "Copilot is thinking" indicator sets good expectations.',
    'Jordan would appreciate the information density, but Alex might feel overwhelmed. Consider progressive disclosure of advanced options.',
  ],
  responsiveness: [
    'Streaming responses feel modern—comparable to Cursor. First token appears quickly enough that both users feel acknowledged.',
    'There\'s a noticeable ~2s delay before first response. Alex might think it\'s broken. Add a typing indicator within 200ms like ChatGPT.',
    'The thinking indicator appears immediately, which is excellent. However, no progress indication for longer operations leaves users uncertain.',
    'Response time is competitive with Windsurf. The streaming animation is smooth and gives good feedback during generation.',
  ],
  'ai-integration': [
    'The AI correctly understood the current file context without explicit instruction. This "it just works" moment is key for Alex\'s adoption.',
    'Multi-turn conversation worked well—Jordan can build on previous messages. However, context seems limited to current file vs. full workspace.',
    'Code suggestions matched the project\'s TypeScript patterns. The AI clearly has access to relevant context.',
    'Agent mode autonomously created files as expected, though Jordan would want more control over the plan before execution (like Cursor\'s Composer preview).',
  ],
  completion: [
    'The task was achievable in 2 interactions, which is efficient. Alex would feel productive; Jordan would find it comparable to Cursor.',
    'Required 4 steps when Cursor achieves the same in 2 (Cmd+K inline). There\'s room to reduce friction for power users.',
    'One-click to apply suggestions worked smoothly. The "Apply" button is prominent and the diff preview builds trust before committing.',
    'The happy path works well, but error recovery is unclear. When the AI misunderstood, Jordan had to start over vs. refining the prompt.',
  ],
  polish: [
    'Subtle animations during generation feel premium. This attention to detail builds trust, especially for Alex who\'s evaluating whether AI tools are "ready".',
    'The experience feels cohesive with VS Code\'s design language. No jarring visual inconsistencies.',
    'Minor layout shift when response loads breaks the polish. Compare to Claude\'s smooth expansion animations.',
    'Error messages are helpful ("Try rephrasing your request") rather than technical. This helps Alex recover without frustration.',
  ],
};

const SAMPLE_SUGGESTIONS: Omit<Suggestion, 'id'>[] = [
  {
    title: 'Add contextual AI hints near code errors',
    description: '**Who it affects**: Alex (AI-curious developer) primarily.\n\n**Problem**: When Alex sees a TypeScript error, they don\'t naturally think to invoke Copilot. The AI capability is invisible at the moment of need.\n\n**What good looks like**: Cursor shows a subtle "Fix with AI" affordance inline with error squiggles. Clicking it opens inline chat pre-filled with the error context.\n\n**Recommendation**: Add a CodeLens or hover action near diagnostics: "Fix with Copilot". This teaches the feature through use and captures users at high-intent moments.',
    labels: ['area:copilot', 'type:ux', 'persona:alex'],
    severity: 'high',
  },
  {
    title: 'Reduce first-token latency with immediate feedback',
    description: '**Who it affects**: Both Alex and Jordan.\n\n**Problem**: The ~1.5s gap between sending a message and seeing any response feels like an eternity. Alex might think it\'s broken; Jordan notices it\'s slower than Cursor.\n\n**What good looks like**: ChatGPT shows a typing indicator within 100ms. Cursor displays "Thinking..." immediately with a subtle animation.\n\n**Recommendation**: Immediately show a skeleton or typing indicator when the request is sent, before the first token arrives. This bridges perceived latency.',
    labels: ['area:copilot', 'type:performance', 'priority:high'],
    severity: 'high',
  },
  {
    title: 'Show workspace context being used',
    description: '**Who it affects**: Jordan (power user) primarily.\n\n**Problem**: It\'s unclear whether Copilot is considering the full workspace or just the current file. Jordan needs to trust that context is being used appropriately.\n\n**What good looks like**: Claude\'s code mode shows "Reading file X..." as it gathers context. Cursor\'s Composer shows which files are in context.\n\n**Recommendation**: Add a collapsible "Context" section in chat showing which files/symbols the AI is considering. This builds trust and helps debug unexpected responses.',
    labels: ['area:copilot', 'type:feature', 'persona:jordan'],
    severity: 'medium',
  },
  {
    title: 'Add inline edit capability (Cmd+K pattern)',
    description: '**Who it affects**: Jordan primarily, but would delight Alex too.\n\n**Problem**: Current flow requires opening the full chat panel for even small edits. Jordan expects to select code → Cmd+K → type intent → see diff inline, like Cursor.\n\n**What good looks like**: Cursor\'s Cmd+K lets you edit code without opening a panel. The diff appears inline, you press Enter to accept. It\'s 3 keystrokes vs. 8+ with current flow.\n\n**Recommendation**: Implement lightweight inline edit triggered by Cmd+K in editor. Show diff inline, accept with Enter, reject with Escape. This is the #1 feature Jordan expects from modern AI IDEs.',
    labels: ['area:inline', 'type:feature', 'competitor:cursor', 'priority:high'],
    severity: 'high',
  },
  {
    title: 'Improve agent plan preview before execution',
    description: '**Who it affects**: Both personas, especially for Agent mode scenarios.\n\n**Problem**: Agent mode starts executing immediately. Jordan wants to review and approve the plan before files are modified. Alex might be alarmed by autonomous changes.\n\n**What good looks like**: Cursor\'s Composer shows a step-by-step plan with checkboxes before execution. Users can approve, modify, or cancel the plan.\n\n**Recommendation**: Before Agent executes, show the proposed plan: "I will create these files, modify these functions, run these commands." Let users approve step-by-step or all at once.',
    labels: ['area:agent', 'type:ux', 'trust:safety'],
    severity: 'medium',
  },
  {
    title: 'Persist conversation context between sessions',
    description: '**Who it affects**: Jordan primarily.\n\n**Problem**: Chat history is lost when VS Code restarts. Jordan expects to continue conversations about the same codebase without re-explaining context.\n\n**What good looks like**: ChatGPT and Claude remember previous conversations. You can reference "the function we discussed yesterday" and the AI understands.\n\n**Recommendation**: Persist chat threads per-workspace. Allow users to reference previous conversations. Consider a "Continue where I left off" feature for complex multi-day tasks.',
    labels: ['area:chat', 'type:feature', 'persona:jordan'],
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
