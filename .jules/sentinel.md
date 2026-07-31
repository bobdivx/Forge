## 2025-02-27 - [Fix Command Injection in API Routes]
**Vulnerability:** Found multiple API routes (`docker-logs.ts`, `docker-health.ts`, `github-clone.ts`) using `execSync` and `exec` with string interpolation for executing shell commands involving user inputs, leading to potential command injection.
**Learning:** External processes should be spawned safely using explicit arrays of arguments, preventing argument injections.
**Prevention:** Avoid `exec` and `execSync` altogether when running commands with variable parameters. Use `execFile` or `execFileAsync` (`promisify(execFile)`) providing an explicit array for arguments. For Git clone, make sure to separate URL arguments with `--`. Check and validate user inputs with regex.
