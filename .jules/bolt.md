## 2024-05-24 - Optimize Astro API Route Database Queries
**Learning:** Sequential independent database queries in Astro API routes can create an unintentional N+1 style bottleneck for response times, where the client waits for the sum of all query latencies.
**Action:** Group independent queries using `Promise.all([db.select()..., db.select()...])` to execute them concurrently, reducing total wait time to the longest single query.
