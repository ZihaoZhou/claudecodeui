# Bugs Found in Original Repo (siteboon/claudecodeui)

All bugs discovered during debugging session on 2025-02-23.

## Critical: spawn EBADF (Bad File Descriptor)

**Symptom**: Chat interface stuck at "Thinking..." forever. Server logs show `Error: spawn EBADF`.

**Root Cause**: When the server is launched from within Claude Code (or any parent process with many FDs), macOS `posix_spawn` inherits ~79,000+ file descriptors. Most are invalid/closed, and `posix_spawn` fails with EBADF when encountering them.

**Affected**: Both SDK (`claude-sdk.js`) and PTY (`node-pty`) spawns.

**Fix**: Close inherited FDs in bash before starting node:
```bash
bash -c 'for fd in $(seq 3 255); do eval "exec $fd>&-" 2>/dev/null; done; exec node server/index.js'
```

**Note**: Closing FDs inside Node.js (via `fs.closeSync`) kills libuv's kqueue FDs and crashes with `Assertion failed: (errno == EINTR), function uv__io_poll`.

---

## Critical: SDK Uses Bundled CLI Instead of Local One

**Symptom**: SDK auth failures, version mismatch. Server uses bundled `cli.js` (v2.1.50) instead of user's local `~/.local/bin/claude` (e.g. v2.1.40).

**Root Cause**: `server/claude-sdk.js` does not pass `pathToClaudeCodeExecutable` to the SDK's `query()` function. The SDK defaults to its own bundled CLI which doesn't have the user's credentials.

**Fix**: Pass the path explicitly:
```js
sdkOptions.pathToClaudeCodeExecutable = process.env.CLAUDE_CLI_PATH || findClaudeBinary();
```

---

## High: Shell Hardcoded to bash

**Symptom**: Shell tab fails with exit code 127 (command not found) because PATH doesn't include `~/.local/bin`.

**Root Cause**: `server/index.js` hardcodes `'bash'` as the shell and uses `-c` (non-login). On macOS where users use zsh, PATH setup from `.zprofile`/`.zshrc` is skipped.

**Fix**:
```js
const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'zsh');
const shellArgs = os.platform() === 'win32' ? ['-Command', shellCommand] : ['-lc', shellCommand];
```

---

## High: CLAUDECODE Env Var Leaks to Child Processes

**Symptom**: Shell tab's claude process exits immediately with code 1.

**Root Cause**: `pty.spawn()` in `server/index.js` spreads `...process.env` into child env, which includes the `CLAUDECODE` environment variable set by the parent Claude Code process. This causes the child `claude` process to detect it's being run inside another Claude instance and exit.

**Fix**: Filter out `CLAUDECODE` from the env passed to pty.spawn:
```js
const { CLAUDECODE, ...cleanEnv } = process.env;
env: { ...cleanEnv, TERM: 'xterm-256color', ... }
```

---

## Medium: Auth Status Only Checks OAuth, Not API Key

**Symptom**: "Claude not connected" shown in onboarding even though Claude Code works fine via API key.

**Root Cause**: `server/routes/cli-auth.js` `checkClaudeCredentials()` only checks `~/.claude/.credentials.json` for `claudeAiOauth.accessToken`. Users authenticating via `ANTHROPIC_API_KEY` env var are not detected.

**Fix**: Also check for API key environment variable or `claude --version` success as auth indicator.

---

## Medium: Onboarding Uses Invalid CLI Argument

**Symptom**: Onboarding "Connect Claude" step runs `claude /exit --dangerously-skip-permissions`, which fails because `/exit` is a REPL slash command, not a CLI argument.

**Root Cause**: `src/components/LoginModal.jsx` line 34:
```js
return isOnboarding ? 'claude /exit --dangerously-skip-permissions' : 'claude /login --dangerously-skip-permissions';
```

**Fix**: Removed entire onboarding flow in clean fork.

---

## Medium: node-pty spawn-helper Missing Execute Permission

**Symptom**: `posix_spawnp` error when opening Login Modal on fresh install.

**Root Cause**: `node-pty`'s `spawn-helper` binary loses execute permission during npm install on macOS.

**Fix**: Already handled by `scripts/fix-node-pty.js` postinstall script. Just need to run `npm install`.

---

## Low: Version Check Polls GitHub API

**Symptom**: Server makes periodic requests to GitHub API to check for updates.

**Impact**: Minor - leaks server IP to GitHub. Acceptable for most users.

---

## Architecture Issues

### Breadth-First Development
The repo added Codex, Cursor, and TaskMaster integrations before getting the core Claude functionality working reliably. This resulted in:
- ~22 unnecessary component files
- ~600+ lines of unused route/handler code in server/index.js
- Provider abstraction complexity throughout the codebase with no working benefit

### SDK Architecture Mismatch
The `@anthropic-ai/claude-agent-sdk` bundles its own CLI binary and spawns it as a child process. This creates:
- Version mismatch between bundled CLI and user's installed version
- Auth credential isolation (bundled CLI can't access user's OAuth/API key)
- Redundant binary management (user already has claude installed)

The repo should either:
1. Always use `pathToClaudeCodeExecutable` pointing to user's local claude binary
2. Or bypass the SDK entirely and use the Shell/PTY approach (which works more reliably)
