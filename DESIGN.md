# Embeddly — Design System

## 1. Layout Architecture

```
┌─────────────────────────────────┐
│  [Logo]              [Settings] │  ← Topbar (auto)
│                                 │
│         ┌───────────┐           │
│         │ ○ ○ ○ ○ ○ │           │  ← Orbital field (absolute, decorative)
│         │           │           │
│         │  🔍 Search │           │  ← Search box (centered)
│         └───────────┘           │
│                                 │
│  [Feature] [Feature] [Feature]  │  ← Feature pills (auto, 3-col grid)
└─────────────────────────────────┘
  ↑ .landing-shell — full-viewport card with rounded corners
```

`.landing-shell` uses a **3-row CSS Grid** (`auto / 1fr / auto`):

- **Topbar** (auto): logo + settings button
- **Search stage** (`1fr`): orbital field (absolute) + search box (centered)
- **Feature row** (auto): 3-column grid of feature pills

## 2. Color Palette

| Role | Value | Usage |
|------|-------|-------|
| Background | `#f4f7ff` | Page base |
| Text primary | `#17213b` | Headings, input text |
| Text secondary | `#8c96ad` | Placeholders, subtitle |
| Accent primary | `#6258ff` / `#665cff` | Feature pill icon/text |
| Accent hover | `#574cff` | Button hover state |
| Borders | `rgba(132, 146, 184, 0.18–0.22)` | Subtle translucent borders |

Palette mood: cool blue-indigo, soft and professional. No hard blacks — everything uses muted slate tones.

## 3. Glassmorphism / Frosted Glass

Almost every surface uses **translucent white backgrounds** with layered box-shadows:

```css
background: rgba(255, 255, 255, 0.72);  /* 72% white */
background: rgba(255, 255, 255, 0.9);   /* 90% white for search */
```

Combined with:

- **Multi-layer box-shadows**: outer shadow (depth) + `inset 0 1px 0` (top highlight)
- **Pseudo-element overlays**: `.landing-shell::before` adds a subtle gradient sheen

## 4. Orbital Field — Decorative Background

`.orbital-field` is a **purely decorative** (`aria-hidden`) element:

- **Concentric dotted rings** via `repeating-radial-gradient`
- **3 organic-shaped ellipses** using `::before`, `::after`, and `<span>` children with `border-radius: 42% 58% 47% 53%` (blobby shapes)
- **Masked** with `mask-image` to fade in/out radially
- **No animation** — static, but creates a "knowledge constellation" feel

## 5. Typography

```css
font-family: Inter, ui-sans-serif, system-ui, ...;
```

- **Font**: Inter (Google Fonts)
- **Search input**: `clamp(17px, 2vw, 20px)` — fluid sizing
- **Feature titles**: 13px bold
- **Feature subtitles**: 10px semibold

Uses `clamp()` extensively for **fluid responsive typography** without media queries.

## 6. Spacing System

Everything uses `clamp()` for fluid spacing:

```css
padding: clamp(20px, 3vw, 38px);      /* landing-shell */
gap: clamp(14px, 2vh, 24px);          /* grid gap */
min-height: clamp(64px, 8vh, 78px);   /* search box */
```

Pattern: `clamp(min, preferred, max)` — scales smoothly between viewport sizes.

## 7. Component Design

| Component | Shape | Radius | Style |
|-----------|-------|--------|-------|
| `.landing-shell` | Card | 24px | Glass, multi-shadow, gradient overlay |
| `.icon-button` | Square | 14px | Glass, subtle hover lift (`translateY(-1px)`) |
| `.search-box` | Pill | 999px | Glass, search icon left-aligned |
| `.feature-pill` | Rounded rect | 16px | Glass, icon + text row |

Search box is the hero element — pill-shaped, large, with prominent shadow.

## 8. Interaction States

```css
.icon-button:hover {
  color: #574cff;                /* accent purple */
  transform: translateY(-1px);   /* subtle lift */
  box-shadow: ...;               /* deeper shadow */
}
```

Transitions: `160ms ease` — snappy but not instant.

## 9. Responsive Strategy

**Breakpoint**: `680px`

| Property | Desktop | Mobile |
|----------|---------|--------|
| Feature grid | 3 columns | 1 column |
| Orbital field | `min(58vh, 62vw, 620px)` | `min(42vh, 82vw)` |
| Search box width | `min(68vw, 760px)` | `100%` |
| Icon sizes | 26–28px | 22–24px |
| Shell padding | `clamp(20px, 3vw, 38px)` | 18px |
| Shell radius | 24px | 20px |

## 10. Key Design Principles

1. **No hard edges** — everything is rounded, translucent, soft
2. **Depth via shadow stacking** — multiple box-shadows + inset highlights
3. **Fluid by default** — `clamp()` everywhere, no fixed breakpoints for spacing
4. **Decorative background** — orbital field adds visual interest without distraction
5. **Minimal chrome** — no borders that stand out, no bold colors, just subtle purple accents
6. **Accessibility** — `aria-hidden` on decorative elements, `aria-label` on sections

## 11. Icon System

- **Library**: `lucide-react`
- **Icons used**: `Search`, `Settings`, `Shield`, `Sparkles`, `Layers`
- **Styling**: icons inherit `color` via `currentColor`, sized via `size` prop (20px)
- **CSS targets** `svg` directly for stroke properties (`fill: none`, `stroke-width: 2`)
