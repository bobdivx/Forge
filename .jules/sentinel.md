## 2024-05-31 - Command Injection in Docker Logs API
**Vulnerability:** Found a critical command injection vulnerability in `src/pages/api/docker-logs.ts` where user-controlled `id` and `tail` parameters were directly interpolated into a string passed to `execSync()`.
**Learning:** In Astro API routes, query parameters from `url.searchParams.get()` are completely untrusted. Even seemingly safe endpoints like `docker-logs` can become RCE vectors if inputs are not sanitized.
**Prevention:** Always use `util.promisify(execFile)` and pass user inputs as distinct array elements. Add `--` before user arguments to strictly separate commands from options and prevent flag injection. Also, sanitize error messages to avoid internal info leaks to API responses.
