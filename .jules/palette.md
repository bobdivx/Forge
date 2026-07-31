## 2025-06-10 - AgentCard Accessibility
**Learning:** Icon-only buttons used for critical swarm commands ('Lancer une mission', 'Arrêter') in AgentCard lacked ARIA labels and keyboard focus rings, which hindered accessibility for screen readers and keyboard users navigating the dashboard.
**Action:** Always verify that mapped action buttons, especially those using SVGs natively, implement `aria-label` matching their `title` and apply `aria-hidden="true"` to the internal SVG. Add `focus-visible` Tailwind classes consistently for keyboard navigation.
