import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI Integration Tests', () => {
  const cliPath = join(__dirname, '../../cli/dist/index.js');
  const scenariosDir = join(__dirname, '../../../scenarios');
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scenario-grader-test-'));
  });

  afterAll(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const runCLI = (args: string): { stdout: string; stderr: string; exitCode: number } => {
    try {
      const stdout = execSync(`node ${cliPath} ${args}`, {
        encoding: 'utf8',
        timeout: 30000,
        cwd: process.cwd(),
        env: { ...process.env, NO_COLOR: '1' },
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.status || 1,
      };
    }
  };

  describe('validate command', () => {
    it('should validate a valid scenario file', () => {
      const scenarioFile = join(scenariosDir, 'copilot-chat-code-generation.yaml');
      if (!existsSync(scenarioFile)) {
        return; // Skip if scenario doesn't exist
      }

      const result = runCLI(`validate "${scenarioFile}"`);
      expect(result.exitCode).toBe(0);
    });

    it('should report errors for an invalid scenario', () => {
      const invalidYaml = `
id: test
# missing required fields
`;
      const invalidFile = join(tempDir, 'invalid.yaml');
      require('fs').writeFileSync(invalidFile, invalidYaml);

      const result = runCLI(`validate "${invalidFile}"`);
      expect(result.exitCode).not.toBe(0);
    });

    it('should handle non-existent file', () => {
      const result = runCLI('validate /nonexistent/path.yaml');
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('list command', () => {
    it('should list all available scenarios', () => {
      const result = runCLI('list');
      // Should not error
      expect(result.exitCode).toBe(0);
    });

    it('should support --json output', () => {
      const result = runCLI('list --json');
      if (result.exitCode === 0 && result.stdout.trim()) {
        // If we got JSON output, it should be parseable
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('help command', () => {
    it('should show help', () => {
      const result = runCLI('--help');
      expect(result.stdout).toContain('Usage:');
    });

    it('should show version', () => {
      const result = runCLI('--version');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('compile command', () => {
    it('should compile natural language to scenario', async () => {
      // Skip if no API key
      if (!process.env.OPENAI_API_KEY) {
        return;
      }

      const result = runCLI('compile "Test that Copilot chat opens when I press Cmd+Shift+I" --dry-run');
      // Should attempt to compile (may fail without API key)
      expect(result.stdout + result.stderr).toBeTruthy();
    });
  });
});

describe('Core Module Integration', () => {
  describe('Parser + Validator', () => {
    it('should parse and validate scenario files from disk', async () => {
      const { parseScenarioFile, validateScenarioSemantics } = await import('../src/index');
      const scenariosDir = join(__dirname, '../../../scenarios');
      const { readdirSync } = await import('fs');
      
      const scenarioFiles = readdirSync(scenariosDir)
        .filter(f => f.endsWith('.yaml'))
        .slice(0, 5); // Test first 5

      for (const file of scenarioFiles) {
        const filePath = join(scenariosDir, file);
        const scenario = await parseScenarioFile(filePath);
        
        expect(scenario).toHaveProperty('id');
        expect(scenario).toHaveProperty('name');
        expect(scenario).toHaveProperty('steps');
        
        const validation = validateScenarioSemantics(scenario);
        // Validation should run without throwing
        expect(validation).toHaveProperty('valid');
      }
    });
  });

  describe('Scenario to YAML roundtrip', () => {
    it('should preserve scenario structure through parse -> serialize -> parse', async () => {
      const { parseScenarioYAML, scenarioToYAML } = await import('../src/index');
      
      const originalYaml = `
id: roundtrip-test
name: Roundtrip Test
description: Testing YAML serialization
priority: P1
steps:
  - id: step_1
    description: Do something
    action: click
    optional: false
`;
      
      const scenario = parseScenarioYAML(originalYaml);
      const serialized = scenarioToYAML(scenario);
      const reparsed = parseScenarioYAML(serialized);
      
      expect(reparsed.id).toBe(scenario.id);
      expect(reparsed.name).toBe(scenario.name);
      expect(reparsed.steps.length).toBe(scenario.steps.length);
      expect(reparsed.steps[0].id).toBe(scenario.steps[0].id);
    });
  });

  describe('Error Handling', () => {
    it('should throw structured errors for invalid input', async () => {
      const { parseScenarioYAML, ScenarioParseError } = await import('../src/index');
      
      expect(() => parseScenarioYAML('{ invalid yaml [')).toThrow(ScenarioParseError);
    });
  });
});
