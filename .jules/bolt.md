## 2024-06-23 - Concurrent mapping for SSR Data Load
**Learning:** Optimizing sequential loops containing independent I/O and external promise resolutions (like `getPrimaryDevServerStatus`) drastically speeds up SSR API endpoints. Wait using sequential `.push(await promise)` after an async `map()` to preserve sort order while gaining the benefits of concurrency.
**Action:** Identify and replace slow `for...of` data gathering loops in endpoints with parallel Promise-initiating mappings mapped array if they are not deeply inter-dependent.
