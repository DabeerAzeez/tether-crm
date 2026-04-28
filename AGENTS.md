# AGENTS.md
This file provides guidance to agents when working with code in this repository.

## After Every Code Change

Start the dev server and open the app in the browser to check for syntax errors and verify the UI works before reporting back.

## Product Requirements

The full PRD is at `.ai/PRD.md`. Detailed TODO items are in `.resources/TODO.md` (gitignored).

## Dev Server

There is no build step. All dependencies load from CDN and JSX is transpiled in-browser by Babel standalone.

```bash
npx serve -l 8000
```

Allowed ports for testing: 8000, 8001, 8002, 8003. Google OAuth requires an HTTPS origin in production, but localhost works for development.

## Linting & Testing

To ensure code quality and correctness, run the following commands:

```bash
# Run ESLint on all source files
npm run lint

# Run Vitest tests once
npm run test

# Run tests in watch mode during development
npm run test:watch
```

## Architecture

**TetherCRM** is a privacy-first personal CRM — a static single-page app with no backend.

- **No npm / no build pipeline.** `index.html` loads React 18, Babel, Tailwind, Leaflet, and Google APIs from CDN. JSX is transpiled in-browser by Babel standalone; files are loaded sequentially via async IIFEs in `index.html`.

### Source files (`src/`)

| File | Purpose |
|------|---------|
| `app.jsx` | Root component, routing, `Dashboard` shell, `KeyListener` |
| `context.jsx` | `AppCtx` React context and `AppProvider` — all state + mutations |
| `components.jsx` | Reusable UI primitives: `Avatar`, `Button`, `Card`, `LabelMenu`, etc. |
| `constants.jsx` | Icons (SVG), reserved category names, app-wide constants |
| `drawer.jsx` | Contact detail side-panel and interaction logging modal |
| `sidebar.jsx` | Navigation rail and unresolved attendee hints |
| `onboarding.jsx` | Multi-step onboarding flow (`signin` → `syncing` → label mapping → close friends picker) |
| `tabs.jsx` | All eight tab components (`AllContactsTab`, `ReconnectTab`, `AskTab`, etc.) |
| `google.js` | Google API wrapper (`window.TetherGoogle`): OAuth, People API, Calendar API, Drive CRUD |
| `storage.js` | `localStorage` persistence helpers and Nominatim geocoding |
| `helpers.js` | Pure utility functions: date formatting, label management, contact scoring |
| `data.js` | Mock seed data (35 contacts, 16 events) for demo mode |
| `config.js` | Google OAuth client ID |

## Data & Storage

All contact data lives in a single file — `tether_contacts_v1.json` — in Google Drive's private `appDataFolder` (invisible to the user, inaccessible from Drive UI). There is no backend database.

- Reads happen on sign-in. Writes are fire-and-forget on every mutation (add, edit, delete, log interaction, toggle nudge).
- Access tokens are stored in `localStorage` with an expiry timestamp and restored on page reload via `TetherGoogle.tryRestoreToken()`.
- The app never writes back to Google Contacts — Drive is the sole write target.

## App State & Context

`AppCtx` (React context, provided by `AppProvider`) is the single source of truth:
- Holds contacts array, custom labels, nudge settings, theme, active tab, and onboarding phase.
- App-level state (labels, theme, nudge defaults, walkthrough progress) is persisted to `localStorage` separately from contacts.
- `state.phase` controls the onboarding flow: `signin` → `syncing` → `setup-mapping` → `setup-closefriends` → `walkthrough` → dashboard.

## Tabs

Eight tabs, each a self-contained component rendered by `Dashboard`:

| Key | Component | Purpose |
|-----|-----------|---------|
| `contacts` | `AllContactsTab` | Browse, search, filter, import contacts |
| `reconnect` | `ReconnectTab` | Close friends overdue for outreach (nudge system) |
| `ask` | `AskTab` | Natural language query UI (LLM integration placeholder) |
| `map` | `MapTab` | Leaflet geo-visualization of contacts |
| `calendar` | `CalendarTab` | Google Calendar sync, attendee resolution |
| `trash` | `TrashTab` | Soft-deleted contacts |
| `help` | `HelpTab` | Docs and walkthrough replay |
| `settings` | `SettingsTab` | Theme, nudge defaults, export, sign out |

Keyboard shortcuts (`g+r`, `g+a`, `g+m`, `g+c`) navigate between tabs via `KeyListener`.

## Key Subsystems

**Nudge system**: Each contact can have `nudgeFrequencyDays`. The Reconnect tab surfaces close friends whose `lastContactedDaysAgo` exceeds their nudge frequency, ranked by how overdue they are.

**Label system**: Two label namespaces — `googleLabels` (imported from Google Contacts, read-only) and `crmLabels` (user-created, stored in Drive). Reserved categories: `Close Friends`, `Casual`, `Professional`, `Family`, `Other`.

**Geocoding**: Nominatim (OpenStreetMap) converts city names to lat/lng for map pins. Rate-limited to 1 request/second.

**Calendar integration**: Fetches 90 days past + 30 days future. Cross-references attendee emails with contact emails to auto-populate `lastContactedAt`. Birthday events are matched by name pattern (e.g., "Priya's birthday").

**Demo mode**: If `src/data.js` mock data is loaded (no real OAuth session), the full UI renders with seeded contacts and events so features can be explored without a Google account.
