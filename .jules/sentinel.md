## 2024-05-18 - Fix Command Injection in API execution
**Vulnerability:** The `src/pages/api/docker-logs.ts` API route had a CRITICAL command injection vulnerability where unsanitized user inputs (`containerId` and `tail`) were directly interpolated into a string executed by `execSync`.
**Learning:** Shell interpreters like `execSync` evaluate meta-characters natively, permitting command breakouts.
**Prevention:** Always use safe primitives like `execFile` or `execFileAsync` where parameters are passed explicitly as an array. Furthermore, thoroughly validate dynamic inputs using regex (e.g., `/^[a-zA-Z0-9_.-]+$/`) to reject special characters, prohibit starting hyphens (`-`) to mitigate flag injection, and use the `--` double-dash operator to demarcate options from positional arguments.
