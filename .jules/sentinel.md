## 2025-02-18 - Fix Command Injection Vulnerability in docker-logs.ts
**Vulnerability:** Un-sanitized `id` and `tail` parameters were directly interpolated into a shell string executed via `execSync` in `src/pages/api/docker-logs.ts`, leading to arbitrary command injection.
**Learning:** Node's `execSync` (and `exec`) executes a shell, allowing attackers to inject shell metacharacters (e.g., `;`, `&`, `|`, `` ` ``) when input is dynamically included.
**Prevention:** Always use `execFile` or `execFileAsync` with explicitly structured argument arrays instead of shell command strings when dealing with user-provided parameters. Furthermore, explicitly validate parameters against flag injection (e.g. `startsWith('-')`).
