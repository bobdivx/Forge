## 2024-06-14 - Accessible Icon Buttons in Agent Cards
**Learning:** Icon-only buttons used for agent actions (start/stop/configure) were relying on `title` attributes without explicit `aria-label` or keyboard focus rings, making them inaccessible to keyboard and screen reader users.
**Action:** Always provide explicit `aria-label`, hide decorative SVGs with `aria-hidden="true"`, and use consistent Tailwind `focus-visible` ring utilities (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37]`) for interactive elements.
