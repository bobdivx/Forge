## 2025-02-18 - Concurrent Database Queries Optimization
**Learning:** Sequential database queries (like selecting from AgentTask and AgentMessage) in SSR/API routes can create a significant bottleneck as they block each other.
**Action:** When querying independent tables sequentially, use `Promise.all([db.select()..., db.select()...])` to execute them concurrently. This reduces the total execution time to the longest single query.
