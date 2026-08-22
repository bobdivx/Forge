## 2024-05-24 - Prevent Command Injection in SSH Client Execution
**Vulnerability:** The SSH client constructed shell commands via string concatenation (`sshCmd = "ssh ... " + escapedCommand`) and executed them via `execSync(sshCmd)`, leading to potential command injection.
**Learning:** Using `execSync` with dynamically constructed strings is dangerous, even with basic escaping. It exposes the application to shell metacharacter injection.
**Prevention:** Always use `execFileSync` (or `execFile`) with an array of arguments to bypass local shell interpolation and execute binaries directly.
