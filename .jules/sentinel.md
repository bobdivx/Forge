## 2024-06-11 - [CRITICAL] Command Injection in Shell Execution
**Vulnerability:** Node.js API routes were using `execSync` with concatenated user input (`containerId` and `tail`) to execute shell commands like `docker logs`. This allowed arbitrary shell command execution if user input contained shell metacharacters (e.g., `;` or `|`).
**Learning:** Even internal or admin-facing routes must not trust user input. The application's architecture frequently interacts with the underlying system (e.g., Docker, logs, system status), making it a prime target for command injection if inputs are unvalidated.
**Prevention:**
1. Always use `execFile` or `execFileAsync` (via `promisify`) instead of `exec` or `execSync` to bypass the shell interpreter entirely.
2. Pass arguments as a strict array, ensuring user input is treated as arguments, not executable commands.
3. Use the `--` separator to signify the end of command options to prevent flag injection.
4. Validate user input formats (e.g., `^[a-zA-Z0-9_.-]+$`) and reject anything that starts with `-` before it reaches execution logic.
