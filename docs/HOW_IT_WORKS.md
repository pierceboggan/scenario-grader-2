# How This Thing Actually Works (ELI5 Edition)

## The Big Picture

Imagine you have a robot that can click buttons and type on your computer. This tool is basically that robot, but specifically for testing VS Code.

```
┌─────────────────────────────────────────────────────────────┐
│                     YOU RUN A COMMAND                        │
│            "node cli run copilot-chat-basic"                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CLI READS SCENARIO                        │
│     "Oh, I need to open chat and send a message"            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PLAYWRIGHT LAUNCHES VS CODE                     │
│        (Like opening VS Code, but the robot controls it)    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              ROBOT DOES THE STEPS ONE BY ONE                 │
│    1. Press Cmd+Shift+I (open chat)                         │
│    2. Type "Hello! Can you help me?"                        │
│    3. Press Enter                                           │
│    4. Wait 5 seconds                                        │
│    5. Take screenshot                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    REPORT RESULTS                            │
│              "4 steps passed! Here's what I saw"            │
└─────────────────────────────────────────────────────────────┘
```

## The Key Players

### 1. Scenarios (The Script)
Think of these like a recipe. They say "do this, then do that":

```yaml
steps:
  - Open VS Code           # Step 1
  - Open Copilot Chat      # Step 2  
  - Type a message         # Step 3
  - Wait for response      # Step 4
```

Scenarios live in YAML files or are built into the code (`samples.ts`).

### 2. Playwright (The Robot Arms)
This is a library made by Microsoft that can control applications. It's like having invisible hands that can:
- Click buttons
- Type text
- Press keyboard shortcuts
- Take screenshots
- Wait for things to appear

VS Code is built on Electron (basically a web browser), and Playwright knows how to talk to Electron apps.

### 3. The Runner (The Brain)
This is our code that:
1. Reads the scenario
2. Tells Playwright what to do
3. Takes screenshots after each step
4. Reports what happened

## How Each Piece Works

### Starting VS Code

```
When you run a scenario:

1. Find VS Code on your computer
   └─> /Applications/Visual Studio Code.app/Contents/MacOS/Electron

2. Launch it with special flags
   └─> --user-data-dir=/tmp/fresh-profile  (so it doesn't mess with your real VS Code)
   └─> --disable-telemetry                 (don't phone home)
   └─> --skip-welcome                      (skip the "Welcome" tab)

3. Wait for VS Code to be ready
   └─> Look for ".monaco-workbench" element (that's VS Code's main container)
```

### Executing Steps

Each step in a scenario maps to a function:

```javascript
switch (step.action) {
  case 'openCommandPalette':
    // Press Cmd+Shift+P (or Ctrl+Shift+P on Windows)
    await page.keyboard.press('Meta+Shift+P');
    break;
    
  case 'typeText':
    // Type each character with a small delay (looks more human)
    await page.keyboard.type(text, { delay: 30 });
    break;
    
  case 'openCopilotChat':
    // Press the Copilot Chat shortcut
    await page.keyboard.press('Meta+Shift+I');
    break;
}
```

### Taking Screenshots

After every step, we grab a picture:

```javascript
await page.screenshot({ 
  path: '/path/to/screenshots/001_step-name.png',
  fullPage: true  // Get the whole window
});
```

This is super helpful for debugging - you can see exactly what the robot saw!

## The File Structure

```
scenario-grader-2/
├── packages/
│   ├── core/                 # The engine
│   │   └── src/
│   │       ├── runner.ts     # THE MAIN BRAIN - launches VS Code, runs steps
│   │       ├── types.ts      # TypeScript definitions (what a Scenario looks like)
│   │       ├── samples.ts    # Built-in test scenarios
│   │       └── parser.ts     # Reads YAML scenario files
│   │
│   └── cli/                  # Command line interface
│       └── src/
│           ├── index.ts      # Defines commands (run, list, show)
│           └── commands/
│               ├── run.ts    # The "run" command logic
│               ├── list.ts   # The "list" command logic
│               └── show.ts   # The "show" command logic
│
├── scenarios/                # YAML scenario files (optional)
│   └── copilot-chat.yaml
│
└── ~/.scenario-runner/       # Created at runtime
    └── artifacts/
        └── <run-id>/
            ├── screenshots/
            └── user-data/    # Fresh VS Code profile
```

## Data Flow (Step by Step)

```
1. YOU: "run copilot-chat-basic"
         │
         ▼
2. CLI (index.ts):
   - Parses command line arguments
   - Finds the scenario by ID
   - Calls runScenario()
         │
         ▼
3. RUNNER (runner.ts):
   - Creates artifact folder (~/.scenario-runner/artifacts/xyz123/)
   - Finds VS Code executable
   - Launches VS Code with Playwright
         │
         ▼
4. PLAYWRIGHT:
   - Starts VS Code as an Electron app
   - Returns a "page" object (like a browser tab, but it's VS Code)
         │
         ▼
5. RUNNER:
   - For each step in scenario:
     - Execute the action (keyboard, click, etc.)
     - Take a screenshot
     - Record success/failure
         │
         ▼
6. CLEANUP:
   - Close VS Code
   - Return results to CLI
         │
         ▼
7. CLI:
   - Print pretty table of results
   - Exit with success/failure code
```

## Why Fresh Profiles?

You might wonder: "Why not just use MY VS Code settings?"

The problem: If you're already running VS Code, it locks certain files. When we try to launch another VS Code with the same profile, it crashes instantly.

The solution: Create a temporary, empty profile for each test run.

```
Your VS Code:     ~/.vscode/           (your settings, extensions, etc.)
Test VS Code:     ~/.scenario-runner/artifacts/xyz/user-data/  (empty, fresh)
```

The `--reuse-profile` flag tries to use your real profile, but you have to close VS Code first.

## The Playwright Magic

Playwright talks to VS Code like this:

```
┌──────────────────────────────────────────────────────────────┐
│                        YOUR COMPUTER                          │
│  ┌─────────────────┐      WebSocket       ┌───────────────┐  │
│  │   Playwright    │◄────────────────────►│    VS Code    │  │
│  │   (Node.js)     │   "click button X"   │   (Electron)  │  │
│  │                 │   "type hello"       │               │  │
│  │                 │   "take screenshot"  │               │  │
│  └─────────────────┘                      └───────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

Playwright connects to VS Code's internal debugging port and sends commands. It's the same technology used to automate web browsers, but for desktop apps built with Electron.

## What Each Action Does

| Action | What the robot does |
|--------|-------------------|
| `launchVSCodeWithProfile` | Opens VS Code (already done at start) |
| `openCommandPalette` | Presses Cmd+Shift+P |
| `openCopilotChat` | Presses Cmd+Shift+I |
| `typeText` | Types characters one by one |
| `pressKey` | Presses a specific key (Enter, Escape, etc.) |
| `click` | Finds an element and clicks it |
| `wait` | Just waits (for animations, loading, etc.) |
| `sendChatMessage` | Types text and presses Enter |

## Adding a New Action

Want the robot to do something new? Add it to the switch statement in `runner.ts`:

```typescript
case 'myNewAction':
  // Your code here
  await page.click('.some-button');
  break;
```

Then use it in a scenario:

```yaml
steps:
  - id: do_the_thing
    action: myNewAction
    args:
      someParam: someValue
```

## That's It!

The whole system is really just:
1. **A list of steps** (scenario YAML)
2. **A robot** (Playwright) that can control VS Code  
3. **A brain** (runner.ts) that reads the steps and tells the robot what to do
4. **A reporter** (CLI) that shows you what happened

It's like a very simple video game script:
- Move right
- Jump
- Hit button
- Take screenshot
- Done! ✓
