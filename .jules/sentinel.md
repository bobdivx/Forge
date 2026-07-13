## 2024-05-24 - Command Injection in Docker Logs API
**Vulnerability:** Command injection via unsanitized `containerId` parameter in `src/pages/api/docker-logs.ts` using `execSync(command)`.
**Learning:** Node.js child_process methods like `exec` and `execSync` pass arguments to a shell, making them vulnerable to shell injection if variables aren't properly sanitized. This codebase has multiple calls wrapping Docker CLI commands that might be vulnerable.
**Prevention:** Always use `execFile` or `execFileSync` (or `promisify(execFile)`) and pass arguments as an array instead of concatenating strings. In addition, validate parameters against a strict regex whitelist before execution. Do not expose `error.message` from exec failures as they might contain internal commands or secrets.
