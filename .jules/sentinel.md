## 2026-05-22 - [Fix Command Injection in Docker Logs]
**Vulnerability:** `execSync` used with user-provided `containerId` and `tail` parameters in `src/pages/api/docker-logs.ts` allowed arbitrary command execution and flag injection.
**Learning:** When executing system commands like `docker logs`, it is essential to use `execFile` or `spawn` with arguments passed as an array to prevent shell interpretation. Additionally, arguments must be validated to ensure they don't start with hyphens to prevent flag injection, and errors from shell execution shouldn't be blindly forwarded to the API client.
**Prevention:** Use `execFileAsync` with argument arrays and add explicit parameter validation for hyphens. Always sanitize output in catch blocks to prevent leaking internal error stacks.
