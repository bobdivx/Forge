## 2023-10-27 - [Command Injection via Docker Logs]
**Vulnerability:** Command injection vulnerability in `src/pages/api/docker-logs.ts` caused by unsanitized URL parameters (`tail` and `containerId`) being passed directly to `execSync("docker logs...")`.
**Learning:** External inputs like URL search parameters should never be interpolated into shell commands. This can lead to arbitrary code execution or argument injection.
**Prevention:** Always validate URL parameters with strict regex patterns (e.g. `/^[a-zA-Z0-9_.-]+$/`) and use `execFile` or `spawn` with an argument array instead of string-based commands like `exec` or `execSync`. Additionally, prefer asynchronous execution (`execFileAsync`) for process calls in API routes to prevent event loop blocking.
