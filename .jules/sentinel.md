## 2024-05-18 - Prevent Command Injection via execSync
**Vulnerability:** Shell Command Injection via unsanitized user inputs passed to `execSync` (`execSync(\`docker logs --tail ${tail} ${containerId}\`)`).
**Learning:** `execSync` executes commands via a shell which makes it trivial to inject arbitrary shell commands if variables are untrusted.
**Prevention:** Use `execFile` (or its Promisified async wrapper) and pass arguments strictly as an array to prevent any shell evaluation. Use double dashes (`--`) before positional user-provided parameters to prevent malicious flags. Validate inputs explicitly against strong whitelists, e.g., `/^[a-zA-Z0-9_.-]+$/`.
