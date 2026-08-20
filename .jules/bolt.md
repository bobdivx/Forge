
## 2026-08-20 - Concurrent DB Queries
**Learning:** Sequential await calls on independent database queries (e.g., fetching separate tables) cause a noticeable N+1 wait time bottleneck in SSR paths.
**Action:** Group independent queries using `Promise.all` to execute them concurrently, reducing total wait time to the longest single query.
