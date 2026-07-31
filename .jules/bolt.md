
## 2024-05-19 - Astro DB (Drizzle) N+1 Query Bottlenecks in Data Aggregation
**Learning:** Sequential full-table fetches using `await db.select()` inside API routes or data-loading functions (like `getMissionBoardOverview`) create a massive waterfall effect, drastically increasing response latency when the database grows.
**Action:** Always group independent `.select()` operations into a concurrent `Promise.all` block. Use ternary operators to conditionally trigger queries inside the array, falling back to `Promise.resolve([])` for missing optional tables, reducing total execution time to the slowest single query.
