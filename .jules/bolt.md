## 2024-06-14 - Initialize Bolt Journal
**Learning:** Initializing journal to document critical performance findings.
**Action:** Use this file for future codebase-specific performance learnings.

## 2024-06-14 - Optimize Dashboard KPIs Database Queries
**Learning:** In Astro DB (Drizzle ORM), calling `db.select().from(Table)` without conditions fetches all records into memory. For analytics endpoints like dashboard KPIs, filtering and counting rows in JavaScript via `.filter(...).length` creates an O(N) memory bottleneck, which deteriorates significantly as tables grow.
**Action:** Replaced in-memory data filtering with Drizzle ORM aggregation functions (like `count()`, `gte()`, `inArray()`). By offloading the counting logic directly to the SQLite database via `db.select({ value: count() }).from(Table).where(...)`, we eliminated the N+1 full-table fetch overhead and drastically reduced memory utilization on the dashboard endpoint.
