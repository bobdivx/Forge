## 2024-05-24 - Optimizing sequential dev server checks
**Learning:** Checking the status of multiple development servers (which involves disk I/O and network port listening checks) inside a sequential for...of loop creates a significant bottleneck on the dashboard health API, as each check waits for the previous one to complete.
**Action:** Map array items to an array of Promises to initiate the I/O operations concurrently, then iterate through the array of Promises and await them sequentially to preserve order while allowing concurrent execution.
