
## 2024-05-24 - Command Injection in github-clone
**Vulnerability:** Command injection vulnerability in `src/pages/api/github-clone.ts` due to using `exec` with unvalidated, concatenated inputs (`repoUrl` and `repoName`).
**Learning:** Using `exec` directly is risky when processing user inputs, especially external URLs or repository names, as it executes a shell and evaluates shell metacharacters. Even when attempting to mitigate command injection by replacing `exec` with `execFile`, we must validate that user inputs don't inadvertently act as flags (e.g., arguments starting with `-`) or contain unsafe characters. Furthermore, errors returned by shell operations often echo the exact command that failed, which can lead to secret token leakage if embedded within the arguments (like OAuth tokens in a Git URL).
**Prevention:**
1. Prefer `execFile` or `execFileAsync` (with `util.promisify`) over `exec` to avoid shell execution entirely. Pass inputs explicitly as an array of arguments.
2. Use the `--` separator before user-provided paths/URLs to prevent flag injection.
3. Add strict input validation (e.g., regex `^[a-zA-Z0-9_.-]+$`) and prevent inputs starting with a hyphen (`-`).
4. Always sanitize `error.message` in the catch block to redact sensitive tokens before returning it in an API response.
