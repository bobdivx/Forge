## 2023-10-25 - Concurrent Database Queries in API Routes
**Learning:** Sequential database queries inside SSR API routes create a significant bottleneck as the total wait time is the sum of all query latencies.
**Action:** When multiple independent database queries are needed (e.g., fetching different tables for a combined response), execute them concurrently using `Promise.all([db.select()..., db.select()...])` to reduce latency to `max(T1, T2)`.
