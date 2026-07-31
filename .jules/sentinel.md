## 2024-05-06 - [Critical Command Injection in git clone]
**Vulnerability:** Command injection and argument injection in `src/pages/api/github-clone.ts`.
**Learning:** `child_process.exec()` was used with interpolated user input (`repoUrl` and `repoName`), which allows arbitrary shell commands. Even after replacing it with `execFile`, there's still a risk of flag/argument injection if a user supplies a `repoName` starting with a hyphen (e.g., `-o`).
**Prevention:** Always use `execFile` or `spawn` instead of `exec` to prevent shell injection. Additionally, validate that user inputs passed as positional arguments do not start with `-` to prevent argument injection.
