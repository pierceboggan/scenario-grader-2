import { Step, Scenario, Priority } from './types';
import { scenarioToYAML } from './parser';
import { nanoid } from 'nanoid';
import * as readline from 'readline';
import OpenAI from 'openai';

// ============================================================================
// Scenario Generator - Generate YAML from recordings with LLM enhancement
// ============================================================================

/**
 * Raw recorded action from a session
 */
export interface RawAction {
  timestamp: number;
  type: 'keyboard' | 'click' | 'type' | 'scroll' | 'hover' | 'wait' | 'navigation';
  key?: string;
  keys?: string[];
  modifiers?: string[];
  target?: string;
  selector?: string;
  text?: string;
  duration?: number;
  url?: string;
  screenshot?: string; // Base64 screenshot at this point
}

/**
 * Configuration for scenario generation
 */
export interface GeneratorConfig {
  /** Name for the generated scenario */
  name: string;
  /** Description of what the scenario tests */
  description: string;
  /** Priority level */
  priority: Priority;
  /** Tags to apply */
  tags: string[];
  /** Owner/author */
  owner?: string;
  /** Enable LLM enhancement for better step descriptions */
  useLLM: boolean;
  /** Merge similar consecutive actions */
  mergeActions: boolean;
  /** Minimum wait time to capture as explicit wait (ms) */
  minWaitTime: number;
  /** Include hints for each step */
  includeHints: boolean;
}

const DEFAULT_CONFIG: GeneratorConfig = {
  name: 'Recorded Scenario',
  description: 'Scenario generated from user recording',
  priority: 'P1',
  tags: ['recorded'],
  useLLM: true,
  mergeActions: true,
  minWaitTime: 1000,
  includeHints: true,
};

/**
 * Keyboard shortcut to semantic action mapping
 */
const KEYBOARD_ACTION_MAP: Record<string, { action: string; description: string }> = {
  // Command Palette
  'Meta+Shift+P': { action: 'openCommandPalette', description: 'Open Command Palette' },
  'Control+Shift+P': { action: 'openCommandPalette', description: 'Open Command Palette' },
  
  // Copilot Chat
  'Meta+Shift+I': { action: 'openCopilotChat', description: 'Open Copilot Chat' },
  'Control+Shift+I': { action: 'openCopilotChat', description: 'Open Copilot Chat' },
  
  // Inline Chat
  'Meta+I': { action: 'openInlineChat', description: 'Open Inline Chat' },
  'Control+I': { action: 'openInlineChat', description: 'Open Inline Chat' },
  
  // Quick Open
  'Meta+P': { action: 'openQuickOpen', description: 'Quick Open file' },
  'Control+P': { action: 'openQuickOpen', description: 'Quick Open file' },
  
  // Save
  'Meta+S': { action: 'saveFile', description: 'Save file' },
  'Control+S': { action: 'saveFile', description: 'Save file' },
  
  // Terminal
  'Meta+`': { action: 'toggleTerminal', description: 'Toggle Terminal' },
  'Control+`': { action: 'toggleTerminal', description: 'Toggle Terminal' },
  
  // Search
  'Meta+Shift+F': { action: 'openSearch', description: 'Open Search' },
  'Control+Shift+F': { action: 'openSearch', description: 'Open Search' },
  
  // Go to Definition
  'F12': { action: 'goToDefinition', description: 'Go to Definition' },
  
  // Undo/Redo
  'Meta+Z': { action: 'undo', description: 'Undo' },
  'Control+Z': { action: 'undo', description: 'Undo' },
  'Meta+Shift+Z': { action: 'redo', description: 'Redo' },
  'Control+Shift+Z': { action: 'redo', description: 'Redo' },
  
  // Copy/Paste
  'Meta+C': { action: 'copy', description: 'Copy' },
  'Control+C': { action: 'copy', description: 'Copy' },
  'Meta+V': { action: 'paste', description: 'Paste' },
  'Control+V': { action: 'paste', description: 'Paste' },
  
  // Select All
  'Meta+A': { action: 'selectAll', description: 'Select All' },
  'Control+A': { action: 'selectAll', description: 'Select All' },
  
  // Enter
  'Enter': { action: 'pressKey', description: 'Press Enter' },
  
  // Escape
  'Escape': { action: 'pressKey', description: 'Press Escape' },
  
  // Tab
  'Tab': { action: 'acceptSuggestion', description: 'Accept suggestion / Tab' },
};

/**
 * Generate a scenario from recorded actions
 */
export async function generateScenarioFromRecording(
  actions: RawAction[],
  config: Partial<GeneratorConfig> = {}
): Promise<Scenario> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Process and merge actions
  let processedActions = actions;
  if (fullConfig.mergeActions) {
    processedActions = mergeConsecutiveActions(actions, fullConfig.minWaitTime);
  }
  
  // Convert to steps
  let steps = actionsToSteps(processedActions, fullConfig);
  
  // Enhance with LLM if enabled
  if (fullConfig.useLLM && process.env.OPENAI_API_KEY) {
    steps = await enhanceStepsWithLLM(steps, processedActions);
  }
  
  const scenario: Scenario = {
    id: `recorded-${nanoid(8)}`,
    name: fullConfig.name,
    description: fullConfig.description,
    priority: fullConfig.priority,
    tags: fullConfig.tags,
    owner: fullConfig.owner,
    steps,
  };
  
  return scenario;
}

/**
 * Merge consecutive similar actions
 */
function mergeConsecutiveActions(actions: RawAction[], minWaitTime: number): RawAction[] {
  const merged: RawAction[] = [];
  let currentTyping = '';
  let typingStart = 0;
  
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const nextAction = actions[i + 1];
    
    // Merge consecutive typing
    if (action.type === 'type' && action.text) {
      if (!currentTyping) {
        typingStart = action.timestamp;
      }
      currentTyping += action.text;
      
      // If next action is not typing or has significant delay, flush
      const delay = nextAction ? nextAction.timestamp - action.timestamp : Infinity;
      if (!nextAction || nextAction.type !== 'type' || delay > 500) {
        merged.push({
          type: 'type',
          text: currentTyping,
          timestamp: typingStart,
          duration: action.timestamp - typingStart,
        });
        currentTyping = '';
      }
      continue;
    }
    
    // Add explicit waits for significant pauses
    if (nextAction) {
      const delay = nextAction.timestamp - action.timestamp;
      if (delay >= minWaitTime) {
        merged.push(action);
        merged.push({
          type: 'wait',
          duration: delay,
          timestamp: action.timestamp + 100,
        });
        continue;
      }
    }
    
    merged.push(action);
  }
  
  return merged;
}

/**
 * Convert raw actions to scenario steps
 */
function actionsToSteps(actions: RawAction[], config: GeneratorConfig): Step[] {
  const steps: Step[] = [];
  let stepIndex = 1;
  
  for (const action of actions) {
    const step = actionToStep(action, stepIndex, config);
    if (step) {
      steps.push(step);
      stepIndex++;
    }
  }
  
  return steps;
}

/**
 * Convert a single action to a step
 */
function actionToStep(action: RawAction, index: number, config: GeneratorConfig): Step | null {
  const stepId = `step_${index}`;
  
  switch (action.type) {
    case 'keyboard': {
      const keyCombo = formatKeyCombo(action.key, action.keys, action.modifiers);
      const mapping = KEYBOARD_ACTION_MAP[keyCombo];
      
      if (mapping) {
        return {
          id: stepId,
          description: mapping.description,
          action: mapping.action,
          optional: false,
          args: mapping.action === 'pressKey' ? { key: keyCombo } : undefined,
          hints: config.includeHints ? [{ type: 'keyboard', value: keyCombo }] : undefined,
        };
      }
      
      return {
        id: stepId,
        description: `Press ${keyCombo}`,
        action: 'pressKey',
        optional: false,
        args: { key: keyCombo },
        hints: config.includeHints ? [{ type: 'keyboard', value: keyCombo }] : undefined,
      };
    }
    
    case 'type': {
      // Detect if this looks like a command palette search
      const text = action.text || '';
      
      if (text.startsWith('>')) {
        return {
          id: stepId,
          description: `Search command: ${text}`,
          action: 'typeText',
          optional: false,
          args: { text },
          hints: config.includeHints ? [{ type: 'type', value: text }] : undefined,
        };
      }
      
      // Detect chat message
      if (text.length > 20 || text.includes('@')) {
        return {
          id: stepId,
          description: `Send message: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
          action: 'sendChatMessage',
          optional: false,
          args: { message: text },
          hints: config.includeHints ? [{ type: 'type', value: text }] : undefined,
        };
      }
      
      return {
        id: stepId,
        description: `Type: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
        action: 'typeText',
        optional: false,
        args: { text },
        hints: config.includeHints ? [{ type: 'type', value: text }] : undefined,
      };
    }
    
    case 'click': {
      const target = action.target || action.selector || 'unknown element';
      return {
        id: stepId,
        description: `Click on ${target}`,
        action: 'click',
        optional: false,
        args: { target },
        hints: config.includeHints && action.selector 
          ? [{ type: 'click', target: action.selector }] 
          : undefined,
      };
    }
    
    case 'wait': {
      if (!action.duration || action.duration < 500) {
        return null; // Skip very short waits
      }
      return {
        id: stepId,
        description: `Wait ${action.duration}ms`,
        action: 'wait',
        optional: false,
        args: { duration: action.duration },
      };
    }
    
    case 'hover': {
      const target = action.target || action.selector || 'unknown element';
      return {
        id: stepId,
        description: `Hover over ${target}`,
        action: 'hover',
        optional: false,
        args: { target },
        hints: config.includeHints && action.selector
          ? [{ type: 'hover', target: action.selector }]
          : undefined,
      };
    }
    
    default:
      return null;
  }
}

/**
 * Format key combination string
 */
function formatKeyCombo(key?: string, keys?: string[], modifiers?: string[]): string {
  const parts: string[] = [];
  
  if (modifiers) {
    parts.push(...modifiers);
  }
  
  if (keys) {
    parts.push(...keys);
  } else if (key) {
    parts.push(key);
  }
  
  return parts.join('+');
}

/**
 * Enhance steps with LLM for better descriptions
 */
async function enhanceStepsWithLLM(steps: Step[], _actions: RawAction[]): Promise<Step[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return steps;
  
  try {
    const openai = new OpenAI({ apiKey });
    
    const prompt = `You are helping improve recorded VS Code scenario steps.

Given these raw steps from a recording, improve the descriptions to be:
1. Clear and concise
2. Action-oriented (start with a verb)
3. Specific about what's being tested
4. Written in a consistent style

Current steps:
${JSON.stringify(steps.map(s => ({ id: s.id, action: s.action, description: s.description, args: s.args })), null, 2)}

Return a JSON array with improved descriptions:
[
  { "id": "step_1", "description": "improved description" },
  ...
]

Only return the JSON, no explanation.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const responseText = response.choices[0]?.message?.content || '';
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      const improvements = JSON.parse(jsonMatch[0]);
      const improvementMap = new Map<string, string>(improvements.map((i: any) => [i.id, i.description]));
      
      return steps.map(step => ({
        ...step,
        description: improvementMap.get(step.id) ?? step.description,
      }));
    }
  } catch (err) {
    console.warn('LLM enhancement failed, using original descriptions');
  }
  
  return steps;
}

/**
 * Generate scenario YAML from raw actions
 */
export async function generateScenarioYAML(
  actions: RawAction[],
  config: Partial<GeneratorConfig> = {}
): Promise<string> {
  const scenario = await generateScenarioFromRecording(actions, config);
  return scenarioToYAML(scenario);
}

/**
 * Interactive session to annotate recorded actions
 */
export async function interactiveAnnotation(
  actions: RawAction[],
  rl: readline.Interface
): Promise<GeneratorConfig> {
  const ask = (question: string): Promise<string> => {
    return new Promise(resolve => {
      rl.question(question, resolve);
    });
  };

  console.log('\n📝 Scenario Generation Wizard\n');
  console.log(`Recorded ${actions.length} actions.\n`);

  const name = await ask('Scenario name: ') || 'Recorded Scenario';
  const description = await ask('Description: ') || 'Scenario generated from recording';
  
  const priorityInput = await ask('Priority (P0/P1/P2) [P1]: ');
  const priority: Priority = ['P0', 'P1', 'P2'].includes(priorityInput) 
    ? priorityInput as Priority 
    : 'P1';
  
  const tagsInput = await ask('Tags (comma-separated) [recorded]: ');
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : ['recorded'];
  
  const owner = await ask('Owner: ') || undefined;
  
  const useLLMInput = await ask('Use LLM to enhance descriptions? (y/n) [y]: ');
  const useLLM = useLLMInput.toLowerCase() !== 'n';

  return {
    name,
    description,
    priority,
    tags,
    owner,
    useLLM,
    mergeActions: true,
    minWaitTime: 1000,
    includeHints: true,
  };
}

/**
 * Detect semantic action from a sequence of raw actions
 */
export function detectSemanticAction(
  actions: RawAction[],
  startIndex: number
): { action: string; description: string; consumeCount: number } | null {
  const current = actions[startIndex];
  const next = actions[startIndex + 1];
  const nextNext = actions[startIndex + 2];
  
  // Detect: Open Command Palette + Type + Enter = Execute Command
  if (current.type === 'keyboard') {
    const keyCombo = formatKeyCombo(current.key, current.keys, current.modifiers);
    const mapping = KEYBOARD_ACTION_MAP[keyCombo];
    
    if (mapping?.action === 'openCommandPalette' && next?.type === 'type') {
      // Look for Enter after typing
      if (nextNext?.type === 'keyboard' && nextNext.key === 'Enter') {
        return {
          action: 'executeCommand',
          description: `Execute command: ${next.text}`,
          consumeCount: 3,
        };
      }
    }
    
    // Detect: Open Quick Open + Type filename + Enter = Open File
    if (mapping?.action === 'openQuickOpen' && next?.type === 'type') {
      if (nextNext?.type === 'keyboard' && nextNext.key === 'Enter') {
        return {
          action: 'openFile',
          description: `Open file: ${next.text}`,
          consumeCount: 3,
        };
      }
    }
  }
  
  return null;
}

/**
 * Post-process steps to combine semantic actions
 */
export function combineSemanticActions(steps: Step[]): Step[] {
  const combined: Step[] = [];
  let i = 0;
  
  while (i < steps.length) {
    const current = steps[i];
    const next = steps[i + 1];
    const nextNext = steps[i + 2];
    
    // Combine: Open Command Palette + Type + Enter
    if (current.action === 'openCommandPalette' && 
        next?.action === 'typeText' && 
        nextNext?.action === 'pressKey' && nextNext.args?.key === 'Enter') {
      combined.push({
        id: current.id,
        description: `Execute command: ${next.args?.text}`,
        action: 'executeCommand',
        optional: false,
        args: { command: next.args?.text },
      });
      i += 3;
      continue;
    }
    
    // Combine: Open Chat + Type + Enter
    if (current.action === 'openCopilotChat' &&
        next?.action === 'typeText') {
      combined.push(current);
      combined.push({
        id: next.id,
        description: `Send chat message: ${(next.args?.text as string)?.substring(0, 40)}...`,
        action: 'sendChatMessage',
        optional: false,
        args: { message: next.args?.text, waitForResponse: true },
      });
      // Skip the Enter if it follows
      if (nextNext?.action === 'pressKey' && nextNext.args?.key === 'Enter') {
        i += 3;
      } else {
        i += 2;
      }
      continue;
    }
    
    combined.push(current);
    i++;
  }
  
  return combined;
}
