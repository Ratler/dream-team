# Frontend Design Guidelines

> These guidelines are injected by the build skill when a spec has `frontend-design: true`. Follow the Design Direction section in your spec for the chosen aesthetic style and project-specific preferences.

## Aesthetic Direction Reference

Choose one direction (or blend related ones) and commit to it throughout the project. Each style has a distinct personality — resist defaulting to "clean and modern" (that is not a direction, that is a lack of one).

| Style | Description |
|---|---|
| **Minimal / Clean** | Generous whitespace, restrained color palette (1-2 accent colors), subtle type hierarchy, invisible UI chrome. Feels like a gallery — every element earns its place. Best for tools, dashboards, and professional SaaS. |
| **Editorial / Magazine** | Strong typographic hierarchy with dramatic size contrasts, pull quotes, full-bleed imagery, asymmetric layouts. Feels like a curated publication. Best for content-heavy sites, blogs, and portfolios. |
| **Playful / Energetic** | Bold colors, rounded shapes, bouncy animations, hand-drawn or illustrative elements, casual typography. Feels alive and approachable. Best for consumer apps, onboarding flows, and creative tools. |
| **Brutalist / Raw** | Exposed structure, monospaced type, raw borders, stark black-and-white with a single punch color, no decorative polish. Feels intentional and uncompromising. Best for developer tools, experimental projects, and portfolios. |
| **Luxury / Refined** | Thin serif or elegant sans-serif type, muted earth tones or jewel tones, generous spacing, subtle gold/copper accents, smooth slow animations. Feels premium. Best for e-commerce, fashion, and high-end brands. |
| **Retro-Futuristic** | CRT glow effects, neon accents on dark backgrounds, pixelated or glitchy transitions, monospaced or geometric type, scanline overlays. Feels like a terminal from 2087. Best for dev tools, games, and creative tech. |
| **Organic / Natural** | Warm earth tones, soft textures, rounded organic shapes, flowing curves instead of hard grids, nature-inspired color palettes. Feels calm and grounded. Best for wellness, sustainability, and community platforms. |
| **Art Deco / Geometric** | Bold geometric patterns, metallic accents (gold, brass, chrome), strong symmetry, decorative borders, elongated serif type. Feels grand and structured. Best for events, luxury brands, and entertainment. |
| **Industrial / Utilitarian** | Functional first — dense information display, monochrome palettes with warning-color accents, tabular layouts, status indicators, no decoration. Feels like mission control. Best for admin panels, monitoring dashboards, and data tools. |
| **Soft / Pastel** | Light pastel backgrounds, rounded corners, gentle shadows, friendly sans-serif type, soft gradients, airy spacing. Feels warm and inviting. Best for onboarding, consumer wellness apps, and collaborative tools. |

## Anti-Generic Rules

These are the patterns that make AI-generated UIs instantly recognizable. Avoid them deliberately.

| Instead of... | Do this... |
|---|---|
| Inter, Roboto, Arial, or system-ui as your only font | Choose a distinctive display font for headings and pair it with a refined body font that matches your aesthetic direction |
| Purple-to-blue gradients on white backgrounds | Commit to a palette derived from your aesthetic direction — if you must gradient, use tonal variations within your palette |
| Uniform card grids (3 columns of identical rounded rectangles) | Vary card sizes, mix media types, use masonry or asymmetric layouts, let featured items break the grid |
| Default 8px border-radius on everything | Choose a radius strategy: sharp (0-2px) for industrial/brutalist, moderate (6-8px) for professional, generous (12-20px) for playful/soft, or mixed radii for editorial contrast |
| Gray placeholder illustrations (the "person at desk" style) | Use real imagery, abstract shapes, or skip illustrations entirely. Empty space is better than generic clipart. |
| Identical button styles everywhere | Establish a hierarchy: primary (bold, filled), secondary (outlined or ghost), tertiary (text-only). Size and weight should vary by context. |
| Drop shadows as the only depth technique | Layer depth using z-index, overlapping elements, background color shifts, border treatments, or inset shadows. Match your aesthetic direction. |
| White background with light gray cards | Use tinted backgrounds that relate to your palette. Even "white" should have a warm or cool temperature. |

## Typography Principles

Do not specify exact fonts — match the font choice to the aesthetic direction.

- **Pair fonts intentionally**: One distinctive display/headline font + one refined body font. The display font carries the personality; the body font stays readable.
- **Scale dramatically**: Use a modular scale (1.25x–1.5x ratio). Headlines should feel large — 2.5rem–4rem for hero text. Don't be timid with size contrast.
- **Negative letter-spacing on large text**: Headlines at 32px+ benefit from -0.02em to -0.04em tracking. It tightens the visual rhythm.
- **Expanded letter-spacing on small text**: Labels, overlines, and captions at 12px or smaller benefit from 0.05em–0.1em tracking. Add `text-transform: uppercase` for overlines.
- **Line height scales inversely with size**: Body text needs 1.5–1.7 line-height. Headlines need 1.0–1.2. Giant display text can go to 0.9.
- **Limit to 2-3 font weights**: Regular + Bold is often enough. Add Medium or Semibold only if the hierarchy demands it. Too many weights create visual noise.

## Color & Theme

- **Use CSS custom properties** for all colors. Define a palette, don't scatter hex values.
- **Commit to a dominant color** — it anchors the entire interface. The dominant color appears in backgrounds, large surfaces, or the primary navigation. Choose it from your aesthetic direction.
- **Add a sharp accent** — a contrasting color for CTAs, active states, and emphasis. It should pop against the dominant color.
- **Avoid flat single-color buttons** — add depth with subtle gradients (2-3% brightness shift), inner shadows, or border treatments. Flat buttons feel cheap.
- **Temperature matters** — warm whites (#FFFAF5) feel different from cool whites (#F8FAFC). Pick a temperature and stay consistent.
- **Dark mode is not inverted light mode** — reduce contrast slightly (don't use pure white on pure black), desaturate colors by 10-15%, and adjust shadows to glows.
- **Semantic colors** — define success, warning, error, and info colors that harmonize with your palette. Don't use raw red/green/yellow if they clash.

## Animation Timing Table

Only animate `transform` and `opacity` for performance. Never animate `width`, `height`, `top`, `left`, or `margin`.

| Interaction Type | Duration | Easing | Notes |
|---|---|---|---|
| Micro-interactions (toggle, checkbox) | 100–150ms | `ease` | Fast and responsive, barely noticeable delay |
| Hover states (color, shadow shift) | 200–300ms | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | Smooth spring feel, not sluggish |
| Card transitions (expand, flip) | 300ms | `cubic-bezier(0.33, 1, 0.68, 1)` (easeOutCubic) | Quick start, gentle landing |
| Page transitions (route change) | 400–500ms | `cubic-bezier(0.76, 0, 0.24, 1)` (easeInOutQuart) | Symmetric, polished movement |
| Scroll reveals (fade/slide in) | 500–800ms | `cubic-bezier(0.16, 1, 0.3, 1)` (easeOutQuart) | Slow entry, natural deceleration |
| Ambient/looping (float, pulse) | 3–6s | `ease-in-out` | Slow and hypnotic, never distracting |
| Exit animations | 50-75% of enter duration | Faster easing | Exits should be quicker than entrances |

### Reduced Motion

Always wrap non-essential animations in a `prefers-reduced-motion` check:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Interaction Patterns

| Element | Hover | Press | Focus |
|---|---|---|---|
| **Card** | Lift (translateY -2px to -4px) + shadow increase, or subtle glow, or scale(1.02) | Scale(0.98) + shadow decrease | Visible ring (2px offset, accent color) |
| **Button (primary)** | Brighten 5-10% or shift gradient, subtle translateY(-1px) | Scale(0.97), darken 5%, reduce shadow | Bold ring (3px, high contrast) |
| **Button (secondary)** | Background fill at 5-8% opacity of accent color | Scale(0.98) | Ring matching primary button |
| **Link** | Color shift + underline animation (slide in from left) | Opacity 0.8 | Outline offset 2px |
| **Icon button** | Background circle/pill appears at 8-12% opacity | Scale(0.9) | Visible ring |
| **Input field** | Border color shifts to accent | — | Border becomes accent color + outer ring |
| **List item / row** | Background tint at 3-5% opacity | Background tint at 8-10% opacity | Left border accent or ring |
| **Image / media** | Slight zoom (scale 1.03) with overflow hidden, or overlay fade | — | Ring |

### Feedback Patterns

- **Success**: Brief green flash or checkmark animation, then return to normal state within 2s
- **Error**: Subtle shake animation (translateX +/-4px, 3 cycles, 300ms total) + persistent red border
- **Loading**: Skeleton screens over spinners. If spinner is needed, use a simple rotating arc, not a bouncing dots animation.
- **Empty state**: Illustration or icon + actionable message. Never show a blank white area.

## Accessibility Requirements

These are non-negotiable — they apply regardless of aesthetic direction.

- **Text contrast**: minimum 4.5:1 ratio for normal text, 3:1 for large text (18px+ or 14px+ bold)
- **UI component contrast**: minimum 3:1 for borders, icons, and interactive element boundaries
- **Focus indicators**: visible on all interactive elements, must not rely on color alone (use ring + offset)
- **Keyboard navigation**: all interactive elements reachable via Tab, logical tab order matching visual order
- **Reduced motion**: respect `prefers-reduced-motion` — provide instant state changes instead of animations
- **Image alt text**: all images must have descriptive alt text (or `alt=""` for purely decorative images)
- **Form labels**: every input needs a visible label or `aria-label`. Placeholder text is NOT a label.
- **Touch targets**: minimum 44x44px for mobile, 32x32px for desktop
- **Color independence**: never convey information through color alone — add icons, text, or patterns

## Component Library Recommendations

Use established libraries over building custom components. These are recommendations — if the project already has a component library, use that instead.

### React
- **shadcn/ui** — foundation components built on Radix primitives. Unstyled by default, fully customizable. Start here.
- **Aceternity UI** — scroll animations, 3D effects, spotlight cards, parallax. Use for hero sections and visual impact.
- **Magic UI** — animated text effects, shimmer buttons, marquees, number tickers. Use for engagement and delight.
- **Motion Primitives** — morphing text, scroll-triggered animations, animated groups. Use for polished transitions.
- **Framer Motion** — the animation library. Layout animations, shared element transitions, gesture handling. Use for any custom animation.

### Vue
- **shadcn-vue** — port of shadcn/ui for Vue. Same philosophy: unstyled, composable, Radix-based.
- **Radix Vue** — accessible primitives (dialog, popover, dropdown, tooltip). Foundation for custom components.
- **VueUse Motion** — Vue composables for animations. Integrates with Vue's reactivity system.
- **Headless UI** — accessible, unstyled components from the Tailwind team. Disclosure, listbox, switch, tabs.

### Generic / Other Frameworks
- Prefer established component libraries from the framework's ecosystem over rolling custom ones
- Follow the framework's conventions for component architecture and state management
- If no component library exists for the framework, build accessible primitives first (focus management, keyboard nav, ARIA attributes) before adding visual styling

## Layout Principles

Break out of predictable patterns. The goal is visual rhythm and intentional composition, not rigid uniformity.

- **Asymmetry over symmetry**: offset elements, use unequal column widths, let important content take more space
- **Negative space is a design tool**: generous padding and margins create focus. Cramped layouts feel cheap. When in doubt, add more space.
- **Grid-breaking elements**: let hero images, pull quotes, or feature highlights span beyond the content grid. Use `calc()` and viewport units for controlled breakout.
- **Overlapping layers**: use negative margins or absolute positioning to overlap cards, images, or decorative elements. Creates depth without 3D effects.
- **Section rhythm variation**: don't make every section the same height or structure. Alternate between dense information sections and spacious visual sections.
- **Vertical spacing hierarchy**: use larger gaps between sections (4rem–8rem) than between elements within sections (1rem–2rem). The rhythm should breathe.
- **Responsive by composition, not just breakpoint**: design layouts that reflow naturally. Use CSS Grid with `auto-fit`/`minmax()`, `clamp()` for fluid typography, and container queries where supported.
