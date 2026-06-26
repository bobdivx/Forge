
## 2024-08-01 - Parallelizing SSR Data Fetching
**Learning:** Sequential database queries on the server side (`await A; await B; await C;`) lead to waterfall performance issues, unnecessarily compounding page load latency on SSR routes like `src/pages/agents.astro` and `src/pages/swarm/[id].astro`.
**Action:** Use `Promise.all([db.select()..., db.select()...])` to fetch independent queries concurrently for better load times on SSR routes.
