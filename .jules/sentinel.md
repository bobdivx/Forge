## 2025-03-08 - Fix command injection in docker API
**Vulnerability:** Command injection in src/pages/api/docker/containers.ts via unsanitized JSON body parameters passed directly to execAsync.
**Learning:** Node.js exec calls passed unsanitized inputs are highly vulnerable to command injection.
**Prevention:** Use execFile or spawn with an array of arguments, and validate incoming strings against strict regex (e.g. /^[a-zA-Z0-9_.-]+$/).
