
## 2024-05-24 - Command Injection in Docker Logs API
**Vulnerability:** Command injection vulnerability existed in `src/pages/api/docker-logs.ts` due to `execSync` directly interpolating user input (`containerId` and `tail`) into the shell command string without validation.
**Learning:** Node.js child_process functions like `exec` and `execSync` that execute commands in a shell inherently carry severe command injection risks when any portion of the command string is user-controlled.
**Prevention:** Always use safe execution methods like `execFile`, `execFileSync`, or `spawn` combined with explicitly defined argument arrays to separate the executable path from its arguments. In addition, rigorously validate all user inputs against strict allowlists or regex patterns (e.g., `/^[a-zA-Z0-9_.-]+$/`) before passing them to the process.
