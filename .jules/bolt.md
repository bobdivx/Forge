## 2024-05-18 - Optimize Stateful Sequential Iteration Over Network I/O
**Learning:** Sequential network calls inside a `for...of` loop can become a significant bottleneck when querying multiple endpoints or paths, especially when the calls are independent.
**Action:** Use `Promise.all` to fetch all resources concurrently. To preserve side-effect logic dependent on order (like keeping the "last" status or error), store the resolved promises in an array and iterate over them sequentially in the same order as the original paths array.
