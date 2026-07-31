## 2024-05-27 - Drizzle ORM Full Table Fetch Bottlenecks

**Learning:** When retrieving aggregate counts or checking conditions for KPIs or dashboards, performing `db.select().from(Table)` reads all records into application memory, leading to an O(N) memory and processing bottleneck. This is evident in `src/pages/api/dashboard-kpis.ts` which loads all projects, tasks, open requests, and issues.
**Action:** Replace `db.select().from(Table)` full table fetches with native SQL aggregates. Astro DB exposes the `count()`, `gte()`, `eq()`, `inArray()` helpers inside `loadAstroDb()` and they should be used to push counting to the SQL engine `db.select({ count: count() }).from(Table)`.
