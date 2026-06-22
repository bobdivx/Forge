## 2024-06-22 - Optimize sequential database queries with Promise.all()
**Learning:** Found multiple independent database queries being awaited sequentially in API endpoints (e.g., `src/pages/api/work-diagnostic.ts`), causing a waterfall effect and increasing total request latency.
**Action:** Use `Promise.all([db.select()..., db.select()...])` to execute independent database queries and external system status checks concurrently, reducing the total wait time to the longest single query.
