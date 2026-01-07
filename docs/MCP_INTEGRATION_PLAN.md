# VS Code Custom Agent Integration Plan

## Overview

This document outlines the plan to create a **Custom Agent** (`.agent.md` file) that enables GitHub Copilot to run scenario tests directly within VS Code. This approach requires **zero code** - just a markdown file with instructions and tool configurations.

## The Vision

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CURRENT ARCHITECTURE                               │
│                                                                             │
│   Scenario YAML  ──►  CLI  ──►  Playwright  ──►  VS Code (new instance)   │
│   (scripted steps)                                                          │
│                                                                             │
│   Problem: Complex setup, external process, manual step scripting          │
└─────────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                          NEW ARCHITECTURE                                   │
│                                                                             │
│   @scenario-runner ──► Copilot Agent Loop ──► VS Code (current instance)  │
│   "run copilot-chat"   (reads YAML, uses     (agent mode tools)            │
│                         built-in tools)                                     │
│                                                                             │
│   Benefit: Zero setup, uses Copilot's subscription, self-healing           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Why Custom Agents?

### What Are Custom Agents?
Custom agents are `.agent.md` files that configure Copilot with:
- **Instructions**: How the AI should behave
- **Tools**: Which VS Code tools are available
- **Handoffs**: Workflow transitions to other agents

### Benefits Over Custom Implementation
| Approach | Code Required | Setup Time | Maintenance |
|----------|---------------|------------|-------------|
| Custom MCP Client | ~500 lines | Days | High |
| VS Code Extension | ~300 lines | Days | Medium |
| **Custom Agent (.agent.md)** | **0 lines** | **Minutes** | **Low** |

## Implementation Plan

### Phase 1: Create the Scenario Runner Agent (Day 1)

Create `.github/agents/scenario-runner.agent.md`:

```markdown
---
name: Scenario Runner
description: Run scenario tests to validate VS Code and Copilot features
tools:
  - codebase
  - editFiles
  - extensions
  - fetch
  - findTestFiles
  - githubRepo
  - problems
  - runCommands
  - runInTerminal
  - runNotebooks
  - runTests
  - search
  - terminalLastCommand
  - terminalSelection
  - testFailure
  - thinking
  - usages
  - visionScreenshot
model: claude-sonnet-4
handoffs:
  - label: Generate Report
    agent: report-generator
    prompt: Generate a detailed report from the scenario run above.
    send: false
---

# Scenario Runner Agent

You are a test automation agent that runs scenario tests for VS Code and GitHub Copilot features.

## Your Mission

When the user provides a scenario (either by name or YAML content), you will:
1. Parse the scenario to understand the goals
2. Execute each step using VS Code's built-in capabilities
3. Capture observations about the user experience
4. Report results with pass/fail status

## Scenario Format

Scenarios are defined in YAML files in the `scenarios/` folder. Each scenario has:
- `id`: Unique identifier
- `name`: Human-readable name
- `description`: What the scenario tests
- `steps`: Actions to perform (you interpret these as goals, not literal clicks)
- `observations`: UX questions to answer during the run
- `checkpoints`: Validation points

## How to Execute Steps

For each step, use your judgment to achieve the intent. For example:

| Step Action | Your Approach |
|-------------|---------------|
| `openCopilotChat` | Use keyboard shortcut Cmd+Shift+I or navigate via menu |
| `sendChatMessage` | Type in the chat input and press Enter |
| `clickModelPicker` | Find and click the model dropdown in the chat toolbar |
| `openCommandPalette` | Use Cmd+Shift+P |
| `typeText` | Type the specified text |
| `wait` | Pause for the specified duration |

## Handling Failures

If a step fails:
1. Take a screenshot using #tool:visionScreenshot
2. Analyze what went wrong
3. Try an alternative approach if possible
4. Report the failure with context

## Output Format

After running a scenario, provide a structured report:

```
## Scenario: [name]

### Results
- Status: PASSED/FAILED
- Duration: X seconds
- Steps: X/Y passed

### Step Details
1. ✅ [step description] - [notes]
2. ❌ [step description] - [error details]

### Observations
- [question]: [your observation]

### Screenshots
[Any screenshots captured during the run]

### Recommendations
[Any UX improvements noticed]
```

## Available Scenarios

You can list scenarios by reading the `scenarios/` directory. Common scenarios include:
- `copilot-chat-basic` - Basic chat interaction
- `copilot-model-picker` - Changing AI models
- `copilot-agent-mode` - Using agent mode for autonomous tasks
- `copilot-inline-chat` - Inline code assistance

## Example Usage

User: "Run the copilot-chat-basic scenario"

You would:
1. Read `scenarios/copilot-chat-basic.yaml`
2. Execute each step
3. Answer observation questions
4. Report results
```

### Phase 2: Create Report Generator Agent (Day 1)

Create `.github/agents/report-generator.agent.md`:

```markdown
---
name: Report Generator
description: Generate detailed test reports from scenario runs
tools:
  - codebase
  - editFiles
  - search
model: claude-sonnet-4
---

# Report Generator Agent

You generate detailed Markdown reports from scenario test runs.

## Report Template

Create reports in `reports/` with the format `REPORT_[scenario-id]_[timestamp].md`:

```markdown
# Scenario Test Report

## Summary
- **Scenario**: [name]
- **Date**: [timestamp]
- **Status**: PASSED/FAILED
- **Duration**: [time]

## Environment
- VS Code Version: [version]
- Copilot Extension: [version]
- Platform: [OS]

## Step Results

| Step | Action | Status | Duration | Notes |
|------|--------|--------|----------|-------|
| 1 | ... | ✅ | ... | ... |

## Observations

### Usability
[Observations about ease of use]

### Clarity
[Observations about UI clarity]

### Performance
[Any performance notes]

## Screenshots
[Embedded screenshots]

## Recommendations
[Suggested improvements]
```
```

### Phase 3: Create Background Agent Configuration (Day 2)

For long-running scenarios, create `.github/agents/scenario-background.agent.md`:

```markdown
---
name: Background Scenario Runner
description: Run scenarios as background tasks
tools:
  - codebase
  - editFiles
  - runCommands
  - runInTerminal
  - visionScreenshot
model: claude-sonnet-4
---

# Background Scenario Runner

You run scenario tests as background tasks, suitable for:
- Long-running scenarios (>5 minutes)
- Scenarios that need to wait for external events
- Batch running multiple scenarios

## Usage

When started as a background agent, you will:
1. Run the specified scenario(s)
2. Save progress checkpoints
3. Generate a final report when complete

## Checkpoint Format

Save checkpoints to `.scenario-runner/checkpoints/[run-id].json`:
```json
{
  "runId": "...",
  "scenario": "...",
  "currentStep": 3,
  "status": "running",
  "results": [...],
  "startTime": "...",
  "lastUpdate": "..."
}
```
```

### Phase 4: Update Scenarios for Agent Compatibility (Day 2-3)

Update scenarios to work better with the agent approach. Add `agentHints` field:

```yaml
# scenarios/copilot-model-picker.yaml
id: copilot-model-picker
name: "Change AI Model in Copilot Chat"
description: >
  Tests the model picker dropdown in Copilot Chat.

# NEW: Hints specifically for agent execution
agentHints:
  context: "This scenario tests the model picker in Copilot Chat"
  tips:
    - "The model picker is usually a dropdown button in the chat toolbar"
    - "Model names might include 'GPT-4', 'Claude', 'o1', etc."
    - "After selecting a model, the UI should confirm the change"

steps:
  - id: open_chat
    description: "Open Copilot Chat panel"
    action: openCopilotChat
    agentHint: "Use Cmd+Shift+I or the Copilot icon in the sidebar"
    
  - id: click_model_picker
    description: "Click the model picker dropdown"
    action: clickModelPicker
    agentHint: "Look for a button showing the current model name in the chat toolbar"
    
  - id: select_different_model
    description: "Select a different AI model"
    action: selectModel
    args:
      preferDifferent: true
    agentHint: "Pick any model that's different from the currently selected one"

observations:
  - question: "Was the model picker easy to find?"
    category: usability
  - question: "Did the UI clearly indicate which model is selected?"
    category: clarity
```

### Phase 5: Add MCP Server Integration (Optional - Day 3)

For advanced automation, configure the VS Code Playwright MCP server:

```markdown
---
name: Scenario Runner (MCP)
description: Run scenarios with MCP automation tools
tools:
  - vscode-playwright-mcp/*
model: claude-sonnet-4
---
```

Configure MCP in `.vscode/mcp.json`:
```json
{
  "servers": {
    "vscode-playwright-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/vscode-playwright-mcp"],
      "env": {}
    }
  }
}
```

## Usage Examples

### Running a Scenario

In VS Code Copilot Chat:
```
@scenario-runner Run the copilot-model-picker scenario
```

### Running with Specific Focus
```
@scenario-runner Run copilot-chat-basic and focus on accessibility observations
```

### Running Multiple Scenarios
```
@scenario-runner Run all P0 scenarios in the scenarios/ folder
```

### Starting as Background Agent
```
@scenario-runner Run the background-agent-session scenario as a background task
```

## File Structure

```
.github/
└── agents/
    ├── scenario-runner.agent.md      # Main scenario runner
    ├── report-generator.agent.md     # Report generation
    └── scenario-background.agent.md  # Background execution

scenarios/
├── copilot-chat-basic.yaml
├── copilot-model-picker.yaml
├── ... (existing scenarios)

reports/
├── REPORT.md                         # Latest report
└── archive/                          # Historical reports
```

## Handoff Workflow

```
┌──────────────────────┐
│  @scenario-runner    │
│  "Run scenario X"    │
└──────────┬───────────┘
           │ executes scenario
           ▼
┌──────────────────────┐
│  Results collected   │
│  Screenshots taken   │
└──────────┬───────────┘
           │ [Generate Report] button
           ▼
┌──────────────────────┐
│  @report-generator   │
│  Creates REPORT.md   │
└──────────────────────┘
```

## Benefits

| Benefit | Description |
|---------|-------------|
| **Zero Code** | Just markdown files, no TypeScript/extension needed |
| **Copilot Cost** | Uses your existing Copilot subscription |
| **Self-Healing** | Agent adapts to UI changes |
| **Built-in Tools** | Leverages VS Code's native capabilities |
| **Shareable** | Agents can be shared at org level |
| **Background Support** | Long scenarios can run autonomously |

## Comparison with Previous Approach

| Aspect | MCP Client Approach | Custom Agent Approach |
|--------|--------------------|-----------------------|
| Implementation | TypeScript code | Markdown files |
| Dependencies | `@modelcontextprotocol/sdk` | None |
| Setup Time | Days | Minutes |
| Maintenance | Update code for API changes | Update markdown |
| Execution | External process | Within VS Code |
| Tools | Manual integration | Built-in VS Code tools |

## Migration from CLI

Existing CLI scenarios still work. The agent approach is additive:

```bash
# Old way (still works)
scenario-grader run copilot-chat-basic

# New way (in VS Code Chat)
@scenario-runner Run copilot-chat-basic
```

## Next Steps

1. [x] Create `.github/agents/scenario-runner.agent.md`
2. [ ] Create `.github/agents/report-generator.agent.md`
3. [ ] Test with simple scenarios
4. [ ] Add `agentHints` to existing scenarios
5. [ ] Document usage in README
6. [ ] Consider MCP integration for advanced automation

## References

- [VS Code Custom Agents Documentation](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code Chat Tools](https://code.visualstudio.com/docs/copilot/chat/chat-tools)
- [Background Agents](https://code.visualstudio.com/docs/copilot/agents/background-agents)
- [Handoffs Between Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents#_handoffs)
