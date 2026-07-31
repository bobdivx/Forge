## 2025-02-20 - [Performance] Optimize independent backend sequential queries

**Learning:** When retrieving data from Astro DB/Drizzle ORM using multiple `await db.select().from(Table)` queries in an API endpoint, doing so sequentially creates unnecessary sequential I/O bottleneck wait time.
**Action:** Identify independent queries in data retrieval endpoints and group them using `await Promise.all([db.select()..., db.select()...])` to execute them concurrently, reducing total wait time to the longest single query without sacrificing code readability.
