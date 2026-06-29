## 2024-05-18 - Concurrent DB Queries
**Learning:** Sequential independent database queries in Astro API endpoints can be grouped using `Promise.all` to reduce total wait time to the longest single query.
**Action:** When multiple `await db.select()...` or similar calls exist that don't depend on each other, wrap them in `Promise.all` for performance optimization.
