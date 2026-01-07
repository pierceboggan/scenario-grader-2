# Advanced Scenario Features

This guide covers the advanced features added to support complex testing scenarios.

## Table of Contents
1. [CI/CD with GitHub Actions](#cicd-with-github-actions)
2. [Documentation Verification](#documentation-verification)
3. [Real Repository Workspaces](#real-repository-workspaces)
4. [Orchestrated Scenarios](#orchestrated-scenarios)
5. [Telemetry Validation](#telemetry-validation)
6. [Error Recovery Testing](#error-recovery-testing)
7. [Scenario Generation from Recordings](#scenario-generation-from-recordings)

---

## CI/CD with GitHub Actions

Scenarios can be run automatically in CI/CD pipelines using the provided GitHub Actions workflow.

### Setup

1. The workflow file is at `.github/workflows/scenario-tests.yml`
2. Add required secrets:
   - `SCENARIO_GITHUB_TOKEN`: A GitHub personal access token for authentication
   - `OPENAI_API_KEY`: For LLM evaluation

### Running in CI

The workflow automatically:
- Installs VS Code on Linux runners (uses `xvfb` for headless display)
- Runs scenarios in parallel using a matrix strategy
- Captures screenshots and reports as artifacts
- Generates a summary report

### Manual Trigger

You can manually trigger with specific scenarios:

```yaml
# Run all scenarios
gh workflow run scenario-tests.yml

# Run a specific scenario
gh workflow run scenario-tests.yml -f scenario=copilot-chat-basic

# Run scenarios with a specific tag
gh workflow run scenario-tests.yml -f tags=copilot
```

### Linux Runner Requirements

The workflow installs these dependencies:
- `xvfb` - Virtual framebuffer for headless display
- `libgtk-3-0`, `libnss3`, etc. - VS Code dependencies
- Playwright Chromium for browser automation

---

## Documentation Verification

Verify that your UI matches public documentation by adding `documentationChecks` to scenarios.

### Schema

```yaml
documentationChecks:
  - id: unique-check-id
    docUrl: https://docs.example.com/feature
    description: "Verify button text matches docs"
    
    # Optional: CSS selector to extract specific content from docs
    docSelector: ".main-content h2"
    
    # Optional: Patterns that should appear in the docs
    expectedPatterns:
      - "Start Agent"
      - "background"
    
    # UI elements to verify against docs
    uiMatches:
      - selector: "button.primary"
        expectedText: "Start Agent"  # From docs
        fuzzyMatch: true  # Allow similar text
      
      - description: "Agent status panel"
        selector: "[aria-label*='Agent']"
```

### How It Works

1. **Fetch Documentation**: The system fetches the specified URL and extracts text
2. **Check Patterns**: Verifies expected patterns appear in the documentation
3. **Match UI Elements**: Compares UI element text against expected documentation text
4. **Generate Report**: Creates a sync report showing matches and mismatches

### Example Use Cases

- Verify button labels match documentation
- Ensure terminology is consistent between UI and docs
- Catch when docs are updated but UI is not (or vice versa)

---

## Real Repository Workspaces

Test against real repositories by specifying them in the `environment` section.

### Basic Clone

```yaml
environment:
  vscodeTarget: desktop
  vscodeVersion: stable
  
  repository:
    url: https://github.com/microsoft/vscode-extension-samples
    ref: main  # Branch, tag, or commit
```

### With Setup Commands

```yaml
environment:
  repository:
    url: https://github.com/your-org/your-repo
    ref: main
    subdir: packages/frontend  # Open a subdirectory
    setupCommands:
      - npm install
      - npm run build
```

### Sparse Checkout (Large Repos)

For large repositories, use sparse checkout to clone only needed paths:

```yaml
environment:
  repository:
    url: https://github.com/microsoft/vscode
    ref: main
    sparse: true
    sparsePaths:
      - src/vs/workbench/contrib/chat/
      - extensions/github-authentication/
```

### Workspace Caching

Workspaces are cached in `~/.scenario-runner/workspaces/`. To manage:

```bash
# List cached workspaces
# (API available via code)

# Prune old workspaces (older than 7 days)
# Automatically done in CI
```

---

## Orchestrated Scenarios

For complex, long-running scenarios (like background agents that take 5-15 minutes), use orchestration mode.

### When to Use Orchestration

- Scenarios that take more than 5 minutes
- Workflows requiring multiple VS Code sessions
- Tests with async processes that need polling
- Scenarios that need checkpoint/resume capability

### Basic Structure

```yaml
id: complex-scenario
name: "Complex Long-Running Test"
priority: P0

# Fallback steps for non-orchestrated mode
steps:
  - id: placeholder
    description: "This scenario requires orchestration"
    action: wait
    args:
      duration: 1000

# Orchestration configuration
orchestration:
  enabled: true
  totalTimeout: 1800000  # 30 minutes
  checkpointInterval: 60000  # Save state every minute
  failureStrategy: continue  # continue | retry | skip | abort
  maxRetries: 2
  
  milestones:
    - id: setup
      name: "Setup Phase"
      critical: true
      steps:
        - id: open_app
          description: "Open application"
          action: openCopilotChat
      waitFor:
        - type: element
          target: ".chat-widget"
          timeout: 30000
    
    - id: start_agent
      name: "Start Background Agent"
      dependsOn: [setup]
      steps:
        - id: trigger
          description: "Trigger agent"
          action: sendChatMessage
          args:
            message: "@agent do something"
      waitFor:
        - type: agentComplete
          timeout: 600000  # 10 minutes
          pollInterval: 10000
```

### Milestone Features

| Feature | Description |
|---------|-------------|
| `dependsOn` | List of milestone IDs that must complete first |
| `parallel` | If true, can run in parallel with other milestones |
| `critical` | If true, failure stops the entire scenario |
| `waitFor` | Conditions to wait for after steps complete |
| `screenshot` | Take screenshot at milestone completion |
| `timeout` | Override timeout for this milestone |

### Wait Conditions

```yaml
waitFor:
  # Wait for UI element
  - type: element
    target: ".success-indicator"
    timeout: 30000
  
  # Wait for text to appear
  - type: text
    expected: "Operation complete"
    timeout: 60000
  
  # Wait for VS Code notification
  - type: notification
    expected: "Agent finished"
    timeout: 300000
  
  # Wait for file to exist
  - type: file
    target: "./output/result.json"
    timeout: 60000
  
  # Wait for agent to complete
  - type: agentComplete
    timeout: 900000  # 15 minutes
    pollInterval: 10000
  
  # Just wait for a duration
  - type: timeout
    timeout: 5000
```

### Multi-Session Support

Run multiple VS Code instances simultaneously:

```yaml
orchestration:
  enabled: true
  
  sessions:
    - id: primary
      freshProfile: true
      vscodeVersion: insiders
      repository:
        url: https://github.com/org/repo-a
    
    - id: secondary
      freshProfile: true
      vscodeVersion: stable
      repository:
        url: https://github.com/org/repo-b
  
  milestones:
    - id: compare_behavior
      name: "Compare across versions"
      # Milestones can target specific sessions (future feature)
```

### Checkpointing & Resume

Orchestrated scenarios save checkpoints for resumability:

```yaml
orchestration:
  checkpointInterval: 60000  # Every minute
  checkpointPath: ./checkpoints/my-scenario.json
```

If a scenario fails partway through, re-running it will resume from the last checkpoint.

### Running Orchestrated Scenarios

```bash
# Run normally - orchestration is auto-detected
node packages/cli/dist/index.js run background-agent-orchestrated

# Force orchestration mode
node packages/cli/dist/index.js run my-scenario --orchestrated

# With video (recommended for long runs)
node packages/cli/dist/index.js run background-agent-orchestrated --video
```

---

## Example: Complete Background Agent Scenario

See `scenarios/background-agent-orchestrated.yaml` for a full example that:

1. Clones a real repository
2. Starts multiple background agents
3. Waits for them to complete (5-15 minutes each)
4. Captures screenshots at each milestone
5. Verifies against documentation

```bash
# Run the example
node packages/cli/dist/index.js run background-agent-orchestrated --video
```

---

## Best Practices

1. **Start Simple**: Begin with standard scenarios, graduate to orchestration
2. **Use Milestones**: Break complex flows into logical milestones
3. **Set Reasonable Timeouts**: Background agents can take 15+ minutes
4. **Enable Checkpoints**: For scenarios over 5 minutes
5. **Record Video**: Essential for debugging long-running scenarios
6. **Verify Docs**: Add documentation checks for user-facing features
7. **Use Real Repos**: Test with production-like codebases

---

## Telemetry Validation

Verify that expected telemetry events fire during scenario execution. This is useful for ensuring analytics aren't broken by UI changes.

### Configuration

Add a `telemetry` section to your scenario:

```yaml
telemetry:
  enabled: true
  captureAll: true  # Capture all events for debugging
  failOnMissing: true  # Fail if required events don't fire
  expectedEvents:
    - event: "copilot/chat/opened"
      required: true
      timeout: 5000
      
    - event: "copilot/chat/messageSubmitted"
      required: true
      duringStep: send_message  # Only check during this step
      properties:
        hasContext: true  # Verify specific properties
        
    - event: "copilot/chat/responseReceived"
      required: false  # Optional event
      timeout: 30000
```

### Expected Event Properties

| Property | Type | Description |
|----------|------|-------------|
| `event` | string | Telemetry event name to match |
| `required` | boolean | Whether scenario fails if event not found |
| `timeout` | number | Time to wait for event (ms) |
| `duringStep` | string | Only check during specific step |
| `properties` | object | Key-value pairs that must match |

### Report Output

After running, you'll get a telemetry validation report:

```
# Telemetry Validation Report

**Status:** ✅ PASSED
**Events Captured:** 12

## Expected Events
| Event | Required | Found | Status |
|-------|----------|-------|--------|
| copilot/chat/opened | Yes | Yes | ✅ |
| copilot/chat/messageSubmitted | Yes | Yes | ✅ |
```

### Use Cases

- Verify analytics events fire correctly
- Ensure feature flags are tracked
- Debug missing or duplicate events
- Validate event properties

---

## Error Recovery Testing

Test how your features handle various error conditions gracefully by injecting failures and verifying recovery behavior.

### Configuration

Add an `errorRecovery` section to your scenario:

```yaml
errorRecovery:
  enabled: true
  isolateScenarios: true  # Reset between each error test
  scenarios:
    - id: network_timeout_chat
      inject: networkTimeout
      duringStep: send_message
      expectRecovery:
        - errorMessageShown
        - retryBehavior
        - statePreserved
      recoveryTimeout: 30000
      description: "Verify chat handles network timeout gracefully"
      
    - id: rate_limit_response
      inject: apiRateLimit
      duringStep: send_message
      expectRecovery:
        - errorMessageShown
        - userPrompted
      recoveryTimeout: 15000
```

### Injection Types

| Type | Description |
|------|-------------|
| `networkTimeout` | Simulate network timeout for API calls |
| `networkError` | Simulate connection failure |
| `apiRateLimit` | Return 429 Too Many Requests |
| `apiError` | Return 500 Internal Server Error |
| `extensionCrash` | Simulate extension host crash |
| `authExpired` | Return 401 Unauthorized |
| `diskFull` | Simulate storage quota exceeded |
| `permissionDenied` | Return 403 Forbidden |

### Expected Recovery Behaviors

| Behavior | What it checks |
|----------|----------------|
| `errorMessageShown` | Error notification or message displayed |
| `retryBehavior` | Retry button or automatic retry |
| `fallbackUsed` | Fallback content or cached data shown |
| `gracefulDegradation` | UI remains functional but limited |
| `reconnectAttempt` | Connection status/reconnecting indicator |
| `userPrompted` | Dialog or prompt asking user action |
| `operationCancelled` | Cancellation confirmation shown |
| `statePreserved` | User data and state not lost |

### Report Output

```
# Error Recovery Test Report

**Overall:** 3/4 scenarios passed

| Scenario | Error Injected | Status | Recovery Time |
|----------|----------------|--------|---------------|
| network_timeout_chat | networkTimeout | ✅ Passed | 2340ms |
| rate_limit_response | apiRateLimit | ✅ Passed | 1205ms |
| auth_expired | authExpired | ❌ Failed | N/A |
```

### Use Cases

- Verify error handling for all failure modes
- Test retry logic and backoff
- Ensure graceful degradation
- Validate error messages are helpful

---

## Scenario Generation from Recordings

Automatically generate scenario YAML files by recording your actions in VS Code. This is the fastest way to create new scenarios.

### Recording a Scenario

```bash
# Start interactive recording
node packages/cli/dist/index.js record --interactive

# With pre-set metadata
node packages/cli/dist/index.js record \
  --name "My Feature Test" \
  --description "Testing the new feature" \
  --output ./scenarios/my-feature.yaml

# Record in a specific workspace
node packages/cli/dist/index.js record --workspace ./my-project
```

### Interactive Mode

When you run with `--interactive`, you'll be prompted:

```
📝 Scenario Generation Wizard

Recorded 15 actions.

Scenario name: My Copilot Test
Description: Test inline suggestions
Priority (P0/P1/P2) [P1]: P1
Tags (comma-separated) [recorded]: copilot,suggestions
Owner: dev-team
Use LLM to enhance descriptions? (y/n) [y]: y
```

### Recording Tips

1. **Keep it focused**: Record one feature at a time
2. **Pause for waits**: Natural pauses become explicit waits
3. **Use keyboard shortcuts**: They're automatically detected
4. **Clean state**: Start from a fresh VS Code window

### Action Detection

The recorder automatically detects:

| Shortcut | Detected Action |
|----------|-----------------|
| `Cmd+Shift+P` | Open Command Palette |
| `Cmd+Shift+I` | Open Copilot Chat |
| `Cmd+I` | Open Inline Chat |
| `Cmd+P` | Quick Open |
| `Cmd+S` | Save file |
| `Tab` | Accept suggestion |

### LLM Enhancement

When enabled, the LLM will:
- Improve step descriptions to be clearer
- Detect semantic actions (e.g., "Execute command: X")
- Combine related actions into single steps
- Suggest better action names

### Generated Output

```yaml
id: recorded-abc12345
name: My Copilot Test
description: Test inline suggestions
priority: P1
tags:
  - copilot
  - suggestions

steps:
  - id: step_1
    description: Open Copilot Chat panel
    action: openCopilotChat
    optional: false
    hints:
      - type: keyboard
        value: "Cmd+Shift+I"

  - id: step_2
    description: Send chat message asking for help
    action: sendChatMessage
    optional: false
    args:
      message: "Write a hello world function"
```

### Programmatic API

You can also use the generator programmatically:

```typescript
import { 
  generateScenarioFromRecording, 
  generateScenarioYAML,
  combineSemanticActions 
} from '@scenario-grader/core';

// From raw actions
const actions: RawAction[] = [
  { type: 'keyboard', key: 'I', modifiers: ['Meta', 'Shift'], timestamp: 0 },
  { type: 'type', text: 'Hello world', timestamp: 1000 },
  // ...
];

// Generate scenario
const scenario = await generateScenarioFromRecording(actions, {
  name: 'My Test',
  description: 'Testing feature',
  priority: 'P1',
  useLLM: true,
});

// Or get YAML directly
const yaml = await generateScenarioYAML(actions);
```

---

## Complete Example

Here's a scenario using multiple advanced features together:

```yaml
id: copilot-full-test
name: Complete Copilot Test Suite
description: Comprehensive test with telemetry and error recovery
priority: P0
tags:
  - copilot
  - comprehensive

environment:
  vscode: stable
  repository:
    url: https://github.com/microsoft/vscode-extension-samples
    ref: main
    subdir: helloworld-sample

telemetry:
  enabled: true
  expectedEvents:
    - event: "copilot/chat/opened"
      required: true

errorRecovery:
  enabled: true
  scenarios:
    - id: network_test
      inject: networkTimeout
      duringStep: send_message
      expectRecovery:
        - errorMessageShown
        - retryBehavior

documentationChecks:
  - id: chat-panel-docs
    docUrl: https://code.visualstudio.com/docs/copilot/copilot-chat
    verifyAspect: "Chat panel UI and terminology"

steps:
  - id: open_chat
    description: Open Copilot Chat
    action: openCopilotChat
    optional: false

  - id: send_message
    description: Send a message
    action: sendChatMessage
    optional: false
    args:
      message: "Explain this code"
```
