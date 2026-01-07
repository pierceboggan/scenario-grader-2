import { Page } from 'playwright';
import { z } from 'zod';

// ============================================================================
// Feature Discovery Tracking
// ============================================================================
// Track which features users naturally discover vs. miss during scenarios.
// This helps product teams identify hidden gems that need better visibility.

/**
 * Entry point through which a feature can be discovered
 */
export const EntryPointSchema = z.object({
  /** Type of entry point */
  type: z.enum([
    'keyboard',      // Keyboard shortcut
    'menu',          // Menu item
    'context-menu',  // Right-click context menu
    'command-palette', // Command palette
    'button',        // UI button
    'notification',  // Notification action
    'quick-action',  // Quick action in editor
    'welcome',       // Welcome page
    'walkthrough',   // Walkthrough step
  ]),
  /** Identifier (shortcut, menu path, command name, etc.) */
  identifier: z.string(),
  /** Human-readable label */
  label: z.string().optional(),
  /** CSS selector to detect if used */
  selector: z.string().optional(),
  /** Keyboard shortcut if applicable */
  shortcut: z.string().optional(),
});
export type EntryPoint = z.infer<typeof EntryPointSchema>;

/**
 * Feature to track discovery for
 */
export const FeatureDefinitionSchema = z.object({
  /** Unique feature ID */
  id: z.string(),
  /** Feature name */
  name: z.string(),
  /** Feature description */
  description: z.string().optional(),
  /** Category for grouping */
  category: z.string().optional(),
  /** All possible entry points to discover this feature */
  entryPoints: z.array(EntryPointSchema),
  /** Expected/ideal entry point for this context */
  preferredEntryPoint: z.string().optional(),
  /** Whether feature is critical to the workflow */
  critical: z.boolean().default(false),
});
export type FeatureDefinition = z.infer<typeof FeatureDefinitionSchema>;

/**
 * Feature discovery tracking configuration
 */
export const FeatureDiscoveryConfigSchema = z.object({
  /** Enable feature discovery tracking */
  enabled: z.boolean().default(false),
  /** Features to track */
  features: z.array(FeatureDefinitionSchema),
  /** Track all interactions (not just defined features) */
  trackAllInteractions: z.boolean().default(false),
  /** Capture screenshots when features are discovered */
  captureScreenshots: z.boolean().default(false),
});
export type FeatureDiscoveryConfig = z.infer<typeof FeatureDiscoveryConfigSchema>;

/**
 * Record of a feature discovery event
 */
export interface FeatureDiscoveryEvent {
  featureId: string;
  featureName: string;
  entryPointUsed: EntryPoint;
  wasPreferred: boolean;
  timestamp: string;
  stepId?: string;
  timeToDiscover?: number; // ms from scenario start
  screenshot?: string;
}

/**
 * Feature that was NOT discovered
 */
export interface MissedFeature {
  featureId: string;
  featureName: string;
  isCritical: boolean;
  availableEntryPoints: EntryPoint[];
  suggestedImprovements?: string[];
}

/**
 * Complete discovery tracking result
 */
export interface FeatureDiscoveryResult {
  enabled: boolean;
  trackedFeatures: number;
  discoveredFeatures: FeatureDiscoveryEvent[];
  missedFeatures: MissedFeature[];
  discoveryRate: number; // 0-100
  criticalMissed: number;
  preferredEntryPointRate: number; // How often users found the ideal path
  interactionHeatmap?: InteractionHeatmap;
}

/**
 * Heatmap of all interactions
 */
export interface InteractionHeatmap {
  keyboards: Record<string, number>;
  clicks: Record<string, number>;
  commands: Record<string, number>;
}

// ============================================================================
// Predefined Feature Definitions for VS Code/Copilot
// ============================================================================

export const COPILOT_FEATURES: FeatureDefinition[] = [
  {
    id: 'copilot-chat',
    name: 'Copilot Chat',
    description: 'Open the Copilot Chat panel',
    category: 'copilot',
    critical: true,
    entryPoints: [
      { type: 'keyboard', identifier: 'Cmd+Shift+I', label: 'Keyboard shortcut' },
      { type: 'keyboard', identifier: 'Ctrl+Shift+I', label: 'Keyboard shortcut (Windows)' },
      { type: 'menu', identifier: 'View > Chat', label: 'Menu bar' },
      { type: 'command-palette', identifier: 'GitHub Copilot: Open Chat', label: 'Command palette' },
      { type: 'button', identifier: 'chat-button', selector: '[aria-label*="Chat"]', label: 'Activity bar button' },
    ],
    preferredEntryPoint: 'Cmd+Shift+I',
  },
  {
    id: 'inline-chat',
    name: 'Inline Chat',
    description: 'Open inline chat in the editor',
    category: 'copilot',
    critical: true,
    entryPoints: [
      { type: 'keyboard', identifier: 'Cmd+I', label: 'Keyboard shortcut' },
      { type: 'keyboard', identifier: 'Ctrl+I', label: 'Keyboard shortcut (Windows)' },
      { type: 'context-menu', identifier: 'Copilot > Start Inline Chat', label: 'Right-click menu' },
      { type: 'command-palette', identifier: 'Inline Chat: Start', label: 'Command palette' },
      { type: 'quick-action', identifier: 'sparkle-button', selector: '.inline-chat-sparkle', label: 'Sparkle icon' },
    ],
    preferredEntryPoint: 'Cmd+I',
  },
  {
    id: 'inline-suggestions',
    name: 'Inline Code Suggestions',
    description: 'Accept inline code completions',
    category: 'copilot',
    critical: true,
    entryPoints: [
      { type: 'keyboard', identifier: 'Tab', label: 'Accept with Tab' },
      { type: 'keyboard', identifier: 'Cmd+Right', label: 'Accept word' },
      { type: 'keyboard', identifier: 'Cmd+]', label: 'Cycle next suggestion' },
    ],
    preferredEntryPoint: 'Tab',
  },
  {
    id: 'agent-mode',
    name: 'Copilot Agent Mode',
    description: 'Switch to agentic multi-step mode',
    category: 'copilot',
    critical: false,
    entryPoints: [
      { type: 'button', identifier: 'agent-toggle', selector: '[aria-label*="Agent"]', label: 'Mode toggle in chat' },
      { type: 'menu', identifier: 'Chat mode dropdown', label: 'Mode dropdown' },
    ],
  },
  {
    id: 'next-edit-suggestions',
    name: 'Next Edit Suggestions',
    description: 'Accept AI-suggested next edit location',
    category: 'copilot',
    critical: false,
    entryPoints: [
      { type: 'keyboard', identifier: 'Tab', label: 'Accept suggestion' },
      { type: 'keyboard', identifier: 'Escape', label: 'Dismiss' },
      { type: 'button', identifier: 'nes-gutter', selector: '.next-edit-decoration', label: 'Gutter decoration' },
    ],
  },
  {
    id: 'code-review',
    name: 'Copilot Code Review',
    description: 'Request code review from Copilot',
    category: 'copilot',
    critical: false,
    entryPoints: [
      { type: 'context-menu', identifier: 'Copilot > Review Selection', label: 'Right-click menu' },
      { type: 'command-palette', identifier: 'GitHub Copilot: Review', label: 'Command palette' },
      { type: 'button', identifier: 'review-button', selector: '[aria-label*="Review"]', label: 'SCM view button' },
    ],
  },
  {
    id: 'explain-code',
    name: 'Explain Code',
    description: 'Get explanation of selected code',
    category: 'copilot',
    critical: false,
    entryPoints: [
      { type: 'context-menu', identifier: 'Copilot > Explain This', label: 'Right-click menu' },
      { type: 'command-palette', identifier: 'GitHub Copilot: Explain This', label: 'Command palette' },
      { type: 'quick-action', identifier: 'explain-action', label: 'Quick action' },
    ],
  },
  {
    id: 'generate-tests',
    name: 'Generate Tests',
    description: 'Generate unit tests for code',
    category: 'copilot',
    critical: false,
    entryPoints: [
      { type: 'context-menu', identifier: 'Copilot > Generate Tests', label: 'Right-click menu' },
      { type: 'command-palette', identifier: 'GitHub Copilot: Generate Tests', label: 'Command palette' },
    ],
  },
  {
    id: 'fix-code',
    name: 'Fix Code',
    description: 'Fix code issues with Copilot',
    category: 'copilot',
    critical: false,
    entryPoints: [
      { type: 'quick-action', identifier: 'fix-action', selector: '.quickfix-action', label: 'Quick fix lightbulb' },
      { type: 'context-menu', identifier: 'Copilot > Fix This', label: 'Right-click menu' },
      { type: 'notification', identifier: 'fix-notification', label: 'Error notification action' },
    ],
  },
];

// ============================================================================
// Feature Discovery Tracker Class
// ============================================================================

export class FeatureDiscoveryTracker {
  private config: FeatureDiscoveryConfig;
  private discoveredFeatures: Map<string, FeatureDiscoveryEvent> = new Map();
  private allInteractions: InteractionHeatmap = {
    keyboards: {},
    clicks: {},
    commands: {},
  };
  private startTime: number = Date.now();
  private currentStepId?: string;
  private page?: Page;

  constructor(config: FeatureDiscoveryConfig) {
    this.config = config;
  }

  /**
   * Start tracking on a page
   */
  async start(page: Page): Promise<void> {
    if (!this.config.enabled) return;

    this.page = page;
    this.startTime = Date.now();
    this.discoveredFeatures.clear();
    this.allInteractions = { keyboards: {}, clicks: {}, commands: {} };

    // Inject interaction tracking
    await page.evaluate(() => {
      const win = window as any;
      win.__featureDiscovery = {
        keyboards: [],
        clicks: [],
        commands: [],
      };

      // Track keyboard events
      document.addEventListener('keydown', (e: KeyboardEvent) => {
        const parts = [];
        if (e.metaKey || e.ctrlKey) parts.push(e.metaKey ? 'Cmd' : 'Ctrl');
        if (e.shiftKey) parts.push('Shift');
        if (e.altKey) parts.push('Alt');
        parts.push(e.key);
        const combo = parts.join('+');
        win.__featureDiscovery.keyboards.push({
          combo,
          timestamp: Date.now(),
        });
      }, true);

      // Track clicks
      document.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const selector = target.tagName.toLowerCase() + 
          (target.id ? `#${target.id}` : '') +
          (target.className ? `.${target.className.split(' ').join('.')}` : '');
        const ariaLabel = target.getAttribute('aria-label');
        win.__featureDiscovery.clicks.push({
          selector,
          ariaLabel,
          timestamp: Date.now(),
        });
      }, true);
    });
  }

  /**
   * Set current step for correlation
   */
  setCurrentStep(stepId: string): void {
    this.currentStepId = stepId;
  }

  /**
   * Collect interactions and detect feature discoveries
   */
  async collect(): Promise<FeatureDiscoveryEvent[]> {
    if (!this.config.enabled || !this.page) return [];

    const interactions = await this.page.evaluate(() => {
      const win = window as any;
      const data = { ...win.__featureDiscovery };
      // Clear collected
      win.__featureDiscovery = { keyboards: [], clicks: [], commands: [] };
      return data;
    });

    const newDiscoveries: FeatureDiscoveryEvent[] = [];

    // Process keyboard interactions
    for (const kb of interactions.keyboards) {
      this.allInteractions.keyboards[kb.combo] = 
        (this.allInteractions.keyboards[kb.combo] || 0) + 1;

      // Check if this discovers a feature
      for (const feature of this.config.features) {
        if (this.discoveredFeatures.has(feature.id)) continue;

        const entryPoint = feature.entryPoints.find(
          ep => ep.type === 'keyboard' && ep.identifier === kb.combo
        );

        if (entryPoint) {
          const event: FeatureDiscoveryEvent = {
            featureId: feature.id,
            featureName: feature.name,
            entryPointUsed: entryPoint,
            wasPreferred: feature.preferredEntryPoint === kb.combo,
            timestamp: new Date(kb.timestamp).toISOString(),
            stepId: this.currentStepId,
            timeToDiscover: kb.timestamp - this.startTime,
          };
          this.discoveredFeatures.set(feature.id, event);
          newDiscoveries.push(event);
        }
      }
    }

    // Process click interactions
    for (const click of interactions.clicks) {
      const key = click.ariaLabel || click.selector;
      this.allInteractions.clicks[key] = 
        (this.allInteractions.clicks[key] || 0) + 1;

      // Check if this discovers a feature via button/quick-action
      for (const feature of this.config.features) {
        if (this.discoveredFeatures.has(feature.id)) continue;

        const entryPoint = feature.entryPoints.find(ep => {
          if (ep.type !== 'button' && ep.type !== 'quick-action') return false;
          if (ep.selector && click.selector.includes(ep.selector)) return true;
          if (click.ariaLabel && ep.label && click.ariaLabel.includes(ep.label)) return true;
          return false;
        });

        if (entryPoint) {
          const event: FeatureDiscoveryEvent = {
            featureId: feature.id,
            featureName: feature.name,
            entryPointUsed: entryPoint,
            wasPreferred: feature.preferredEntryPoint === entryPoint.identifier,
            timestamp: new Date(click.timestamp).toISOString(),
            stepId: this.currentStepId,
            timeToDiscover: click.timestamp - this.startTime,
          };
          this.discoveredFeatures.set(feature.id, event);
          newDiscoveries.push(event);
        }
      }
    }

    return newDiscoveries;
  }

  /**
   * Mark a feature as discovered (called by step actions)
   */
  markDiscovered(featureId: string, entryPoint: EntryPoint): void {
    if (this.discoveredFeatures.has(featureId)) return;

    const feature = this.config.features.find(f => f.id === featureId);
    if (!feature) return;

    this.discoveredFeatures.set(featureId, {
      featureId,
      featureName: feature.name,
      entryPointUsed: entryPoint,
      wasPreferred: feature.preferredEntryPoint === entryPoint.identifier,
      timestamp: new Date().toISOString(),
      stepId: this.currentStepId,
      timeToDiscover: Date.now() - this.startTime,
    });
  }

  /**
   * Get final results
   */
  getResults(): FeatureDiscoveryResult {
    const discoveredList = Array.from(this.discoveredFeatures.values());
    const discoveredIds = new Set(discoveredList.map(d => d.featureId));

    const missedFeatures: MissedFeature[] = this.config.features
      .filter(f => !discoveredIds.has(f.id))
      .map(f => ({
        featureId: f.id,
        featureName: f.name,
        isCritical: f.critical,
        availableEntryPoints: f.entryPoints,
        suggestedImprovements: this.getSuggestionsForMissedFeature(f),
      }));

    const preferredCount = discoveredList.filter(d => d.wasPreferred).length;

    return {
      enabled: this.config.enabled,
      trackedFeatures: this.config.features.length,
      discoveredFeatures: discoveredList,
      missedFeatures,
      discoveryRate: this.config.features.length > 0
        ? (discoveredList.length / this.config.features.length) * 100
        : 0,
      criticalMissed: missedFeatures.filter(m => m.isCritical).length,
      preferredEntryPointRate: discoveredList.length > 0
        ? (preferredCount / discoveredList.length) * 100
        : 0,
      interactionHeatmap: this.config.trackAllInteractions 
        ? this.allInteractions 
        : undefined,
    };
  }

  private getSuggestionsForMissedFeature(feature: FeatureDefinition): string[] {
    const suggestions: string[] = [];

    // Check if user tried related shortcuts
    const keyboardEntries = feature.entryPoints.filter(e => e.type === 'keyboard');
    for (const ep of keyboardEntries) {
      // Check for close attempts (e.g., Cmd+Shift+P when it should be Cmd+Shift+I)
      const similarKeys = Object.keys(this.allInteractions.keyboards)
        .filter(k => this.isSimilarShortcut(k, ep.identifier));
      if (similarKeys.length > 0) {
        suggestions.push(
          `User tried ${similarKeys.join(', ')} - consider making ${ep.identifier} more discoverable`
        );
      }
    }

    if (feature.critical) {
      suggestions.push('This is a critical feature - consider adding onboarding guidance');
    }

    if (feature.entryPoints.length === 1) {
      suggestions.push('Feature has only one entry point - consider adding alternatives');
    }

    return suggestions;
  }

  private isSimilarShortcut(a: string, b: string): boolean {
    const partsA = a.split('+');
    const partsB = b.split('+');
    // Same modifiers, different key
    const modsA = partsA.slice(0, -1).sort().join('+');
    const modsB = partsB.slice(0, -1).sort().join('+');
    return modsA === modsB && partsA[partsA.length - 1] !== partsB[partsB.length - 1];
  }
}

// ============================================================================
// Report Generation
// ============================================================================

export function generateFeatureDiscoveryReport(result: FeatureDiscoveryResult): string {
  const lines: string[] = [];

  lines.push('# Feature Discovery Report');
  lines.push('');

  if (!result.enabled) {
    lines.push('Feature discovery tracking was not enabled.');
    return lines.join('\n');
  }

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Features Tracked | ${result.trackedFeatures} |`);
  lines.push(`| Features Discovered | ${result.discoveredFeatures.length} |`);
  lines.push(`| Features Missed | ${result.missedFeatures.length} |`);
  lines.push(`| Discovery Rate | ${result.discoveryRate.toFixed(1)}% |`);
  lines.push(`| Preferred Entry Point Rate | ${result.preferredEntryPointRate.toFixed(1)}% |`);
  lines.push(`| Critical Features Missed | ${result.criticalMissed} |`);
  lines.push('');

  // Discovered features
  if (result.discoveredFeatures.length > 0) {
    lines.push('## Discovered Features');
    lines.push('');
    lines.push('| Feature | Entry Point | Was Preferred | Time to Discover |');
    lines.push('|---------|-------------|---------------|------------------|');
    for (const f of result.discoveredFeatures) {
      const time = f.timeToDiscover ? `${(f.timeToDiscover / 1000).toFixed(1)}s` : 'N/A';
      const preferred = f.wasPreferred ? '✅' : '❌';
      lines.push(`| ${f.featureName} | ${f.entryPointUsed.type}: ${f.entryPointUsed.identifier} | ${preferred} | ${time} |`);
    }
    lines.push('');
  }

  // Missed features
  if (result.missedFeatures.length > 0) {
    lines.push('## Missed Features');
    lines.push('');
    
    const critical = result.missedFeatures.filter(m => m.isCritical);
    const nonCritical = result.missedFeatures.filter(m => !m.isCritical);

    if (critical.length > 0) {
      lines.push('### ⚠️ Critical Features Not Discovered');
      lines.push('');
      for (const m of critical) {
        lines.push(`**${m.featureName}**`);
        lines.push('');
        lines.push('Available entry points:');
        for (const ep of m.availableEntryPoints) {
          lines.push(`  - ${ep.type}: ${ep.identifier} ${ep.label ? `(${ep.label})` : ''}`);
        }
        if (m.suggestedImprovements && m.suggestedImprovements.length > 0) {
          lines.push('');
          lines.push('Suggestions:');
          for (const s of m.suggestedImprovements) {
            lines.push(`  - ${s}`);
          }
        }
        lines.push('');
      }
    }

    if (nonCritical.length > 0) {
      lines.push('### Other Missed Features');
      lines.push('');
      lines.push('| Feature | Entry Points |');
      lines.push('|---------|--------------|');
      for (const m of nonCritical) {
        const eps = m.availableEntryPoints.map(e => `${e.type}`).join(', ');
        lines.push(`| ${m.featureName} | ${eps} |`);
      }
      lines.push('');
    }
  }

  // Interaction heatmap
  if (result.interactionHeatmap) {
    lines.push('## Interaction Heatmap');
    lines.push('');
    
    const topKeyboards = Object.entries(result.interactionHeatmap.keyboards)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    if (topKeyboards.length > 0) {
      lines.push('### Top Keyboard Shortcuts Used');
      lines.push('');
      lines.push('| Shortcut | Count |');
      lines.push('|----------|-------|');
      for (const [shortcut, count] of topKeyboards) {
        lines.push(`| ${shortcut} | ${count} |`);
      }
      lines.push('');
    }
  }

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');
  
  if (result.criticalMissed > 0) {
    lines.push(`🚨 **${result.criticalMissed} critical feature(s) were not discovered.** Consider:`);
    lines.push('- Adding onboarding guidance');
    lines.push('- Making entry points more visible');
    lines.push('- Adding contextual hints');
    lines.push('');
  }

  if (result.preferredEntryPointRate < 50) {
    lines.push('⚠️ **Users often used non-preferred entry points.** Consider:');
    lines.push('- Improving discoverability of preferred shortcuts');
    lines.push('- Adding keyboard shortcut hints in the UI');
    lines.push('');
  }

  if (result.discoveryRate < 70) {
    lines.push('💡 **Low overall discovery rate.** Consider:');
    lines.push('- Feature walkthroughs');
    lines.push('- Progressive disclosure');
    lines.push('- Contextual recommendations');
  }

  return lines.join('\n');
}
