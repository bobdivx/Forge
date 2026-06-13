## 2024-05-24 - Fix command injection in docker logs API
**Vulnerability:** Command injection vulnerability via `execSync` where user-controlled parameters (`url.searchParams.get('id')` and `tail`) were directly concatenated into a shell command (`docker logs --tail ${tail} ${containerId}`).
**Learning:** Avoid `execSync` and string concatenation for executing shell commands, as they allow arbitrary command execution via characters like `;`, `&`, or `|`. Always use execution methods that bypass the shell parser (e.g., `execFile` or `spawn`) and pass arguments as an explicit array. Additionally, user input must be strictly validated to prevent flag injection, even when using an array format.
**Prevention:**
1. Use `execFile` or `execFileAsync` (via `promisify(execFile)`) instead of `execSync`.
2. Pass parameters as an array.
3. Validate user inputs (e.g., matching against `/^[a-zA-Z0-9_.-]+$/` and checking for leading `-`) to prevent flag injection.
4. Use the `--` separator before positional arguments in shell commands to signal the end of options.
