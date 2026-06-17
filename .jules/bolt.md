## Initializing Bolt Journal

## 2025-02-23 - Concurrent status checks for project dashboards
**Learning:** Checking local disk and network dev server status for projects synchronously via `for...of` in API routes can bottleneck dashboard response times significantly when there are multiple projects due to cumulative `isPortListening` network timeouts.
**Action:** When iterating over independent operations that involve file I/O or network calls, map them to an array of async Promises to initiate them concurrently. Then sequentially `await` the promises array to resolve them while maintaining order, or use `Promise.all` if order matters less, reducing the overall time bound to the single longest operation.
