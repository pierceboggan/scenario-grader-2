# ⭐️ VS Code Scenario Runner

End-to-End Scenario Testing System with Natural Language + YAML Authoring, LLM Evaluation, GitHub Issue Generation, and VS Code Sandbox Reset.

![VS Code Scenario Runner](https://img.shields.io/badge/VS%20Code-Scenario%20Runner-007ACC?style=for-the-badge&logo=visualstudiocode)

## 🚀 Features

- **📋 Scenario Library**: Browse, search, and filter scenarios with a VS Code-style interface
- **🎯 YAML & Natural Language**: Write scenarios in YAML or plain English
- **▶️ Live Run View**: Watch scenarios execute in real-time with step-by-step progress
- **🤖 LLM Evaluation**: AI-powered UX quality grading using Azure AI Foundry (mocked)
- **📊 Detailed Results**: View assertions, LLM scores, and actionable suggestions
- **🐙 GitHub Integration**: Generate GitHub issues directly from suggestions
- **🖥️ CLI Support**: Full CLI for CI/CD integration and power users

## 📦 Project Structure

```
scenario-grader-2/
├── apps/
│   └── web/                 # Next.js web application
│       ├── src/
│       │   ├── app/         # Next.js app router
│       │   ├── components/  # React components
│       │   │   ├── ui/      # shadcn/ui components
│       │   │   ├── layout/  # Layout components
│       │   │   └── views/   # Main view components
│       │   └── lib/         # Utilities and store
│       └── ...
├── packages/
│   ├── core/                # Shared core library
│   │   ├── src/
│   │   │   ├── types.ts     # TypeScript types
│   │   │   ├── parser.ts    # YAML parsing
│   │   │   ├── compiler.ts  # NL → YAML compiler
│   │   │   ├── runner.ts    # Scenario execution
│   │   │   ├── evaluator.ts # LLM evaluation
│   │   │   ├── github.ts    # GitHub integration
│   │   │   └── samples.ts   # Sample scenarios
│   │   └── ...
│   └── cli/                 # CLI application
│       ├── src/
│       │   ├── index.ts     # CLI entry point
│       │   └── commands/    # CLI commands
│       └── ...
└── package.json             # Workspace root
```

## 🛠️ Installation

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/scenario-grader-2.git
cd scenario-grader-2

# Install dependencies
npm install

# Build the core package
npm run build --workspace=packages/core

# Build the CLI
npm run build --workspace=packages/cli
```

## 🌐 Web Application

### Development

```bash
# Start the development server
npm run dev

# Open http://localhost:3000
```

### Features

#### Scenario Library
- Browse all available scenarios
- Search by name, ID, description, or tags
- Filter by priority (P0, P1, P2) and tags
- One-click run with configuration dialog

#### Live Run View
- Real-time step execution progress
- Scrolling log output
- Screenshot capture indicators
- Cancel running scenarios

#### Results View
- Pass/fail status with duration
- LLM evaluation scores across 6 dimensions
- Actionable suggestions with severity levels
- One-click GitHub issue creation
- Artifact references (logs, screenshots, video)

#### Create Scenario
- Natural language to YAML conversion
- Example prompts for common scenarios
- Live YAML preview
- Copy or use generated scenarios

## 💻 CLI Usage

```bash
# Using npx
npx scenario-runner <command>

# Or if installed globally
scenario-runner <command>
```

### Commands

#### List Scenarios

```bash
# List all scenarios
scenario-runner list

# Filter by tag
scenario-runner list --tag copilot

# Filter by priority
scenario-runner list --priority P0

# Output as JSON
scenario-runner list --json
```

#### Show Scenario Details

```bash
# Show scenario details
scenario-runner show mcp-config-github-registry

# Output as YAML
scenario-runner show mcp-config-github-registry --yaml

# Output as JSON
scenario-runner show mcp-config-github-registry --json
```

#### Run Scenarios

```bash
# Run a specific scenario
scenario-runner run mcp-config-github-registry

# Run all scenarios
scenario-runner run --all

# Run scenarios by tag
scenario-runner run --tag copilot

# Disable LLM evaluation
scenario-runner run scenario-id --no-llm

# Skip sandbox reset
scenario-runner run scenario-id --no-sandbox-reset
```

#### Create Scenarios

```bash
# Interactive creation wizard
scenario-runner create --interactive

# Create from natural language
scenario-runner create --natural "Launch VS Code, open Copilot chat, send a message"

# Use a template
scenario-runner create --template mcp --output my-scenario.yaml
```

#### Validate Scenarios

```bash
# Validate a single file
scenario-runner validate scenario.yaml

# Validate a directory
scenario-runner validate ./scenarios/

# Strict mode (exit 1 on warnings)
scenario-runner validate scenario.yaml --strict
```

## 📝 Scenario YAML Format

```yaml
id: unique-scenario-id
name: Human Readable Title
owner: "@team-or-person"
tags: [list, of, strings]
priority: P0  # P0 | P1 | P2

description: >
  What real user outcome we are validating.

environment:
  vscodeTarget: desktop      # desktop | web
  vscodeVersion: stable      # stable | insiders | exploration
  platform: macOS            # macOS | windows | linux
  profile:
    name: "Profile Name"
    expectedGitHubAccount: "user@example.com"
  workspacePath: "~/Projects/sample"
  copilotChannel: stable     # stable | prerelease | nightly

preconditions:
  - "Baseline sandbox exists"
  - "Required extensions installed"

steps:
  - id: step_1
    description: "What this step does"
    action: actionName
    args:
      param1: value1
    hints:
      - type: click
        target: "Button text"
    timeout: 10000
    optional: false

assertions:
  - id: assertion_1
    type: elementVisible     # elementVisible | textContains | accountEquals | llmGrade | custom
    target: ".selector"
    expected: "value"
    required: true

outputs:
  captureVideo: true
  screenshots:
    - atStep: step_1
      name: "screenshot-name"
  storeChatTranscript: true
  storeLogs: true
```

## 🤖 LLM Evaluation Dimensions

The LLM evaluator grades scenarios on 6 dimensions:

1. **Discoverability** (20%) - How easy is it to find the feature?
2. **UI Clarity** (20%) - Are UI elements well-labeled and intuitive?
3. **Responsiveness** (15%) - Are actions quick with good feedback?
4. **Error Handling** (15%) - Are errors clear and actionable?
5. **Task Completion** (20%) - Can users complete the intended task?
6. **Overall Polish** (10%) - Does the experience feel professional?

## 🗺️ Roadmap

- [ ] Real VS Code automation with Playwright
- [ ] Azure AI Foundry integration for LLM evaluation
- [ ] GitHub API integration for issue creation
- [ ] CI/CD pipeline integration
- [ ] Parallel scenario execution
- [ ] Multi-platform support (Windows, Linux)
- [ ] Video recording with playback
- [ ] Scenario versioning and history

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see LICENSE file for details.
