## 2024-06-25 - Fix command injection risks by replacing execSync with execFileSync
**Vulnerability:** Use of `execSync` with unsanitized arguments, potentially allowing command injection.
**Learning:** `execSync` passes strings to the shell, making it vulnerable to injection if inputs aren't perfectly sanitized. `execFileSync` avoids the shell and passes arguments directly to the executable, preventing injection.
**Prevention:** Prefer `execFile` and `execFileSync` over `exec` and `execSync` whenever executing shell commands with arguments.