## 2024-05-19 - Concurrent mapped promises for Astro DB iteration
**Learning:** Sequential `for...of` loops performing file IO or DB checks inside Astro API endpoints (like `getPrimaryDevServerStatus` on a list of projects) can cause performance bottlenecks.
**Action:** Map the iterations into an array of Promises and `await` them sequentially using a standard `for...of` loop over the array of Promises. This allows the operations to initiate concurrently while retaining order-dependent sorting or potential early return capabilities.
