## 2025-03-09 - Sanitize Error Messages for Shell Commands with Tokens
**Vulnerability:** Command execution error messages (like `git clone`) can leak sensitive authentication tokens injected into the URL/command if the raw `error.message` is returned directly to the client.
**Learning:** Always sanitize output strings (using regex or redaction) before sending error messages derived from system processes to the frontend API responses, especially when tokens are involved.
**Prevention:** Use `.replace(/https:\/\/[^@]+@/g, 'https://***@')` or similar patterns in catch blocks when handling process errors containing URLs with embedded credentials.
