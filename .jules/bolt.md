## 2024-07-11 - Optimize Database Queries in Astro SSR
**Learning:** Sequential database queries (`await db.select()`) in Server-Side Rendered (SSR) pages can cause significant wait times and block rendering unnecessarily when the queries do not depend on each other.
**Action:** Always group independent sequential database queries using `Promise.all([db.select()..., db.select()...])` in Astro components or API endpoints to execute them concurrently, reducing total wait time to the longest single query.
