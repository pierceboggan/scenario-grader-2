import { Scenario } from './types';

/**
 * Handoff Generator - Creates artifacts for the PM → Dev → Validate loop
 */

// ============================================================================
// 1. Natural Language → Scenario (for PMs)
// ============================================================================

export interface NaturalLanguageScenario {
  /** What the user is trying to accomplish */
  goal: string;
  /** Step-by-step what should happen (plain English) */
  steps: string[];
  /** Questions we want answered about the UX */
  observations?: string[];
  /** What terms should match our docs */
  terminologyToCheck?: string[];
  /** Priority */
  priority?: 'P0' | 'P1' | 'P2';
  /** Owner */
  owner?: string;
  /** Tags */
  tags?: string[];
}

/**
 * Convert PM's natural language description to a scenario prompt
 * This generates a prompt that can be sent to an LLM to create the full YAML
 */
export function generateScenarioPrompt(input: NaturalLanguageScenario): string {
  return `You are helping a PM create a VS Code scenario for testing a Copilot feature.

## Goal
${input.goal}

## Steps (in plain English)
${input.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

${input.observations ? `## Observations (questions to answer)
${input.observations.map((o, i) => `${i + 1}. ${o}`).join('\n')}` : ''}

${input.terminologyToCheck ? `## Terminology to verify
These terms should appear in the UI: ${input.terminologyToCheck.join(', ')}` : ''}

## Output Format
Generate a YAML scenario file with:
- Descriptive step IDs (snake_case)
- Use semantic actions where available: openCopilotChat, clickModelPicker, selectModel, sendChatMessage, etc.
- Add step-level observations for UX questions
- Include terminologyChecks if terminology was specified
- Priority: ${input.priority || 'P1'}
${input.owner ? `- Owner: ${input.owner}` : ''}
${input.tags ? `- Tags: ${input.tags.join(', ')}` : ''}

Generate the complete YAML:`;
}

// ============================================================================
// 2. Scenario → Implementation Prompt (for devs/LLM)
// ============================================================================

/**
 * Generate a prompt that can be given to Copilot/Claude to implement the feature
 */
export function generateImplementationPrompt(scenario: Scenario): string {
  const acceptanceCriteria = extractAcceptanceCriteria(scenario);
  
  return `# Feature Implementation Request

## Overview
**Feature:** ${scenario.name}
**Priority:** ${scenario.priority}
**Owner:** ${scenario.owner || 'Unassigned'}

## Description
${scenario.description}

## User Journey
The user should be able to:
${scenario.steps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

## Acceptance Criteria
${acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

## UX Requirements
These questions should have positive answers after implementation:

${scenario.observations?.map(o => `- [ ] ${o.question}`).join('\n') || 'No specific observations'}

### Step-specific requirements:
${scenario.steps.filter(s => s.observations?.length).map(s => 
  `**${s.description}:**\n${s.observations!.map(o => `  - [ ] ${o.question}`).join('\n')}`
).join('\n\n')}

${scenario.terminologyChecks?.length ? `## Terminology Requirements
The following terms must appear in the UI (per documentation):
${scenario.terminologyChecks.map(t => `- ${t.uiElement}: ${t.expectedTerms.join(', ')}`).join('\n')}
` : ''}

## Technical Notes
- This will be validated using automated scenario runner
- Screenshots will be captured at each step
- LLM will evaluate UX quality against these criteria

Please implement this feature following VS Code extension best practices.`;
}

/**
 * Extract acceptance criteria from observations
 */
function extractAcceptanceCriteria(scenario: Scenario): string[] {
  const criteria: string[] = [];
  
  // From scenario-level observations
  for (const obs of scenario.observations || []) {
    criteria.push(observationToAcceptanceCriteria(obs.question));
  }
  
  // From step-level observations
  for (const step of scenario.steps) {
    for (const obs of step.observations || []) {
      criteria.push(observationToAcceptanceCriteria(obs.question));
    }
  }
  
  // From terminology checks
  for (const check of scenario.terminologyChecks || []) {
    criteria.push(`UI element "${check.uiElement}" shows terms: ${check.expectedTerms.join(', ')}`);
  }
  
  return [...new Set(criteria)]; // Dedupe
}

/**
 * Convert a question-form observation to an acceptance criteria statement
 */
function observationToAcceptanceCriteria(question: string): string {
  // Transform questions to statements
  // "Is the model picker visible?" → "Model picker is visible"
  // "Can the user understand tradeoffs?" → "User can understand tradeoffs"
  
  let statement = question
    .replace(/^Is the /i, 'The ')
    .replace(/^Is there /i, 'There is ')
    .replace(/^Are there /i, 'There are ')
    .replace(/^Can the user /i, 'User can ')
    .replace(/^Does the /i, 'The ')
    .replace(/^Would a /i, 'A ')
    .replace(/\?$/, '');
  
  // Capitalize first letter
  statement = statement.charAt(0).toUpperCase() + statement.slice(1);
  
  return statement;
}

// ============================================================================
// 3. Gap Report (after running scenario)
// ============================================================================

export interface GapReportItem {
  category: 'missing' | 'partial' | 'complete';
  criterion: string;
  evidence?: string;
  stepId?: string;
}

export interface GapReport {
  scenarioId: string;
  scenarioName: string;
  completionPercentage: number;
  items: GapReportItem[];
  summary: string;
}

/**
 * Generate a gap report from scenario run results
 */
export function generateGapReport(
  scenario: Scenario,
  llmEvaluation: any
): GapReport {
  const items: GapReportItem[] = [];
  
  // Process observation answers
  const observationAnswers = llmEvaluation?.observations || [];
  
  for (const obs of scenario.observations || []) {
    const answer = observationAnswers.find((a: any) => 
      a.question?.toLowerCase().includes(obs.question.toLowerCase().slice(0, 20))
    );
    
    items.push({
      category: categorizeAnswer(answer?.answer),
      criterion: obs.question,
      evidence: answer?.answer,
    });
  }
  
  // Process step observations
  for (const step of scenario.steps) {
    for (const obs of step.observations || []) {
      const answer = observationAnswers.find((a: any) => 
        a.stepId === step.id || 
        a.question?.toLowerCase().includes(obs.question.toLowerCase().slice(0, 20))
      );
      
      items.push({
        category: categorizeAnswer(answer?.answer),
        criterion: obs.question,
        evidence: answer?.answer,
        stepId: step.id,
      });
    }
  }
  
  // Calculate completion
  const complete = items.filter(i => i.category === 'complete').length;
  const total = items.length || 1;
  const completionPercentage = Math.round((complete / total) * 100);
  
  // Generate summary
  const missing = items.filter(i => i.category === 'missing').length;
  const partial = items.filter(i => i.category === 'partial').length;
  
  let summary: string;
  if (completionPercentage === 100) {
    summary = '✅ All acceptance criteria met!';
  } else if (completionPercentage >= 70) {
    summary = `🟡 ${partial + missing} criteria need attention (${missing} missing, ${partial} partial)`;
  } else {
    summary = `🔴 Significant gaps: ${missing} missing, ${partial} partial out of ${total} criteria`;
  }
  
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    completionPercentage,
    items,
    summary,
  };
}

function categorizeAnswer(answer?: string): 'missing' | 'partial' | 'complete' {
  if (!answer) return 'missing';
  
  const lowerAnswer = answer.toLowerCase();
  
  // Negative indicators
  if (lowerAnswer.includes('no,') || 
      lowerAnswer.includes('not visible') ||
      lowerAnswer.includes('not available') ||
      lowerAnswer.includes('missing') ||
      lowerAnswer.includes('doesn\'t') ||
      lowerAnswer.includes('does not')) {
    return 'missing';
  }
  
  // Partial indicators
  if (lowerAnswer.includes('partially') ||
      lowerAnswer.includes('somewhat') ||
      lowerAnswer.includes('could be') ||
      lowerAnswer.includes('but ')) {
    return 'partial';
  }
  
  // Positive indicators
  if (lowerAnswer.includes('yes') ||
      lowerAnswer.includes('visible') ||
      lowerAnswer.includes('clearly') ||
      lowerAnswer.includes('available')) {
    return 'complete';
  }
  
  return 'partial'; // Default to partial if unclear
}

/**
 * Format gap report for display
 */
export function formatGapReport(report: GapReport): string {
  const lines: string[] = [];
  
  lines.push(`# Gap Report: ${report.scenarioName}`);
  lines.push('');
  lines.push(`**Completion:** ${report.completionPercentage}%`);
  lines.push(`**Status:** ${report.summary}`);
  lines.push('');
  
  // Group by category
  const missing = report.items.filter(i => i.category === 'missing');
  const partial = report.items.filter(i => i.category === 'partial');
  const complete = report.items.filter(i => i.category === 'complete');
  
  if (missing.length > 0) {
    lines.push('## ❌ Missing');
    for (const item of missing) {
      lines.push(`- ${item.criterion}`);
      if (item.evidence) lines.push(`  > ${item.evidence}`);
    }
    lines.push('');
  }
  
  if (partial.length > 0) {
    lines.push('## 🟡 Partial');
    for (const item of partial) {
      lines.push(`- ${item.criterion}`);
      if (item.evidence) lines.push(`  > ${item.evidence}`);
    }
    lines.push('');
  }
  
  if (complete.length > 0) {
    lines.push('## ✅ Complete');
    for (const item of complete) {
      lines.push(`- ${item.criterion}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

// ============================================================================
// 4. Iteration Tracker
// ============================================================================

export interface IterationRecord {
  iteration: number;
  date: string;
  completionPercentage: number;
  newlyComplete: string[];
  stillMissing: string[];
  notes?: string;
}

/**
 * Compare two gap reports to track progress
 */
export function compareIterations(
  previous: GapReport,
  current: GapReport
): IterationRecord {
  const prevComplete = new Set(
    previous.items.filter(i => i.category === 'complete').map(i => i.criterion)
  );
  const currComplete = new Set(
    current.items.filter(i => i.category === 'complete').map(i => i.criterion)
  );
  
  const newlyComplete = [...currComplete].filter(c => !prevComplete.has(c));
  const stillMissing = current.items
    .filter(i => i.category === 'missing')
    .map(i => i.criterion);
  
  return {
    iteration: 0, // Caller should set this
    date: new Date().toISOString(),
    completionPercentage: current.completionPercentage,
    newlyComplete,
    stillMissing,
  };
}
