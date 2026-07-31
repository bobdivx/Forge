## 2025-02-20 - Command Injection via execSync in API Routes
**Vulnerability:** A critical command injection vulnerability existed in `src/pages/api/docker-logs.ts` where unvalidated query parameters (`id` and `tail`) were directly interpolated into an `execSync` shell command string.
**Learning:** Using `exec` or `execSync` with dynamically constructed strings from user inputs inherently creates shell injection risks, even when attempting to parse them.
**Prevention:** Always use safe process execution methods like `execFile`, `execFileSync`, or `spawn` that accept command arguments as arrays. Additionally, enforce strict input validation (e.g., regex checking for alphanumeric characters and rejecting inputs starting with hyphens to prevent flag injection).
