## 2024-10-24 - Optimizing sequential independent database queries
**Learning:** Astro page TTFB can be significantly impacted by multiple independent sequential `await db.select()` calls, as each query blocks the next one from executing.
**Action:** Group independent Astro DB queries using `Promise.all([db.select()..., db.select()...])` to execute them concurrently.
