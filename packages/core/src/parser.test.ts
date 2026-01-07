import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseScenarioYAML,
  scenarioToYAML,
  validateScenario,
  patchScenario,
  looksLikeScenario,
  ScenarioParseError,
} from '../src/parser';
import { Scenario } from '../src/types';

describe('Parser', () => {
  describe('parseScenarioYAML', () => {
    it('should parse a valid minimal scenario', () => {
      const yaml = `
id: test-scenario
name: Test Scenario
description: A test scenario
priority: P1
steps:
  - id: step_1
    description: Do something
    action: click
    optional: false
`;
      const scenario = parseScenarioYAML(yaml);
      
      expect(scenario.id).toBe('test-scenario');
      expect(scenario.name).toBe('Test Scenario');
      expect(scenario.priority).toBe('P1');
      expect(scenario.steps).toHaveLength(1);
    });

    it('should parse a full scenario with all fields', () => {
      const yaml = `
id: full-scenario
name: Full Scenario Test
description: Testing all fields
priority: P0
version: "1.0"
author: test-author
owner: test-team
tags:
  - copilot
  - chat
environment:
  vscodeVersion: stable
preconditions:
  - VS Code is running
steps:
  - id: step_1
    description: Open chat
    action: openCopilotChat
    optional: false
    timeout: 5000
    hints:
      - type: keyboard
        value: "Cmd+Shift+I"
checkpoints:
  - id: check_1
    type: elementVisible
    afterStep: step_1
    verify: "Chat is visible"
observations:
  - id: obs_1
    question: "Is the UI clear?"
    category: usability
`;
      const scenario = parseScenarioYAML(yaml);
      
      expect(scenario.id).toBe('full-scenario');
      expect(scenario.version).toBe('1.0');
      expect(scenario.tags).toContain('copilot');
      expect(scenario.environment?.vscodeVersion).toBe('stable');
      expect(scenario.preconditions).toHaveLength(1);
      expect(scenario.checkpoints).toHaveLength(1);
      expect(scenario.observations).toHaveLength(1);
    });

    it('should throw ScenarioParseError for invalid YAML', () => {
      const invalidYaml = `
id: test
name: [invalid
`;
      expect(() => parseScenarioYAML(invalidYaml)).toThrow(ScenarioParseError);
    });

    it('should throw ScenarioParseError for missing required fields', () => {
      const missingFields = `
id: test
# missing name, description, priority, steps
`;
      expect(() => parseScenarioYAML(missingFields)).toThrow(ScenarioParseError);
    });

    it('should throw ScenarioParseError for invalid priority', () => {
      const invalidPriority = `
id: test
name: Test
description: Test
priority: P5
steps:
  - id: step_1
    description: Do something
    action: click
    optional: false
`;
      expect(() => parseScenarioYAML(invalidPriority)).toThrow(ScenarioParseError);
    });
  });

  describe('scenarioToYAML', () => {
    const sampleScenario: Scenario = {
      id: 'test-scenario',
      name: 'Test Scenario',
      description: 'A test scenario',
      priority: 'P1',
      steps: [
        {
          id: 'step_1',
          description: 'Do something',
          action: 'click',
          optional: false,
        },
      ],
    };

    it('should convert scenario to YAML string', () => {
      const yaml = scenarioToYAML(sampleScenario);
      
      expect(yaml).toContain('test-scenario');
      expect(yaml).toContain('Test Scenario');
      expect(yaml).toContain('P1');
    });

    it('should be reversible (parse back to same scenario)', () => {
      const yaml = scenarioToYAML(sampleScenario);
      const parsed = parseScenarioYAML(yaml);
      
      expect(parsed.id).toBe(sampleScenario.id);
      expect(parsed.name).toBe(sampleScenario.name);
      expect(parsed.steps).toHaveLength(sampleScenario.steps.length);
    });
  });

  describe('validateScenario', () => {
    it('should return valid for a correct scenario object', () => {
      const scenario = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        steps: [
          { id: 'step_1', description: 'Do', action: 'click', optional: false },
        ],
      };
      
      const result = validateScenario(scenario);
      expect(result.valid).toBe(true);
    });

    it('should return errors for invalid scenario', () => {
      const scenario = {
        id: 'test',
        // missing required fields
      };
      
      const result = validateScenario(scenario);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should validate step structure', () => {
      const scenario = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        steps: [
          { id: 'step_1' }, // missing description, action, optional
        ],
      };
      
      const result = validateScenario(scenario);
      expect(result.valid).toBe(false);
    });
  });

  describe('patchScenario', () => {
    const baseScenario: Scenario = {
      id: 'test',
      name: 'Test',
      description: 'Original',
      priority: 'P1',
      steps: [
        { id: 'step_1', description: 'Step 1', action: 'click', optional: false },
      ],
    };

    it('should patch simple fields', () => {
      const patched = patchScenario(baseScenario, {
        description: 'Updated description',
        priority: 'P0',
      });
      
      expect(patched.description).toBe('Updated description');
      expect(patched.priority).toBe('P0');
      expect(patched.name).toBe('Test'); // unchanged
    });

    it('should not mutate original scenario', () => {
      const patched = patchScenario(baseScenario, { name: 'New Name' });
      
      expect(patched.name).toBe('New Name');
      expect(baseScenario.name).toBe('Test');
    });
  });

  describe('looksLikeScenario', () => {
    it('should return true for scenario-like YAML', () => {
      const yaml = `
id: test
name: Test
steps:
  - id: step_1
`;
      expect(looksLikeScenario(yaml)).toBe(true);
    });

    it('should return false for non-scenario YAML', () => {
      const yaml = `
config:
  setting: value
`;
      expect(looksLikeScenario(yaml)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(looksLikeScenario('')).toBe(false);
    });
  });
});
