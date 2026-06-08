## 2025-02-17 - [Prevent Command Injection in execSync]
**Vulnerability:** Unsanitized parameters used in child_process.execSync commands in API endpoints. For example, `src/pages/api/forge-logs.ts` dynamically constructed shell commands using input query parameters via `execSync(\`tail -n \${lines} \${filePath}\`)`.
**Learning:** User inputs directly placed into bash string arguments risk command injection even if assumed to be safe. Also `execSync` blocks the Node event loop and should be avoided in API handlers.
**Prevention:** Use `execFile` or Promise-wrapped `execFileAsync` with array arguments to explicitly pass arguments to commands, avoiding shell string parsing injection vulnerabilities.
