## 2024-05-09 - Command Injection in docker logs via execSync
**Vulnerability:** Command injection and event loop blocking in `src/pages/api/docker-logs.ts` and `src/pages/api/forge-logs.ts` due to string concatenation with user input inside `execSync()`.
**Learning:** Using `execSync(command)` with user-derived inputs (like `tail` and `containerId`) allows arbitrary command execution if an attacker uses shell metacharacters like `;` or `&&`. Furthermore, synchronous execution blocks the main thread.
**Prevention:** Always use `execFile` or `spawn` with an array of arguments for OS commands, which prevents the shell from interpreting metacharacters. Additionally, validate inputs (e.g., rejecting strings starting with `-`) to prevent argument injection.
