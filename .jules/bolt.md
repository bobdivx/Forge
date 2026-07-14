
## 2024-05-24 - [Optimize Independent I/O in Loop iterations]
**Learning:** Sequential `for...of` loops performing asynchronous file/network I/O operations (like querying local dev server state per project in `dashboard-projects-health.ts`) significantly block and degrade performance as `N` grows. Rigid `Promise.all` can sometimes disrupt specific ordering requirements.
**Action:** When mapping over items that require independent I/O, execute the logic concurrently by mapping them to an array of Promises, then iterate through the array of Promises and `await` them sequentially. This preserves exact ordering while allowing all underlying I/O calls to run concurrently, transforming O(N) wait time to O(1) wait time.
