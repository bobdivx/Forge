## 2026-06-07 - Concurrency in Data Fetching
**Learning:** Sequential database queries using `db.select()` can accumulate significant latency overhead in Astro API endpoints. Grouping multiple independent queries using `Promise.all` executes them concurrently, minimizing I/O total wait time to the longest single query.
**Action:** When making multiple independent database fetches (e.g., retrieving lists for a dashboard overview), always utilize `Promise.all` to reduce network request latency and improve page responsiveness.
