## 2024-05-24 - Optimizing sequential database queries in SSR
**Learning:** Grouping independent Astro DB / Drizzle ORM queries using `Promise.all` prevents waterfall latency in server-side requests.
**Action:** Always check for sequential independent `await db.select()...` statements in API routes and group them concurrently.
