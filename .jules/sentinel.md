## 2025-06-19 - Command Injection in Node.js child_process.exec
**Vulnerability:** Found `exec` being used with unsanitized user inputs (`appName`) in `src/pages/api/pm2.ts` for PM2 shell commands, which can lead to arbitrary shell command execution.
**Learning:** Shell commands constructed through string interpolation with user input using `exec` or `execSync` are inherently vulnerable to command injection.
**Prevention:** Always use `execFile`, `execFileSync`, or `spawn` where the command and arguments are passed as a strictly structured array, bypassing shell interpolation altogether.
