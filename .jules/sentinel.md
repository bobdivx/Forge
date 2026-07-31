## 2024-06-29 - Command Injection in PM2 API
**Vulnerability:** Command injection vulnerability in `src/pages/api/pm2.ts` due to `exec` with unsanitized `appName` input. It also chained commands using shell operators `&&` when `start_prod` and `build` was required.
**Learning:** `exec` executes a shell which allows shell features like `&&` or `;`, making it easy to inject commands if variables are directly passed in. It's safer to avoid shell interpreters entirely.
**Prevention:** Always use `execFile` or its promisified equivalent over `exec` to prevent shell argument injection. Validate variables coming from users. Split commands with shell operators into sequential execution flow in the application code.
