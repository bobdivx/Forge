## 2024-05-24 - Fix Command Injection in docker-logs API
**Vulnerability:** Command injection vulnerability found in `src/pages/api/docker-logs.ts` where unvalidated query parameters (`containerId` and `tail`) were passed directly into a shell string executed by `execSync()`.
**Learning:** Shell strings using template literals with unsanitized user inputs (`execSync(\`docker logs --tail ${tail} ${containerId}\`)`) lead to direct shell/command injection which could result in RCE on the backend server.
**Prevention:** Use `execFile` or `execFileAsync` with an argument array instead of a raw shell string to bypass shell interpolation, and explicitly validate parameters using regex (e.g. `/^[a-zA-Z0-9_.-]+$/`) to prevent argument injection.
