## 2024-11-20 - [ARIA labels on Modal Close buttons]
**Learning:** Found that modal close buttons (e.g. in `CostsDashboard.tsx`) using text symbols like `&times;` lack both accessible labels and proper keyboard focus states, making them invisible to screen readers and difficult to navigate with a keyboard.
**Action:** When adding close icons, ensure the symbol is wrapped in `<span aria-hidden="true">`, the button has a French `aria-label="Fermer"`, and includes existing Tailwind focus classes like `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37]`.
