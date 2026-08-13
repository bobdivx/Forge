## 2024-05-23 - Command injection vulnerability in execSync
**Vulnerability:** The API endpoint `src/pages/api/docker-logs.ts` utilized `execSync` to run a `docker logs` shell command using unsanitized user inputs (`containerId` and `tail` via query string parameters) directly embedded in the string.
**Learning:** Raw execution methods like `exec` and `execSync` easily allow shell injection when unsanitized user input is concatenated.
**Prevention:** Always use safe, file-based execution wrappers like `execFile` or `execFileAsync` along with providing arguments via an explicit array instead of relying on string formatting. Furthermore, perform strict regex checks against all user input used as command parameters to deny injection of arbitrary flags or commands.
