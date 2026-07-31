
## 2024-05-18 - Critical Command Injection Risk in Shell Command Construction
**Vulnerability:** Found multiple instances (e.g., `src/pages/api/docker-logs.ts`) where user input parameters (like `id` or `tail` search params) were being concatenated directly into shell command strings executed via synchronous functions like `execSync`.
**Learning:** Constructing strings for shell execution makes the application critically vulnerable to command injection if input parameters contain shell metacharacters (e.g., `;`, `|`, `$()`). Relying purely on input validation when executing arbitrary strings provides a weaker defense-in-depth compared to avoiding a shell interpreter entirely.
**Prevention:** Always use `execFile` or `spawn` (or their promisified equivalents) and pass arguments as an array rather than a single concatenated string. Additionally, apply strict Regex-based validation on any user input meant for shell command parameters (e.g., ensuring an ID is alphanumeric).
