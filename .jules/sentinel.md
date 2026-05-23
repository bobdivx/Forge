## 2024-05-24 - Command Injection Risk in docker logs endpoint
**Vulnerability:** Node.js `execSync` combined with unsanitized URL query parameters (`id` and `tail`) directly interpolated into a shell string caused a command injection vulnerability. Additionally, user-controlled flags were not validated.
**Learning:** Raw shell execution functions (like `execSync`) evaluate shell meta-characters. Interpolating user inputs into these functions exposes the application to remote code execution (RCE) and argument/flag injection.
**Prevention:**
1. Prefer `execFile` or `execFileAsync` where parameters are provided as an array so they are not evaluated by the shell.
2. Explicitly validate variables meant to be command arguments to ensure they do not start with hyphens (`-`) to avoid flag injection.
3. Separate executable targets and variables using double-dashes (`--`) if the command supports it.
