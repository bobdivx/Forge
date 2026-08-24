## 2024-08-24 - Database Aggregation
**Learning:** Fetching full tables into JS memory and using `.filter().length` causes OOM exceptions and severe CPU bottlenecks at scale.
**Action:** Use Astro DB (Drizzle) aggregations like `count()`, `inArray()`, and `gte()` directly in the database queries instead.
