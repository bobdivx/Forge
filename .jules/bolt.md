## 2024-11-20 - Optimize sequential independent database queries
**Learning:** Sequential independent database queries in Astro API routes create a significant bottleneck, as the execution time equals the sum of all individual query times rather than the longest single query. Astro DB handles concurrent queries well.
**Action:** Use `Promise.all` to group independent `db.select()` queries instead of awaiting them one by one.
