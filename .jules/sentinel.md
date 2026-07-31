## 2024-05-18 - Docker Logs Command Injection
**Vulnerability:** Unsanitized container ID and tail parameters directly interpolated into a shell command `execSync(\`docker logs --tail ${tail} ${containerId}\`)` in `src/pages/api/docker-logs.ts`, leading to Command Injection.
**Learning:** Using `execSync` with template literals on query parameters allows arbitrary shell execution if the parameters contain characters like `;` or `&&`. This represents a critical vulnerability in backend API routes directly consuming client input. Error messages also leaked internal stack traces.
**Prevention:**
1. Always use `execFile` or `execFileAsync` which executes without a shell, preventing operator injection.
2. Implement strict regex validation for all input parameters (e.g., `/^[a-zA-Z0-9_.-]+$/` for container IDs and `/^\d+$/` for counts).
3. Catch and sanitize execution errors before responding to the client, logging details internally.
