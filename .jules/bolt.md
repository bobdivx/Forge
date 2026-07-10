## 2024-05-24 - Optimize independent sequential database queries with Promise.all
**Learning:** Found sequential `await db.select().from(...)` queries in Astro pages and API routes (like `src/pages/agents.astro`) that could be executed concurrently to reduce total database wait time.
**Action:** When making multiple independent database queries, group them using `Promise.all([db.select()..., db.select()...])` to execute them in parallel, significantly improving performance.
