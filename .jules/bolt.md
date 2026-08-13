## 2025-01-20 - Parallelize Database Queries in SSR Routes
**Learning:** Sequential, independent database queries in SSR endpoints create a cumulative performance bottleneck.
**Action:** Group independent database read queries using `Promise.all([db.select()..., db.select()...])` to execute them concurrently, reducing total network wait time to the longest single query.
