## 2024-05-24 - Optimize dashboard KPIs with SQL count aggregations
**Learning:** Astro DB / Drizzle pulling full table data into memory arrays just to calculate lengths creates an unnecessary memory bottleneck and N+1 full-table fetch behavior.
**Action:** Use `db.select({ count: count() }).from(Table)` or `count(Table.id)` with the `count` helper destructured from `loadAstroDb()` to push count aggregations down to the database level.
