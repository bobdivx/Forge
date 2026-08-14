## 2024-05-18 - Command Injection in docker-logs.ts
**Vulnerability:** Command injection vulnerability in `src/pages/api/docker-logs.ts` caused by concatenating user input (`containerId` and `tail`) directly into a shell string executed synchronously with `execSync`.
**Learning:** Using `execSync` or `exec` with unsanitized parameters passed into the command string allows an attacker to execute arbitrary shell commands.
**Prevention:** Always use `execFile` or `execFileAsync` with argument arrays to prevent shell interpolation, combined with strict input validation (e.g. regex for identifiers).
