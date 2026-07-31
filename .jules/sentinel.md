## 2024-05-18 - Command injection via execSync in log routes
**Vulnerability:** Command injection and event loop blocking via execSync using unsanitized query parameters for file paths and line counts.
**Learning:** In backend routes serving log files, using execSync directly interpolates string arguments without separation, leading to injection and blocking standard JS execution.
**Prevention:** Replace synchronous shell calls with promisified execFile (e.g. execFileAsync) which enforces explicit array arguments without invoking a shell directly, mitigating injection vectors.
