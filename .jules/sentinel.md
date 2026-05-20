## 2025-02-18 - [Command Injection in docker-logs.ts]
**Vulnerability:** Shell Command Injection via `execSync` where URL parameters (`id` and `tail`) were concatenated into the command string (`docker logs --tail ${tail} ${containerId}`).
**Learning:** Node.js API routes that execute CLI commands with URL parameters are highly vulnerable to shell injection if they use string-based execution methods like `exec` or `execSync` instead of argument arrays.
**Prevention:** Always use `execFile` (or `promisify(execFile)`) with an array of arguments, and validate that arguments do not begin with a hyphen (`-`) to prevent argument injection.
