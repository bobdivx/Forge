## 2024-05-19 - Concurrent Database Queries in API Routes
**Learning:** Found sequential database queries (`await db.select...` followed by another `await db.select...`) in API routes like `src/pages/api/work-diagnostic.ts`. Because these queries do not depend on each other, waiting for one to finish before starting the next adds unnecessary latency to the request.
**Action:** Grouped independent queries using `Promise.all([db.select()..., db.select()...])` to execute them concurrently, reducing the total wait time to the duration of the longest single query.
