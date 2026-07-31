## 2026-06-22 - Command Injection in Docker Logs API
**Vulnerability:** Command injection vulnerability due to unsanitized inputs `id` and `tail` passed to `execSync('docker logs --tail ' + tail + ' ' + containerId)`.
**Learning:** Always use `execFile` or `execFileSync` with argument arrays and strict regex validation for user inputs rather than shell string concatenation to prevent command injection risks.
**Prevention:** Validate container IDs against `/^[A-Za-z0-9_-]+$/` and line counts against `/^\d+$/`. Replace `execSync` with `execFileAsync` (promisified `execFile`).
