import { describe, it, expect } from 'vitest';
import {
  ScenarioSchema,
  StepSchema,
  EnvironmentSchema,
  CheckpointSchema,
  ObservationSchema,
  TelemetryConfigSchema,
  ErrorRecoveryConfigSchema,
} from '../src/types';

describe('Types and Schemas', () => {
  describe('ScenarioSchema', () => {
    it('should validate minimal valid scenario', () => {
      const scenario = {
        id: 'test-id',
        name: 'Test Name',
        description: 'Test description',
        priority: 'P1',
        steps: [
          { id: 'step_1', description: 'Do something', action: 'click', optional: false },
        ],
      };
      
      const result = ScenarioSchema.safeParse(scenario);
      expect(result.success).toBe(true);
    });

    it('should reject invalid priority', () => {
      const scenario = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        priority: 'P5', // Invalid
        steps: [],
      };
      
      const result = ScenarioSchema.safeParse(scenario);
      expect(result.success).toBe(false);
    });

    it('should validate all priority levels', () => {
      for (const priority of ['P0', 'P1', 'P2']) {
        const scenario = {
          id: 'test',
          name: 'Test',
          description: 'Test',
          priority,
          steps: [
            { id: 'step_1', description: 'Do', action: 'click', optional: false },
          ],
        };
        
        const result = ScenarioSchema.safeParse(scenario);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('StepSchema', () => {
    it('should validate basic step', () => {
      const step = {
        id: 'step_1',
        description: 'Click button',
        action: 'click',
        optional: false,
      };
      
      const result = StepSchema.safeParse(step);
      expect(result.success).toBe(true);
    });

    it('should validate step with all optional fields', () => {
      const step = {
        id: 'step_1',
        description: 'Open Copilot Chat',
        action: 'openCopilotChat',
        optional: true,
        timeout: 5000,
        args: { key: 'value' },
        hints: [
          { type: 'keyboard', value: 'Cmd+Shift+I' },
        ],
      };
      
      const result = StepSchema.safeParse(step);
      expect(result.success).toBe(true);
    });

    it('should reject step without required fields', () => {
      const step = {
        id: 'step_1',
        // missing description, action, optional
      };
      
      const result = StepSchema.safeParse(step);
      expect(result.success).toBe(false);
    });

    it('should validate hint types', () => {
      const validHintTypes = ['keyboard', 'click', 'type', 'wait', 'hover'];
      
      for (const type of validHintTypes) {
        const step = {
          id: 'step_1',
          description: 'Test',
          action: 'test',
          optional: false,
          hints: [{ type }],
        };
        
        const result = StepSchema.safeParse(step);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('EnvironmentSchema', () => {
    it('should validate basic environment', () => {
      const env = {
        vscodeVersion: 'stable',
      };
      
      const result = EnvironmentSchema.safeParse(env);
      expect(result.success).toBe(true);
    });

    it('should validate environment with target', () => {
      const env = {
        vscodeVersion: 'insiders',
        vscodeTarget: 'desktop',
      };
      
      const result = EnvironmentSchema.safeParse(env);
      expect(result.success).toBe(true);
    });

    it('should validate environment with repository', () => {
      const env = {
        vscodeVersion: 'stable',
        repository: {
          url: 'https://github.com/microsoft/vscode',
          ref: 'main',
        },
      };
      
      const result = EnvironmentSchema.safeParse(env);
      expect(result.success).toBe(true);
    });
  });

  describe('CheckpointSchema', () => {
    it('should validate checkpoint with required fields', () => {
      const checkpoint = {
        id: 'check_1',
        type: 'elementVisible',
        verify: 'Element is visible',
      };
      
      const result = CheckpointSchema.safeParse(checkpoint);
      expect(result.success).toBe(true);
    });

    it('should validate all checkpoint types', () => {
      const types = [
        'elementVisible',
        'elementNotVisible',
        'textContains',
        'textEquals',
        'fileExists',
        'configEquals',
        'custom',
      ];
      
      for (const type of types) {
        const checkpoint = { id: 'check', type, verify: 'test' };
        const result = CheckpointSchema.safeParse(checkpoint);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('ObservationSchema', () => {
    it('should validate observation', () => {
      const observation = {
        id: 'obs_1',
        question: 'Is the UI clear?',
        category: 'usability',
      };
      
      const result = ObservationSchema.safeParse(observation);
      expect(result.success).toBe(true);
    });

    it('should validate all observation categories', () => {
      const categories = ['usability', 'performance', 'clarity', 'friction', 'terminology'];
      
      for (const category of categories) {
        const observation = { id: 'obs', question: 'Test?', category };
        const result = ObservationSchema.safeParse(observation);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('TelemetryConfigSchema', () => {
    it('should validate telemetry config', () => {
      const config = {
        enabled: true,
        expectedEvents: [
          { event: 'copilot/chat/opened', required: true },
        ],
      };
      
      const result = TelemetryConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate telemetry event with all fields', () => {
      const config = {
        enabled: true,
        captureAll: true,
        failOnMissing: true,
        expectedEvents: [
          {
            event: 'copilot/chat/messageSubmitted',
            required: true,
            duringStep: 'step_1',
            timeout: 5000,
            properties: { hasContext: true },
          },
        ],
      };
      
      const result = TelemetryConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('ErrorRecoveryConfigSchema', () => {
    it('should validate error recovery config', () => {
      const config = {
        enabled: true,
        scenarios: [
          {
            id: 'network_error',
            inject: 'networkTimeout',
            expectRecovery: ['errorMessageShown'],
          },
        ],
      };
      
      const result = ErrorRecoveryConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate all injection types', () => {
      const injectionTypes = [
        'networkTimeout',
        'networkError',
        'apiRateLimit',
        'apiError',
        'extensionCrash',
        'authExpired',
        'diskFull',
        'permissionDenied',
      ];
      
      for (const inject of injectionTypes) {
        const config = {
          enabled: true,
          scenarios: [
            { id: 'test', inject, expectRecovery: ['errorMessageShown'] },
          ],
        };
        const result = ErrorRecoveryConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all recovery behaviors', () => {
      const behaviors = [
        'errorMessageShown',
        'retryBehavior',
        'fallbackUsed',
        'gracefulDegradation',
        'reconnectAttempt',
        'userPrompted',
        'operationCancelled',
        'statePreserved',
      ];
      
      const config = {
        enabled: true,
        scenarios: [
          { id: 'test', inject: 'networkError', expectRecovery: behaviors },
        ],
      };
      
      const result = ErrorRecoveryConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
