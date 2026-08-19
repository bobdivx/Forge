## 2024-05-24 - DoS Risk and Info Leak in API Routes
**Vulnerability:** Synchronous shell execution (`execSync`) in API routes blocks the Node.js event loop causing Denial of Service, and unhandled errors leak internal stack traces to clients.
**Learning:** Using `execSync` on web endpoints severely degrades performance and availability. Concatenating system error messages directly into JSON responses exposes sensitive server paths and details.
**Prevention:** Always use asynchronous execution (`execFile` with promisify) and sanitize error outputs with generic messages (e.g., "Logs indisponibles") before sending HTTP responses.
