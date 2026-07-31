## 2024-05-30 - Optimizing DB queries in SSR/API endpoints
**Learning:** Found multiple sequential `await db.select().from(...)` queries in gateway surfaces like `src/lib/forge-mission-board.ts`. This causes N sequential roundtrips to the DB which can be bottleneck.
**Action:** Always refactor independent sequential DB queries into a single `Promise.all([db.select()..., db.select()...])` block to execute them concurrently, reducing total wait time to the longest single query. Use `Promise.resolve([])` to conditionally execute optional queries within `Promise.all`.
