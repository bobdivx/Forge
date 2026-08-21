## 2025-01-24 - Parallelize independent queries
**Learning:** Sequential database queries (like `db.select().from(...)`) in API routes block execution and increase latency unnecessarily.
**Action:** Group independent queries using `Promise.all` to fetch data concurrently, reducing total wait time to the longest single query.
