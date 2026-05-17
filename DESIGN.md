# Embeddly Design System

Last updated: 2026-05-16

## 1. Layout Architecture

Embeddly uses a search-first application shell built around `.landing-shell`, a full-viewport frosted panel inside the page background.

```text
main.app
  section.landing-shell
    header.topbar
    main content area
```

Main layouts:

| Surface | Primary Layout | Notes |
|---------|----------------|-------|
| Landing/search | Topbar, centered search stage, optional results | The search field is the hero control until results appear. |
| Chat | Topbar, mode tabs, split chat body, fixed input footer | Sources sit beside messages on wide screens. |
| Upload | Topbar, mode tabs, drop zone, dual transfer panes | Designed for repeated file triage. |
| Settings | Topbar, vertical nav, detail panel | Nav collapses to horizontal scroll on mobile. |

The topbar carries the logo, mode switching, configured model status, wallet login control, and settings button. Content surfaces keep a constrained inner rhythm while the outer shell supplies depth and separation.

Chat and search modes show a setup-required glass notice instead of their primary controls when required providers are missing. The notice lists missing settings and links directly to Settings, while upload stays available.

Retrieval settings include optional reranking controls. When enabled, users can choose the local cross-encoder model, candidate count, and final result count from the same Retrieval settings surface. Project selectors in chat and search scope retrieval to a named dataset while preserving All Documents as the default.

## 2. Color Palette

| Role | Value | Usage |
|------|-------|-------|
| Background | `#f4f7ff` | Page base |
| Text primary | `#17213b` / `#24304b` | Headings, input text, strong labels |
| Text secondary | `#6f7a94` / `#8c96ad` | Body copy, hints, metadata |
| Accent primary | `#6258ff` / `#665cff` | Selected states, icons, primary actions |
| Accent hover | `#574cff` | Button and link hover states |
| Success | `#27745b` | Completed jobs, saved settings |
| Warning | `#8a5c16` | External API privacy warning |
| Error | `#9f4452` | Failed jobs, validation, request errors |
| Borders | `rgba(132, 146, 184, 0.18-0.22)` | Subtle translucent dividers |

The palette is cool, soft, and professional. Hard black is avoided in favor of muted slate tones.

## 3. Glassmorphism

Most surfaces use translucent white backgrounds with layered shadows:

```css
background: rgba(255, 255, 255, 0.72);
box-shadow:
  0 14px 30px rgba(76, 88, 139, 0.09),
  inset 0 1px 0 rgba(255, 255, 255, 0.86);
```

Use glass treatment for panels, cards, settings controls, transfer panes, model cards, and compact status elements. Reserve stronger shadows for primary controls such as the search box and save buttons.

## 4. Orbital Field

`.orbital-field` is decorative only and must keep `aria-hidden="true"`.

- Concentric dotted rings are rendered with `repeating-radial-gradient`.
- Soft organic ellipses use pseudo-elements and child spans.
- A radial mask fades the field outward.
- It is static, not animated, so it adds a knowledge-constellation feel without distracting from input.

## 5. Typography

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

| Element | Style |
|---------|-------|
| Page headings | 20-28px, 800 weight |
| Section headings | 20-24px, 800 weight |
| Search input | 17-20px, 750 weight |
| Card titles | 14-16px, 800 weight |
| Metadata and hints | 12-13px, 600-700 weight |

Use `clamp()` for large layout spacing and hero-scale text. Do not scale normal interface text with viewport width.

## 6. Spacing System

Fluid spacing is used at page and shell level:

```css
padding: clamp(20px, 3vw, 38px);
gap: clamp(14px, 2vh, 24px);
```

Component interiors generally use 10-18px gaps and padding. Dense operational views such as upload, settings, and chat favor organized compact spacing over marketing-style whitespace.

## 7. Component Design

| Component | Shape | Radius | Style |
|-----------|-------|--------|-------|
| `.landing-shell` | App shell | 20-24px | Frosted card with inset highlight |
| `.icon-button` | Square control | 14px | Glass button with hover lift |
| `.search-box` | Pill input | 999px | Large glass search control |
| `.model-card` | Selectable card | 14px | Radio row, selected accent border |
| `.configured-model-card` | Summary card | 14px | Provider icon, model text, change action |
| `.dataset-scope-control` | Scope strip | 14px | Full-width dataset boundary for settings or large project-selection surfaces |
| `.scope-toggle` | Scope toggle | 10-11px | Standout compact chat/search dataset dropdown with side-aligned menu, scope label, and accent rail |
| `.project-chip` | Project token | 8-14px | Deterministic color initials, project name, count, all-documents and unassigned states |
| `.project-selector` | Compact selector | 12px | Native select for upload assignment controls |
| `.setup-message` | Inline banner | 14px | Info, warning, error, or success state |
| `.save-button` | Primary action | 10px | Accent gradient, icon plus label |

Cards are used for individual repeated items and controls, not for nesting full sections inside other cards.

Project identity colors are derived on the client by hashing the project name into five existing palette accents:
purple `#6258ff`, teal `#27745b`, amber `#8a5c16`, rose `#9f4452`, and slate `#6f7a94`.
The color is not stored in SQLite, so projects keep a stable visual identity without a schema field.
`ProjectChip` initials are decorative and the chip supplies an accessible label with project name and count when shown.

## 8. Interaction States

Interactive states use short transitions, typically `160ms ease`.

```css
.icon-button:hover {
  color: #574cff;
  transform: translateY(-1px);
}
```

Selected state conventions:

- Selected provider/model cards use accent borders and subtle inset outlines.
- Disabled buttons reduce opacity and remove hover lift.
- Error states use red-tinted backgrounds and `role="alert"` where user action is needed.
- Loading states use spinner icons or clear status text without resizing the surrounding layout.

## 9. Responsive Strategy

Primary breakpoint: `680px`.

| Surface | Desktop | Mobile |
|---------|---------|--------|
| Settings | 220px nav plus detail panel | Horizontal scrolling nav above detail |
| Upload | Dual panes with transfer controls | Stacked or compressed pane layout |
| Chat | Messages plus sources panel | Sources collapse to preserve message space |
| Search | Search and results share stage | Full-width search and stacked results |
| Topbar | Logo, mode tabs, model status, settings | Controls wrap or compact as needed |

Stable dimensions are preferred for repeated rows, icon controls, badges, and status areas so text and loading states do not shift the layout.

## 10. Design Principles and Icon System

1. Keep the UI quiet, utilitarian, and search-focused.
2. Use depth through translucent surfaces and layered shadows.
3. Use clear hierarchy: primary action, current status, then supporting metadata.
4. Make ingestion and retrieval state visible without exposing private document content unnecessarily.
5. Keep controls accessible with labels, roles, and keyboard-friendly native inputs.
6. Prefer consistent local patterns over introducing new visual systems.

- Library: `lucide-react`.
- Common icons include `Search`, `Settings`, `Database`, `Server`, `Zap`, `Save`, `RefreshCw`, `AlertCircle`, and `X`.
- Icons inherit color through `currentColor`.
- CSS targets `svg` for consistent `fill: none`, rounded line caps, and `stroke-width: 2`.
- Use icons inside action buttons when the icon has a familiar meaning.

## 11. Chat Interface

| Component | Description |
|-----------|-------------|
| `ChatPanel` | Main chat container with conversation sidebar, message area, sources panel, and footer input. |
| `ScopeToggle` | Standout compact retrieval scope selector in the sources panel header. |
| `ChatSidebar` | Collapsible conversation history rail with new-chat, rename, delete, and count controls. |
| `ChatSessionItem` | Conversation row or icon-only collapsed item with active and rename states. |
| `ChatInput` | Text input and send action for user prompts. |
| `MessageList` | Scrollable message list for user and assistant turns. |
| `SourcesPanel` | Collapsible panel showing retrieved chunks and rewrite status. |
| `ModelStatusBar` | Compact status pills for embedding, LLM, and VectorDB settings. |
| `LoginButton` | Compact wallet connection state and disconnect menu. |
| `SourceChip` | Inline source citation badge inside assistant messages. |
| `SourceList` | Collapsible per-message source summary below assistant answers. |

Visual rules:

- Chat uses a glass panel aligned to the application shell.
- The compact scope toggle lives in the sources panel header so retrieval scope is controlled where retrieved context appears without taking message-list space.
- When scope changes during a conversation, a small system row records the new retrieval scope.
- The conversation sidebar is 260px when expanded and a 44px icon rail when collapsed.
- Collapsed sidebar items expose titles through hover tooltips and keep the active conversation visibly highlighted.
- Mobile treats the expanded sidebar as a left overlay drawer while preserving a narrow access rail.
- User messages are visually distinct from assistant messages through alignment and bubble treatment.
- Assistant messages support streaming state and error state without changing row structure.
- Source cards show document name, chunk index, score, and preview text.
- Inline citations such as `[Source 1]` should remain readable and visually tied to `SourcesPanel`.
- Inline source chips replace raw citation text when source data is available.
- Source popovers show document metadata, adjacent chunk context, and a document navigation action.
- Per-message source lists are collapsed by default and distinguish cited chunks from retrieved-only chunks.
- The input footer remains easy to reach and should not overlap messages or sources.

## 12. Upload & Transfer Interface

| Component | Description |
|-----------|-------------|
| `UploadBox` | Owns file loading, transfer state, selections, and job polling. |
| `FileDropZone` | Compact drag-and-drop area for accepted files. |
| `ScopeToggle` | Upload file-view filter for All Documents, one project, or No project. |
| `ProjectSelector` | New-upload project selector and batch assignment selector. |
| `ProjectChip` | Compact row and summary identity for assigned or unassigned project state. |
| `TransferPane` | Left or right file list with search and selection. |
| `FileTransferRow` | Individual file row with icon, metadata, selection, and status. |
| `TransferControls` | Move selected files between panes. |
| `EmbedActionBar` | Summarizes selected knowledge-base files and starts embedding. |

Visual rules:

- Left pane represents available uploaded files.
- Right pane represents the knowledge base queue or indexed set.
- Status badges communicate pending, embedding, completed, and failed states.
- Project chips on rows should make assignment visible without competing with filename and processing status.
- Unassigned rows use the warning-tinted `ProjectChip` state so missing categorization feels incomplete.
- Batch assignment uses a sticky glass bar labeled "Assign to project" with selected count, target project, primary Apply action, and clear selection affordance.
- A project scope panel above transfer panes combines a compact `ScopeToggle`, clear-filter action, and clickable summary chips for All Documents, each project count, and No project count.
- When upload scope is active, both transfer panes show only matching documents and headers show filtered counts such as "12 of 50".
- Per-row project dropdowns and compact assignment controls use native selects to keep repeated file triage fast.
- Active stages such as parsing, chunking, embedding, and indexing use progress treatment.
- Failed rows must keep the retry or return path clear.
- Upload errors should appear near the upload workflow rather than in global chrome.

## 13. Settings Page

| Component | Description |
|-----------|-------------|
| Settings nav | Vertical tab navigation for configuration categories. |
| Provider cards | Radio-selectable provider choices with icon and mode badge. |
| Model cards | Radio-selectable model rows populated from Ollama when applicable. |
| Form fields | Text, URL, password, number, select, range, and checkbox inputs. |
| Project cards | Identity chip, editable project name, optional description, document count, save, and inline delete confirmation. |
| Warning banners | Privacy and validation warnings for external API usage. |
| Save button | Primary action with loading and saved/error feedback. |

Visual rules:

- Desktop uses a two-column layout: navigation left, content right.
- Mobile uses a horizontal scrolling settings nav.
- Provider mode badges distinguish local and remote options.
- External API setup uses a warning banner because prompts and context leave the local machine.
- API keys are described as stored encrypted on the local server and masked after saving.
- Projects are managed in Settings; deleting one clearly communicates that documents become unassigned.
- Project cards use the same deterministic color initials shown in chat, search, and upload.
- The projects empty state explains that projects scope retrieval and points users to the new-project form.
- A helper note reminds users that unassigned documents remain searchable under All Documents.
- Success and error save messages use the same `.setup-message` system as validation feedback.

## 14. Login Modal

| Component | Description |
|-----------|-------------|
| `LoginButton` | Topbar control for connecting a Lightning wallet or opening the disconnect menu. |
| `LoginModal` | Centered glass modal with LNURL QR code, copy action, browser-wallet action, status text, and close control. |

Visual rules:

- Logged-out state uses a compact glass button with a `Zap` icon and "Connect Wallet" label on desktop.
- Mobile keeps the login control icon-sized to preserve topbar space.
- Logged-in state displays a truncated wallet public key and a small dropdown with "Disconnect".
- Login modals render through a document-level portal so they sit above page shells, settings panels, dropdowns, and popovers.
- Modal status text must be concise and fixed-height enough to avoid layout shift while polling.
- QR code sits in a simple glass frame and remains the primary visual focus.
- The copy action stays available even when browser-wallet connection fails.
- The LNURL auth request is visible in a selectable read-only field for manual wallet paste flows.

## 15. Search Results & Ontology Map

| Component | Description |
|-----------|-------------|
| `SearchResults` | Coordinates result list, selected state, detail panel, and map. |
| `ScopeToggle` | Standout compact scope selector inside the empty search input and in the result header when results are visible. |
| `ProjectChip` | Header project identity and unscoped per-result initials tile. |
| `ResultPanel` | Detail preview for a selected search result. |
| `OntologyMap` | Interactive node-link visualization for search result relationships. |

Visual rules:

- Result cards show document name, chunk preview, and relevance score.
- Result headers read as scoped output, for example "8 results from React Docs" or "8 results from All Documents."
- The search page avoids a full-width scope strip; the compact toggle uses a visible `Scope` label, accent rail, and side-aligned dropdown while staying secondary to the query and result content.
- Unscoped search shows per-result project initials tiles; scoped search suppresses redundant row project badges.
- Reranked chat sources show both embedding and rerank scores so users can tell when the second stage affected ordering.
- Selected result state should be obvious without overpowering the map.
- The ontology map represents chunks or documents as circular nodes connected by relationship lines.
- Hover and focus states should expose interactivity while preserving map readability.
- Empty search states should be helpful and concise.

## 16. CSS File Organization

CSS is co-located with components.

```text
src/
  index.css                # Global base styles
  App.css                  # App shell, landing, search-stage styles
  components/
    SettingsPage.jsx
    SettingsPage.css
    ChatPanel.jsx
    ChatPanel.css
```

Rules:

- Keep one CSS file per substantial component.
- Place component CSS next to its JSX file.
- Keep global reset, fonts, and base page styles in `index.css`.
- Keep shell and route-level layout styles in `App.css`.
- Put responsive rules in the same CSS file as the component they affect.
- Avoid inline styles unless a value is genuinely dynamic.
