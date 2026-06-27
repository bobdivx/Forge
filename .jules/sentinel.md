## 2026-06-27 - Command injection in Docker containers API
**Vulnerability:** The POST endpoint to interact with Docker containers was vulnerable to command injection via the `id` and `action` parameters, which were concatenated into a `curl` command executed with `exec`.
**Learning:** Shell commands should not be constructed using string concatenation with user-provided inputs.
**Prevention:** Use `execFile` or `execFileAsync` with argument arrays, and validate user inputs with strict regex constraints (e.g., `/^[a-zA-Z0-9_.-]+$/`) before executing shell commands.
