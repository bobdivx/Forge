## 2025-05-02 - [CRITICAL] Command Injection in PM2 API
**Vulnerability:** Command injection in `src/pages/api/pm2.ts` due to unsanitized interpolation of `appName` and `scriptPath` in `node:child_process` `exec` commands.
**Learning:** API endpoints executing shell commands with user-provided parameters directly using template literals without validation or using `exec` instead of `execFile` create critical RCE risks.
**Prevention:** Always validate and sanitize user input against strict regex allowlists (e.g., `^[a-zA-Z0-9_.-]+$`) before using them in shell commands, or prefer `execFile` over `exec` to avoid shell parsing.
