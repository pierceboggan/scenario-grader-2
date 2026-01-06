import { Scenario, Step, Hint } from './types';
import { nanoid } from 'nanoid';

/**
 * Mock Natural Language to YAML Compiler
 * 
 * In production, this would use Azure AI Foundry to parse
 * natural language into structured YAML scenarios.
 */

// Common action mappings
const ACTION_PATTERNS: { pattern: RegExp; action: string; extractArgs: (match: RegExpMatchArray) => Record<string, any> }[] = [
  {
    pattern: /launch\s+(?:vs\s*code|vscode)\s*(?:with\s+profile\s+["']?([^"']+)["']?)?/i,
    action: 'launchVSCodeWithProfile',
    extractArgs: (match) => ({ profileName: match[1] || 'Default' }),
  },
  {
    pattern: /open\s+(?:the\s+)?command\s+palette/i,
    action: 'openCommandPalette',
    extractArgs: () => ({}),
  },
  {
    pattern: /type\s+["']([^"']+)["']/i,
    action: 'typeText',
    extractArgs: (match) => ({ text: match[1] }),
  },
  {
    pattern: /click\s+(?:on\s+)?(?:the\s+)?["']?([^"']+)["']?/i,
    action: 'click',
    extractArgs: (match) => ({ target: match[1] }),
  },
  {
    pattern: /wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|s)/i,
    action: 'wait',
    extractArgs: (match) => ({ duration: parseInt(match[1], 10) * 1000 }),
  },
  {
    pattern: /open\s+(?:the\s+)?copilot\s+chat/i,
    action: 'openCopilotChat',
    extractArgs: () => ({}),
  },
  {
    pattern: /send\s+(?:a\s+)?(?:chat\s+)?message\s+["']([^"']+)["']/i,
    action: 'sendChatMessage',
    extractArgs: (match) => ({ message: match[1] }),
  },
  {
    pattern: /verify\s+(?:that\s+)?(?:the\s+)?(?:user\s+)?(?:is\s+)?signed\s+in\s+(?:as\s+)?["']?([^"']+)["']?/i,
    action: 'assertSignedInAccount',
    extractArgs: (match) => ({ provider: 'github', expectedAccount: match[1] }),
  },
  {
    pattern: /configure\s+(?:an?\s+)?mcp\s+server/i,
    action: 'configureMCPServer',
    extractArgs: () => ({}),
  },
  {
    pattern: /open\s+(?:the\s+)?settings/i,
    action: 'openSettings',
    extractArgs: () => ({}),
  },
  {
    pattern: /press\s+["']?([^"']+)["']?/i,
    action: 'pressKey',
    extractArgs: (match) => ({ key: match[1] }),
  },
];

// Hint pattern extraction
const HINT_PATTERN = /\(([^)]+)\)/g;

function extractHints(text: string): Hint[] {
  const hints: Hint[] = [];
  let match;
  
  while ((match = HINT_PATTERN.exec(text)) !== null) {
    const hintText = match[1].toLowerCase();
    
    if (hintText.includes('click')) {
      hints.push({ type: 'click', target: hintText.replace(/click\s+(?:on\s+)?(?:the\s+)?/i, '') });
    } else if (hintText.includes('type') || hintText.includes('enter')) {
      hints.push({ type: 'type', value: hintText.replace(/type|enter/gi, '').trim() });
    } else if (hintText.includes('wait')) {
      const duration = hintText.match(/(\d+)/)?.[1];
      hints.push({ type: 'wait', timeout: duration ? parseInt(duration, 10) * 1000 : 2000 });
    } else if (hintText.includes('hover')) {
      hints.push({ type: 'hover', target: hintText.replace(/hover\s+(?:over\s+)?(?:the\s+)?/i, '') });
    } else if (hintText.includes('press') || hintText.includes('keyboard')) {
      hints.push({ type: 'keyboard', value: hintText.replace(/press|keyboard/gi, '').trim() });
    }
  }
  
  return hints;
}

function parseStep(line: string, index: number): Step {
  // Remove hint annotations for action matching
  const cleanLine = line.replace(HINT_PATTERN, '').trim();
  const hints = extractHints(line);
  
  // Try to match known action patterns
  for (const { pattern, action, extractArgs } of ACTION_PATTERNS) {
    const match = cleanLine.match(pattern);
    if (match) {
      return {
        id: `step_${index + 1}`,
        description: cleanLine,
        action,
        args: extractArgs(match),
        hints: hints.length > 0 ? hints : undefined,
        optional: false,
      };
    }
  }
  
  // Default to generic action
  return {
    id: `step_${index + 1}`,
    description: cleanLine,
    action: 'performAction',
    args: { description: cleanLine },
    hints: hints.length > 0 ? hints : undefined,
    optional: false,
  };
}

/**
 * Compile natural language description into a Scenario
 */
export async function compileNaturalLanguage(input: string): Promise<Scenario> {
  // Simulate API latency
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));
  
  const lines = input.split('\n').filter((l) => l.trim());
  
  // Extract title (first line or generate from content)
  let title = 'Generated Scenario';
  let description = input;
  const steps: Step[] = [];
  
  // Check if first line looks like a title
  if (lines.length > 0 && lines[0].length < 100 && !lines[0].match(/^\d+\./)) {
    title = lines[0].trim();
    description = lines.slice(1).join('\n').trim() || input;
  }
  
  // Parse numbered or bulleted steps
  const stepLines = lines.filter((l) => 
    l.match(/^\s*(\d+[.):]|\*|-|•)\s+/) || 
    l.toLowerCase().includes('then ') ||
    l.toLowerCase().includes('next ') ||
    l.toLowerCase().includes('finally ')
  );
  
  if (stepLines.length > 0) {
    stepLines.forEach((line, index) => {
      const cleanLine = line.replace(/^\s*(\d+[.):]|\*|-|•)\s+/, '').trim();
      if (cleanLine) {
        steps.push(parseStep(cleanLine, index));
      }
    });
  } else {
    // Try to split on sentence boundaries
    const sentences = input.split(/[.!?]+/).filter((s) => s.trim());
    sentences.forEach((sentence, index) => {
      const trimmed = sentence.trim();
      if (trimmed && trimmed.length > 10) {
        steps.push(parseStep(trimmed, index));
      }
    });
  }
  
  // Ensure we have at least one step
  if (steps.length === 0) {
    steps.push({
      id: 'step_1',
      description: input.slice(0, 200),
      action: 'performAction',
      args: { description: input },
      optional: false,
    });
  }
  
  // Generate scenario
  const scenario: Scenario = {
    id: `scenario_${nanoid(8)}`,
    name: title,
    owner: '@team',
    tags: extractTags(input),
    description: description.slice(0, 500),
    priority: 'P1',
    environment: {
      vscodeTarget: 'desktop',
      vscodeVersion: 'stable',
      platform: 'macOS',
      copilotChannel: 'stable',
    },
    preconditions: [
      'Baseline sandbox exists',
      'VS Code is not running',
    ],
    steps,
    assertions: generateDefaultAssertions(steps),
    outputs: {
      captureVideo: false,
      storeChatTranscript: input.toLowerCase().includes('chat') || input.toLowerCase().includes('copilot'),
      storeLogs: true,
    },
  };
  
  return scenario;
}

function extractTags(input: string): string[] {
  const tags: string[] = [];
  const lowered = input.toLowerCase();
  
  if (lowered.includes('mcp')) tags.push('mcp');
  if (lowered.includes('copilot')) tags.push('copilot');
  if (lowered.includes('chat')) tags.push('chat');
  if (lowered.includes('extension')) tags.push('extensions');
  if (lowered.includes('debug')) tags.push('debugging');
  if (lowered.includes('git')) tags.push('git');
  if (lowered.includes('terminal')) tags.push('terminal');
  if (lowered.includes('setting')) tags.push('settings');
  
  return tags.length > 0 ? tags : ['general'];
}

function generateDefaultAssertions(_steps: Step[]): Scenario['assertions'] {
  const assertions: Scenario['assertions'] = [];
  
  // Add a completion checkpoint
  assertions.push({
    id: 'scenario_completes',
    type: 'custom',
    description: 'Scenario completes without errors',
  });
  
  return assertions;
}

/**
 * Generate a diff between two scenarios
 */
export function generateScenarioDiff(
  original: Scenario,
  modified: Scenario
): { field: string; original: any; modified: any }[] {
  const diffs: { field: string; original: any; modified: any }[] = [];
  
  const compareFields = ['name', 'description', 'priority', 'tags', 'preconditions'];
  
  for (const field of compareFields) {
    const origValue = original[field as keyof Scenario];
    const modValue = modified[field as keyof Scenario];
    
    if (JSON.stringify(origValue) !== JSON.stringify(modValue)) {
      diffs.push({ field, original: origValue, modified: modValue });
    }
  }
  
  // Compare steps
  if (original.steps.length !== modified.steps.length) {
    diffs.push({
      field: 'steps.length',
      original: original.steps.length,
      modified: modified.steps.length,
    });
  }
  
  return diffs;
}
