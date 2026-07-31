## 2026-06-30 - Fix Command Injection in Docker Containers API
**Vulnerability:** Command injection via unsafe `exec` interpolation of user-supplied `id` and `action` in `curl` shell command.
**Learning:** Direct string interpolation into shell commands using `exec` creates severe security risks, even for internal tools.
**Prevention:** Always use `execFile` with argument arrays to prevent shell parsing of user input, and strictly validate inputs against regex patterns.
