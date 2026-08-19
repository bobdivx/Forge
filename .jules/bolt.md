## 2025-02-23 - Concurrent status checks mapping
**Learning:** Performing sequential file and network I/O status checks (like dev server port polling) in a `for...of` loop over multiple items causes severe N+1 bottlenecks.
**Action:** Map items to an array of Promises to initiate them concurrently, and sequentially `await` the promises to preserve correct structural ordering without resorting to `Promise.all()`.
