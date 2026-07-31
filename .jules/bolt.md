## 2026-07-03 - [Optimize Database Queries Concurrency]
**Learning:** In Astro DB endpoints (like `work-overview.ts`, `work-diagnostic.ts`, `audit-logs.ts`), executing multiple independent `db.select()` queries sequentially blocks the execution flow and increases response times unnecessarily.
**Action:** Use `Promise.all()` to run independent database queries (and other slow independent async operations like `getWorkSystemStatus()`) concurrently, which reduces the total database execution time to the duration of the longest single query.
