## 2024-05-08 - TabBar and SaveRow Accessibility
**Learning:** Dynamic status messages in UI components (like success/error text in save bars) should be wrapped in an `aria-live="polite"` region with `role="status"` to ensure screen readers announce updates dynamically. Tab bars need explicit `role="tablist"` and `role="tab"` with `aria-selected` tracking the active state.
**Action:** When implementing custom interactive components like tabs or dynamic save notifications, always verify standard ARIA roles and live regions are included.
