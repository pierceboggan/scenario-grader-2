# Copilot Instructions for scenario-grader-2

## Project Overview

This is the **VS Code Scenario Runner** - an end-to-end testing system for VS Code and GitHub Copilot features. It uses Playwright to automate VS Code (as an Electron app) and runs YAML-defined test scenarios.

## Architecture

```
scenario-grader-2/
├── packages/
│   ├── core/         # Engine: types, runner, parser, evaluator
│   └── cli/          # Commander.js CLI application
├── scenarios/        # YAML test scenario files
├── apps/web/         # Next.js web UI (React + shadcn/ui)
└── .github/agents/   # VS Code Copilot agent definitions
```

### Key Components

- **Runner** ([packages/core/src/runner.ts](packages/core/src/runner.ts)): Launches VS Code via Playwright Electron, executes steps, captures screenshots
- **Parser** ([packages/core/src/parser.ts](packages/core/src/parser.ts)): Parses/validates YAML scenarios using Zod schemas
- **Types** ([packages/core/src/types.ts](packages/core/src/types.ts)): All TypeScript types with Zod validation schemas
- **CLI** ([packages/cli/src/index.ts](packages/cli/src/index.ts)): Entry point defining `run`, `list`, `validate`, `create` commands

## Common Commands

```bash
# Build all packages (required before running)
npm run build

# Run a specific scenario
npm run cli -- run copilot-model-picker

# Run with fresh profile (isolated, no existing extensions)
npm run cli -- run copilot-model-picker --fresh-profile

# List scenarios
npm run cli -- list --priority P0

# Validate scenario YAML
npm run cli -- validate scenarios/

# Run tests
npm test
```

## Scenario YAML Format

When creating/modifying scenarios in `scenarios/`, follow this structure:

```yaml
id: unique-kebab-case-id
name: "Human Readable Title"
owner: "@team-or-person"
tags: [copilot, chat, feature-area]
priority: P0  # P0 (critical) | P1 (important) | P2 (nice-to-have)
description: >
  What user outcome this scenario validates.

steps:
  - id: step_1
    description: "What this step does"
    action: openCopilotChat  # See KNOWN_ACTIONS in types.ts
    args:
      message: "Optional args"
    timeout: 5000
    observations:  # Optional UX questions
      - question: "Is the UI clear?"
        category: clarity

outputs:
  captureVideo: true
  screenshots:
    - atStep: step_1
```

### Available Actions

Actions are defined in `KNOWN_ACTIONS` in [types.ts](packages/core/src/types.ts#L290) and implemented in `executeStep()` in [runner.ts](packages/core/src/runner.ts). Key actions:

- `openCopilotChat`, `openInlineChat`, `sendChatMessage`
- `openCommandPalette`, `typeText`, `pressKey`, `click`
- `clickModelPicker`, `selectModel` (semantic actions)
- `openExtensionsPanel`, `searchExtensions`, `installExtension`

## Code Patterns

### Adding a New Action

1. Add to `KNOWN_ACTIONS` array in [packages/core/src/types.ts](packages/core/src/types.ts)
2. Implement in the `switch` statement in `executeStep()` in [packages/core/src/runner.ts](packages/core/src/runner.ts)

```typescript
case 'myNewAction':
  log('Performing my action');
  await page.keyboard.press('Meta+Shift+P');
  // ... implementation
  break;
```

### Zod Schema Pattern

All types use Zod for runtime validation. When adding fields:

```typescript
// In types.ts - always define schema first
export const MyNewSchema = z.object({
  field: z.string(),
  optional: z.number().optional(),
});
export type MyNew = z.infer<typeof MyNewSchema>;
```

### Error Handling

Use `RunnerError` class for recoverable errors with retry logic:

```typescript
throw new RunnerError(
  'Element not found: button',
  'ELEMENT_NOT_FOUND',
  true, // recoverable - will retry
  { target: 'button' }
);
```

## Testing

- Unit tests: `npm test` (Vitest)
- Integration tests: `npm run test:integration`
- Test files: `*.test.ts` alongside source files

## Monorepo Structure

This is an npm workspaces monorepo. Key commands:

```bash
# Install deps for all packages
npm install

# Build specific workspace
npm run build --workspace=packages/core

# Run CLI from root
npm run cli -- <command>
```

## VS Code Agents

Custom agents in `.github/agents/` define AI-assisted workflows:
- `scenario-runner.agent.md` - Run scenario tests interactively
- `scenario-background.agent.md` - Long-running tests
- `report-generator.agent.md` - Generate reports from runs

## Key Dependencies

- **Playwright** - VS Code automation (Electron mode)
- **Zod** - Runtime type validation
- **Commander** - CLI framework
- **yaml** - YAML parsing
- **OpenAI** - LLM evaluation (optional)
