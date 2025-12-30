# VS Code Scenario Runner - User Guide

A CLI tool for automated end-to-end testing of VS Code features using Playwright.

## Quick Start

```bash
# List available scenarios
node packages/cli/dist/index.js list

# Run a specific scenario
node packages/cli/dist/index.js run copilot-chat-basic

# Run all scenarios
node packages/cli/dist/index.js run --all

# Show scenario details
node packages/cli/dist/index.js show copilot-chat-basic
```

## Commands

### `list` - View Available Scenarios

```bash
node packages/cli/dist/index.js list
node packages/cli/dist/index.js list --tag copilot      # Filter by tag
node packages/cli/dist/index.js list --priority P0     # Filter by priority
node packages/cli/dist/index.js list --json            # Output as JSON
```

### `run` - Execute Scenarios

```bash
# Run a single scenario
node packages/cli/dist/index.js run <scenario-id>

# Run all scenarios
node packages/cli/dist/index.js run --all

# Run scenarios with a specific tag
node packages/cli/dist/index.js run --tag copilot
```

#### Run Options

| Option | Description |
|--------|-------------|
| `--all` | Run all available scenarios |
| `--tag <tag>` | Run scenarios matching a tag |
| `--reuse-profile` | Use your existing VS Code config (requires closing VS Code first) |
| `--video` | Record video of the scenario run (saved as .webm) |
| `--no-llm` | Disable LLM evaluation |
| `--no-artifacts` | Don't capture screenshots |
| `-v, --vscode-version` | Use `stable` or `insiders` |

### `show` - View Scenario Details

```bash
node packages/cli/dist/index.js show copilot-chat-basic
node packages/cli/dist/index.js show copilot-chat-basic --yaml
node packages/cli/dist/index.js show copilot-chat-basic --json
```

## Understanding Results

After running a scenario, you'll see:

```
┌────────────────────────────────┬──────────┬──────────┬───────────┐
│ Scenario                       │ Status   │ Duration │ LLM Score │
├────────────────────────────────┼──────────┼──────────┼───────────┤
│ Basic Copilot Chat Interaction │ ✓ Passed │ 21024ms  │ N/A       │
└────────────────────────────────┴──────────┴──────────┴───────────┘
```

- **✓ Passed**: All steps completed successfully
- **✗ Failed**: One or more steps failed
- **⚠ Error**: Something unexpected happened (e.g., VS Code crashed)

## Artifacts

Every run creates artifacts in `~/.scenario-runner/artifacts/<run-id>/`:

```
~/.scenario-runner/artifacts/abc123/
├── screenshots/
│   ├── 001_launch.png
│   ├── 002_open_chat.png
│   └── 003_send_greeting.png
├── videos/                 # Only if --video flag used
│   └── recording.webm
└── user-data/              # VS Code profile data (if fresh)
```

Open the screenshots folder to see what happened:
```bash
open ~/.scenario-runner/artifacts/*/screenshots/
```

### Video Recording

Use the `--video` flag to record a video of the entire scenario run:

```bash
node packages/cli/dist/index.js run copilot-chat-basic --video
```

The video is saved as a `.webm` file in the artifacts folder. This is useful for:
- Debugging failures by watching exactly what happened
- Sharing results with teammates
- Creating documentation or demos

## Common Issues

### "VS Code closed unexpectedly"

This happens when you try to use `--reuse-profile` while VS Code is already running.

**Solutions:**
1. Don't use `--reuse-profile` (default behavior uses isolated profile)
2. Close VS Code before running with `--reuse-profile`

### "VS Code not found"

Install VS Code or VS Code Insiders:
- macOS: Download from https://code.visualstudio.com
- The tool looks for VS Code in `/Applications/`

## Available Scenarios

| ID | Name | Description |
|----|------|-------------|
| `copilot-chat-basic` | Basic Copilot Chat | Opens chat, sends message, waits for response |
| `extension-install-marketplace` | Install Extension | Searches marketplace for Python extension |
| `command-palette-navigation` | Command Palette | Opens palette, navigates to color theme |

## Creating Custom Scenarios

Scenarios are defined in YAML. See `/scenarios/` for examples:

```yaml
id: my-custom-scenario
name: My Custom Test
priority: P1
tags: [custom, test]
description: Tests something specific

environment:
  vscodeTarget: desktop
  vscodeVersion: stable
  platform: macOS

steps:
  - id: launch
    description: Launch VS Code
    action: launchVSCodeWithProfile
    
  - id: open_file
    description: Open a file
    action: openFile
    args:
      path: README.md

assertions:
  - id: check_visible
    type: elementVisible
    target: .monaco-editor
```

## Tips

1. **First run is slow**: VS Code needs to initialize a fresh profile
2. **Screenshots help debugging**: Check artifacts when tests fail
3. **Use tags**: Organize scenarios with tags for selective running
4. **Watch the test**: VS Code opens visibly so you can see what's happening
