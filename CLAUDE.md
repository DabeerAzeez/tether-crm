# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## After Every Code Change

Start the dev server and open the app in the browser to check for syntax errors and verify the UI works before reporting back.

## Product Requirements

The full PRD is at `.ai/PRD.md`. Key points relevant to implementation decisions:

- **Storage target (current vs. PRD):** The PRD specifies Google Contacts + Google Calendar as the source of truth with IndexedDB for app-only data. The current implementation diverged from this — it uses Google Drive `appDataFolder` as the primary store instead of writing back to Google Contacts. New work should follow the PRD's intent (People API write-back) unless otherwise directed.
- **`CRM:` label prefix:** Categories are Google Contact labels prefixed with `CRM:` (e.g. `CRM: Close Friends`). The label namespace is what the PRD defines — mapping this correctly matters for round-tripping edits to Google.
- **Milestones:** M1–M3 are largely complete. M4 (interaction logging → `Personal CRM` calendar) and M5 (Calendar attendee resolution with write-back) are the next active areas. M7 (Ask/LLM) is a placeholder UI only.

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

- **No npm / no build pipeline.** `index.html` loads React 18, Babel, Tailwind, Leaflet, and Google APIs from CDN.
- **`src/app.jsx`** (~3,700 lines) contains everything: all React components, state management, business logic, and tab implementations. It is intentionally monolithic.
- **`src/google.js`** is the Google API wrapper exposed as `window.TetherGoogle`. Handles OAuth tokens, People API, Calendar API, and Drive appDataFolder CRUD.
- **`src/data.js`** contains mock seed data (35 contacts, 16 events) used in demo mode when no real Google credentials are available.
- **`src/config.js`** holds the OAuth client ID.

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
