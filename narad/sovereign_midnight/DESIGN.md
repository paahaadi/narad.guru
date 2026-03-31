# Design System Specification: Sovereign Intelligence Minimalism

## 1. Overview & Creative North Star
### Creative North Star: "The Silent Sentinel"
This design system is engineered for high-stakes, national-scale situational awareness. It rejects the frantic, "hacker-style" aesthetics of typical dashboards in favor of **Institutional Authority**. The interface should feel like a quiet, high-performance command center—strategic, precise, and unshakeable. 

We break the "standard template" look by utilizing **Atmospheric Depth** and **Intentional Asymmetry**. Rather than a grid of boxes, the UI is treated as a digital map where information surfaces emerge from the darkness. We prioritize high-density data without visual noise, using tonal shifts rather than lines to define the architecture of intelligence.

---

## 2. Colors & Surface Architecture
The palette is rooted in the "Abyssal Scale"—deep, receding blues and blacks that minimize eye strain during long-watch operations.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts or subtle tonal transitions. A `surface-container-low` section sitting on a `surface` background provides enough contrast for the human eye to perceive a boundary without the "boxed-in" feel of traditional UI.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of obsidian glass. 
- **Base Layer:** `surface` (#0B0E15) for the primary application canvas.
- **Structural Sections:** `surface-container-low` (#0F131D) for sidebars or secondary navigation.
- **Primary Content Panels:** `surface-container` (#141A26).
- **Active/Focused Elements:** `surface-container-high` (#18202F) or `highest` (#1C2639) to create a natural, "physical" lift.

### Glass & Gradient Rule
To achieve a premium, custom feel, use **Glassmorphism** for floating overlays (modals, tooltips, or detached map controllers). Apply a `surface-variant` color at 60% opacity with a `20px` backdrop-blur. 
*   **Signature Texture:** Main CTAs or active intelligence streams should utilize a subtle linear gradient from `primary` (#ADC6FF) to `primary-container` (#004395) at a 135-degree angle to provide a machined, metallic polish.

---

## 3. Typography
The typography system balances the humanistic curves of **Manrope** with the clinical precision of **Inter**.

*   **Display & Headlines (Manrope):** These are the "Command" level. Use `display-lg` to `headline-sm` for high-level status updates. The wide aperture of Manrope conveys a modern, institutional openness.
*   **Body & Metadata (Inter):** The "Intelligence" level. Inter is used for all functional data. For technical metadata (coordinates, timestamps, sensor IDs), use a **Semi-mono** stylistic set or a monospace fallback to ensure character alignment in high-density tables.
*   **Hierarchy as Identity:** Use `title-sm` in `primary-fixed-dim` for section headers to create a "glow" effect against the dark background, instantly drawing the eye to key data points.

---

## 4. Elevation & Depth
We eschew traditional drop shadows for **Tonal Layering**.

*   **The Layering Principle:** Depth is achieved by "stacking." A `surface-container-lowest` (#000000) card placed on a `surface-container-low` (#0F131D) section creates a soft, natural "recessed" look.
*   **Ambient Shadows:** For floating elements (e.g., a "Critical Alert" modal), use an ultra-diffused shadow: `blur: 40px`, `y: 20px`, `opacity: 8%`. The shadow color must be a tinted version of the `on-surface` color (#DCE5FF) to mimic light refracting through deep water.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline-variant` (#3F485D) at **15% opacity**. 100% opaque borders are strictly forbidden.

---

## 5. Components

### Buttons
*   **Primary:** Linear gradient (`primary` to `primary-container`), `md` (0.375rem) corner radius. Use `on-primary` for text.
*   **Secondary:** Ghost style. `outline-variant` (20% opacity) border, `on-surface` text. 
*   **Tertiary:** Text-only, using `primary-fixed-dim`. No background.

### Intelligence Chips
*   **Status:** High-density, small `label-sm` text. Use semantic accents (Emerald for Active, Crimson for Critical). 
*   **Filtering:** Use `surface-container-highest` backgrounds with no borders.

### Input Fields
*   **Style:** Recessed. Background set to `surface-container-lowest` (#000000). 
*   **Focus State:** A 1px "Ghost Border" using `tertiary` (#8CE7FF) at 40% opacity. Avoid heavy glows.

### Cards & Lists
*   **Forbidden:** Divider lines. 
*   **Alternative:** Separate list items using `0.4rem` (Spacing-2) of vertical white space or by alternating background colors between `surface-container` and `surface-container-low`.

### Specialized Components: The "Intelligence Feed"
A high-density vertical stream. Use `body-sm` for content. Time-stamps must use the Semi-mono font variant in `secondary` (#999EAD). Use a `primary-dim` vertical track (2px wide, 10% opacity) to visually connect chronological events.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use `2.25rem` (Spacing-10) of padding between major intelligence modules to allow the eye to rest.
*   **Do** use `Purple` (#A855F7) exclusively for AI-generated insights or predictive modeling to distinguish from "hard" sensor data.
*   **Do** use `surface-bright` (#212C43) for hover states on interactive cards to create a "flashlight" effect.

### Don’t
*   **Don’t** use pure white (#FFFFFF) for text. Use `on-surface` (#DCE5FF) to prevent "halation" or blooming on dark screens.
*   **Don’t** use standard "Rounded" corners for a system this serious. Stick to the `sm` (0.125rem) or `md` (0.375rem) scale. Avoid `xl` or `full` except for status pips.
*   **Don’t** use high-contrast dividers. If you feel the need to "separate" something, increase the spacing or shift the background tone by one tier. 
*   **Don’t** use "Pop" animations. Transitions should be `200ms` with a `cubic-bezier(0.2, 0, 0, 1)` (Decelerate) curve—smooth, heavy, and deliberate.