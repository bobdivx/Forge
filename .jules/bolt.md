## 2025-01-30 - Replace length checks on full memory fetches with Astro DB aggregations

**Learning:** When retrieving counts for multiple tables or filtered sets (e.g. `Project`, `AgentTask`, `Request`) to display dashboard KPIs, performing full memory queries (using `db.select().from(Table)`) just to read their `.length` property creates significant N+1 and memory overhead, especially for larger data sets. In this codebase's architecture using Drizzle ORM over Astro DB, you can offload these aggregations directly to the database.

**Action:** Replaced full row fetches mapping to `.length` arrays in `src/pages/api/dashboard-kpis.ts` with direct Drizzle ORM `db.select({ count: count() })` along with appropriate `where` conditions (`eq`, `gte`, `inArray`). This performs the counting fully on the SQLite layer, dramatically reducing memory payload and computation time.
