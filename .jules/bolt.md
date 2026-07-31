## 2024-05-24 - Grouping independent Astro DB selects
**Learning:** Independent database queries executed sequentially can cause N+1-like performance issues for SSR routes.
**Action:** Used `Promise.all()` to parallelize independent Astro DB `db.select()` queries in API routes.
