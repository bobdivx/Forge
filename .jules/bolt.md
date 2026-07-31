## 2024-07-25 - Astro API Concurrency Pattern
**Learning:** In Astro API routes, waiting to start slow external network requests until after synchronous-seeming or sequential database queries can create a bottleneck.
**Action:** Initiate slow external network calls early at the start of the request handler as un-awaited Promises so they run concurrently with database operations. Assign a detached dummy catch handler (e.g., `promise.catch(() => {})`) to safely prevent `UnhandledPromiseRejection` crashes if the fetch fails before it is awaited later in the flow.
