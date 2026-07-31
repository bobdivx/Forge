## 2024-05-24 - [Avoid secret leakage in command execution errors]
**Vulnerability:** Shell execution with APIs like `exec` or `execFile` includes the arguments of the execution string in the error message if the command fails, which leaks secrets passed as parameters directly to the user/API consumer when returned verbatim in the error response.
**Learning:** Returning `error.message` directly from command execution where arguments contain sensitive tokens (e.g. `oauth2:***@github.com`) leaks the token in plain text if an operation fails.
**Prevention:** Sanitize the `error.message` via regular expression matching for secrets, or explicitly map parameters via environment variables where possible to avoid having them present in the error context.
