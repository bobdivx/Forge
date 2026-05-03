## 2024-05-03 - N+1 Memory Fetch via Full Table Scans
**Learning:** Found a major performance bottleneck where the application fetched entire tables (`AgentTask`, `AgentAppIssue`, `Project`, etc.) into memory just to determine row counts for a dashboard, wasting memory and serialization time.
**Action:** Always replace memory-side `.filter().length` with SQL-native `count()` aggregations combined with `where()` clauses using `sql` template tags, preserving memory and drastically reducing payload sizes.
