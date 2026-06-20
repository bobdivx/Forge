## 2024-05-18 - Command Injection in docker logs
**Vulnerability:** Command injection due to unsanitized `containerId` and `tail` concatenated into `execSync` string (`docker logs --tail ${tail} ${containerId}`).
**Learning:** `execSync` and `exec` interpret inputs as shell commands, making string concatenation vulnerable to injection (e.g. `123; echo pwned`).
**Prevention:** Avoid `execSync`/`exec`. Use `execFile` or `execFileAsync` (promisified) which accept arguments as an array, bypassing the shell. Also, validate inputs against expected patterns (e.g. `/^[a-zA-Z0-9_.-]+$/`).
