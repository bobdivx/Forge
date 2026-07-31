## 2024-06-27 - Concurrent Dashboard I/O
**Learning:** Sequential I/O inside loops or before DB fetches blocks performance on high-traffic endpoints.
**Action:** Map loops with external network calls or file operations to promises to initiate them concurrently, and start slow external fetches early before awaiting DB operations.
