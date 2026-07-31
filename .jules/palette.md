## 2023-10-27 - [Add ARIA labels and focus styles to AgentCard buttons]
**Learning:** Icon-only interactive elements in reusable components like AgentCard need explicit ARIA labels and hidden SVGs to provide an accessible experience, as well as clear focus states (`focus-visible:ring-2`) to support keyboard navigation.
**Action:** When implementing new icon buttons, always apply `aria-label`, mark the inner icon `aria-hidden="true"`, and include the standard focus ring classes for consistent accessibility out-of-the-box.
