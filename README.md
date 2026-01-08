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

# Record video
scenario-runner run scenario-id --video

# Use existing VS Code profile (skip fresh isolation)
scenario-runner run scenario-id --reuse-profile
```

### Authentication

For scenarios that require GitHub/Copilot authentication (especially fresh profile scenarios), set these environment variables:

```bash
export SCENARIO_GITHUB_EMAIL="your-github-email@example.com"
export SCENARIO_GITHUB_PASSWORD="your-github-password"
```

The runner will automatically handle the GitHub OAuth flow when:
- Running with a fresh profile (`--no-reuse-profile`, the default)
- A `githubLogin` or `signInWithGitHub` step is encountered
- VS Code prompts for Copilot sign-in

**Note:** For security, never commit credentials to source control. Use environment variables or a `.env` file (add to `.gitignore`).

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

## 🤖 VS Code Custom Agents

Run scenarios directly in VS Code using Copilot Chat with custom agents. No CLI needed - and you can delegate to background agents for testing at scale!

### Quick Start

1. Open VS Code in this workspace
2. Open Copilot Chat (`Cmd+Shift+I` / `Ctrl+Shift+I`)
3. Type `@scenario-runner Run the copilot-chat-basic scenario`

### Available Agents

| Agent | Description | Best For |
|-------|-------------|----------|
| `@scenario-runner` | Interactive scenario testing | Quick tests (<5 min), debugging, iterating |
| `@scenario-background` | Long-running autonomous tests | Background agents, cloud agents, batch runs |
| `@report-generator` | Generate detailed Markdown reports | Called via handoff after runs complete |

### When to Use Each Agent

```
┌─────────────────────────────────────────────────────────────────┐
│                     Which Agent Should I Use?                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Quick test, need to watch it run?                              │
│  └──→ @scenario-runner                                          │
│                                                                  │
│  Long-running (>5 min) or need to run many tests?              │
│  └──→ @scenario-background                                      │
│                                                                  │
│  Need a formatted report for stakeholders?                      │
│  └──→ Click "Generate Report" handoff after any run            │
│                                                                  │
│  Testing changes at scale across multiple PRs/branches?         │
│  └──→ @scenario-background with worktree delegation            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Example Workflows

#### Interactive Testing
```
# Run a single scenario
@scenario-runner Run the copilot-inline-chat scenario

# Run all P0 scenarios  
@scenario-runner Run all P0 priority scenarios

# Run and generate report
@scenario-runner Run copilot-agent-mode
→ Click [Generate Report] handoff button
```

#### Background Testing (Long-Running)
```
# Run a long background agent scenario
@scenario-background Run background-agent-session

# Run multiple scenarios as a batch
@scenario-background Run all scenarios tagged with "agents"
```

### Benefits Over CLI

- **Zero setup**: Works in any VS Code with Copilot
- **Self-healing**: Agent adapts to UI changes automatically
- **No LLM costs**: Uses your existing Copilot subscription
- **Interactive**: Ask follow-up questions during runs
- **Handoffs**: Seamlessly pass results between agents

---

## 🚀 Testing at Scale with Background Agents & Git Worktrees

For testing changes across multiple branches, PRs, or configurations simultaneously, use the **worktree delegation pattern** with background agents. This lets you run many test sessions in parallel without conflicts.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Worktree Delegation Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Main Workspace                    Git Worktrees                │
│   ┌──────────────┐                 ┌──────────────┐             │
│   │   Your Code  │ ──delegate──→   │  Worktree 1  │ (PR #123)   │
│   │              │                 │  Tests run   │             │
│   │              │                 └──────────────┘             │
│   │              │                 ┌──────────────┐             │
│   │              │ ──delegate──→   │  Worktree 2  │ (PR #456)   │
│   │              │                 │  Tests run   │             │
│   │              │                 └──────────────┘             │
│   │              │                 ┌──────────────┐             │
│   │              │ ──delegate──→   │  Worktree 3  │ (feature-x) │
│   │              │                 │  Tests run   │             │
│   └──────────────┘                 └──────────────┘             │
│                                            │                     │
│                      ←── results merge ────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Worktrees?

- **Isolation**: Each test runs in its own directory - no conflicts
- **Parallelism**: Run 5, 10, or 20+ tests simultaneously  
- **Clean state**: Each worktree has a fresh git state
- **Easy cleanup**: Delete the worktree folder when done

### Quick Start: Worktree Testing

#### 1. Create Worktrees for Each Test Target

```bash
# Create worktrees for different PRs/branches
git worktree add ../test-pr-123 origin/pr-123
git worktree add ../test-pr-456 origin/pr-456
git worktree add ../test-feature-x feature-x
```

#### 2. Delegate Tests to Background Agents

```
@scenario-background Run the copilot-agent-mode scenario 
in the worktree at ../test-pr-123

@scenario-background Run all P0 scenarios 
in the worktree at ../test-pr-456
```

Or use the CLI for batch operations:
```bash
# Run tests across all worktrees
for worktree in ../test-pr-*; do
  npx scenario-runner run --all --workspace "$worktree" --orchestrated &
done
wait
```

#### 3. Collect Results

Results are saved to each worktree's `.scenario-runner/` directory:
```
../test-pr-123/.scenario-runner/
├── checkpoints/          # Progress tracking
├── artifacts/            # Screenshots, logs
└── reports/              # Generated reports
```

### Scenario: `background-agent-worktree`

Use this scenario template to test with worktree isolation:

```yaml
id: my-worktree-test
name: "Test Feature X in Isolation"
tags: [background, worktree, isolation]
priority: P1

steps:
  - id: create_session
    action: createBackgroundSession
    args:
      isolation: worktree    # Use git worktree instead of main workspace
      branch: feature-x
      
  - id: run_task
    action: sendChatMessage  
    args:
      message: "Run all unit tests and report failures"
      waitForResponse: false
      
  - id: wait_complete
    action: wait
    args:
      duration: 300000       # 5 minute timeout
```

### Multi-Session Orchestration

For complex test matrices, use the orchestration system:

```yaml
orchestration:
  enabled: true
  totalTimeout: 1800000      # 30 min max
  checkpointInterval: 60000  # Save progress every minute
  failureStrategy: continue  # Don't stop on failures
  
  sessions:
    - id: stable
      worktree: ../test-stable
      vscodeVersion: stable
      
    - id: insiders  
      worktree: ../test-insiders
      vscodeVersion: insiders
      
  milestones:
    - id: run_tests
      parallel: true         # Run both sessions in parallel
      steps:
        - action: runTests
```

### CI/CD Integration

Run tests at scale in your GitHub Actions workflow:

```yaml
# .github/workflows/scenario-tests.yml
jobs:
  scenario-tests:
    runs-on: macos-latest
    strategy:
      matrix:
        scenario: [copilot-chat, copilot-inline, copilot-agent-mode]
        vscode: [stable, insiders]
    steps:
      - uses: actions/checkout@v4
      
      - name: Create worktree
        run: |
          git worktree add ../test-${{ matrix.scenario }}-${{ matrix.vscode }}
          
      - name: Run scenario
        run: |
          npx scenario-runner run ${{ matrix.scenario }} \
            --workspace ../test-${{ matrix.scenario }}-${{ matrix.vscode }} \
            --vscode-version ${{ matrix.vscode }} \
            --orchestrated \
            --json > results.json
            
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: results-${{ matrix.scenario }}-${{ matrix.vscode }}
          path: results.json
```

### Tips for Scale Testing

1. **Use `--orchestrated` flag** for long-running tests with checkpoints
2. **Set appropriate timeouts** - background agent tests may need 10-30+ minutes
3. **Use `failureStrategy: continue`** to run all tests even if some fail
4. **Take screenshots liberally** - helps debug failures across many runs
5. **Aggregate reports** - use `@report-generator` to combine results

See [docs/MCP_INTEGRATION_PLAN.md](docs/MCP_INTEGRATION_PLAN.md) for full documentation.

## 📄 License

MIT License - see LICENSE file for details.
