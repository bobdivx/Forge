## 2025-02-14 - Fix Command Injection in Docker Logs API
**Vulnerability:** Command injection due to unsanitized input concatenated into an `execSync` string.
**Learning:** Passing user input directly to shell commands via `execSync` creates critical vulnerabilities. Inputs meant as arguments or flags must be strictly sanitized and passed as array elements.
**Prevention:** Replace `execSync` and `exec` with `execFileAsync` or `execFile`, utilizing argument arrays and explicitly separating options from arguments with `--` to eliminate command and argument injection vectors.
