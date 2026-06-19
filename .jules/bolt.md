## 2024-05-18 - Concurrent Drizzle ORM Queries
**Learning:** Sequential, independent database queries using `await db.select()` inside dashboard data-fetching functions (like `getMissionBoardOverview`) create N+1 query waterfalls that block the main execution flow unnecessarily.
**Action:** Group independent Astro DB queries using `Promise.all([db.select()..., db.select()...])` to execute them concurrently, reducing total wait time to the longest single query. Handle optional table queries by conditionally passing `Promise.resolve([])`.
