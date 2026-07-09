## 2024-05-14 - Fix N+1 query in GitHub watcher
**Learning:** Found an N+1 query anti-pattern in the GitHub watcher loop. The loop was querying `GithubWatchDecision` for every open pull request sequentially, leading to an O(N) database performance bottleneck as PR counts scaled.
**Action:** Always batch database lookups outside loops in background daemons. Use standard indexing (e.g., loading filtered elements into a Set) to reduce query operations to O(1) inside iterative data processing blocks.
