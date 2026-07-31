## 2024-05-24 - Parallelizing sequential `execSync` calls in Astro API Routes
**Learning:** The Astro API routes (e.g. `src/pages/api/system-status.ts`) perform OS-level lookups using synchronous `execSync` which blocks the Node.js event loop. If an API route executes multiple shell commands sequentially, overall latency balloons.
**Action:** Always replace `execSync` with `exec` (promisified) or `execFile` and group independent shell commands into a `Promise.all` block. This frees the event loop and processes commands concurrently, significantly reducing response latency.
