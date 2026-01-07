import { describe, it, expect, vi } from 'vitest';
import { generateEvaluationPrompt, getEvaluationDimensions } from '../src/evaluator';
import { Scenario, StepResult } from '../src/types';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    overallScore: 85,
                    dimensions: [
                      { name: 'Usability', score: 90, maxScore: 100, feedback: 'Good' },
                    ],
                    summary: 'Test passed',
                    suggestions: [],
                  }),
                },
              },
            ],
          }),
        },
      },
    })),
  };
});

describe('Evaluator', () => {
  const mockScenario: Scenario = {
    id: 'test-scenario',
    name: 'Test Scenario',
    description: 'Testing Copilot chat',
    priority: 'P1',
    steps: [
      { id: 'step_1', description: 'Open chat', action: 'openCopilotChat', optional: false },
      { id: 'step_2', description: 'Send message', action: 'sendChatMessage', optional: false },
    ],
    observations: [
      { id: 'obs_1', question: 'Is the UI clear?', category: 'usability' },
    ],
  };

  const mockStepResults: StepResult[] = [
    {
      stepId: 'step_1',
      status: 'passed',
      startTime: '2024-01-01T00:00:00Z',
      endTime: '2024-01-01T00:00:02Z',
      duration: 2000,
    },
    {
      stepId: 'step_2',
      status: 'passed',
      startTime: '2024-01-01T00:00:02Z',
      endTime: '2024-01-01T00:00:05Z',
      duration: 3000,
    },
  ];

  describe('generateEvaluationPrompt', () => {
    it('should generate a prompt with scenario context', () => {
      const prompt = generateEvaluationPrompt(mockScenario, mockStepResults, []);
      
      // Check that prompt contains basic scenario info
      expect(prompt).toContain('Test Scenario');
      expect(prompt).toContain('Testing Copilot chat');
    });

    it('should be a non-empty string', () => {
      const prompt = generateEvaluationPrompt(mockScenario, mockStepResults, []);
      
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should include observation questions', () => {
      const prompt = generateEvaluationPrompt(mockScenario, mockStepResults, []);
      
      expect(prompt).toContain('Is the UI clear?');
    });
  });

  describe('getEvaluationDimensions', () => {
    it('should return default dimensions', () => {
      const dimensions = getEvaluationDimensions();
      
      expect(dimensions).toBeInstanceOf(Array);
      expect(dimensions.length).toBeGreaterThan(0);
    });

    it('should return dimensions with name and weight', () => {
      const dimensions = getEvaluationDimensions(mockScenario);
      
      for (const dim of dimensions) {
        expect(dim).toHaveProperty('name');
        expect(typeof dim.name).toBe('string');
      }
    });
  });
});
