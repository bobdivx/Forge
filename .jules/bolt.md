
## 2025-02-23 - Concurrent Database Queries in Serverless Endpoints
**Learning:** Sequential, independent database queries (like fetching `AgentBudget`, `CostEvent`, and `AgentInstruction` separately) in Astro API routes cause unnecessary cumulative latency bottlenecks, especially in serverless environments.
**Action:** Always group independent `.select()` operations using `Promise.all()` to parallelize database I/O and reduce the total response time to the duration of the longest query.
