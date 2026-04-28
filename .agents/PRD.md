# Personal CRM — Product Requirements Document

**Version:** 0.5 (Draft)
**Status:** Scoping
**Target release:** v1 (web only)
**License model:** Free, open-source

---

## 1. Summary

A privacy-preserving personal CRM web app that helps users maintain meaningful relationships with 100-300 contacts. Users sign in with Google, import their contacts, log interactions manually, sync their Google Calendar to see who they've spent time with, receive proactive nudges to reconnect with close friends, query their network in natural language, and view contacts geographically.

All contact and CRM data is stored in a private JSON file in the user's Google Drive appDataFolder — portable across browsers without requiring a backend. Google Contacts (and potentially other sources in future) can be imported during onboarding to seed the contact list, but the app does not write back to Google Contacts.

## 2. Problem statement

Maintaining a wide social and professional network is hard. You can likely keep only about 10 people at the top of your mind, but contacts you met in another country, or a networking event, or even back in school who might be able to help you out today have probably slipped through the cracks of your memory and whatever contacts app you use. That's because because there's no lightweight system to keep track of everyone. Existing CRM tools are either optimized for sales pipelines, too complex to set up, require a paid membership, or are too basic and lack modern relationship intelligence features like being able to search and chat with your network, integrate with calendar events, or connect to LinkedIn. Users who value their network need something between these -- a low-friction free *personal* relationship management (PRM).

## 3. Target user

- **Primary persona:** Social connector, 100–300 contacts, mix of close friends, casual acquaintances, and professional contacts. 
- **Behaviors:** Travels periodically, values friendships, attends networking events, wants to be intentional about maintaining relationships without it feeling transactional.
- **Pain points:** 
  - Doesn't realize how long it's been since they've last contacted a certain friend
  - Can't recall which friend lives in a city they're visiting
  - Adds contacts from LinkedIn at a networking event but forgets about them later when they need expertise or a reference in a specific industry
  - Has no searchable memory of "who do I know who does X"

## 4. Goals & non-goals

### Goals

- Help users stay in touch with close friends proactively.
- Make it fast to look up contacts by skill, location, or shared context.
- Store all contact and CRM data in the user's Google Drive appDataFolder — portable, private, no project-owned backend.
- Support importing contacts from Google Contacts (and other sources in future) without requiring write-back.
- Surface past hangouts automatically via calendar sync.
- Work entirely on web; no mobile app in v1.
- Keep it free and open source.

### Non-goals

- No social features. No shared contact data, no friends-of-friends discovery, no profile visibility to contacts.
- No native mobile app in v1.
- No automatic interaction tracking from Gmail/Messages in v1 (calendar is the only auto-source; everything else is manual).
- No social media scraping (LinkedIn/Instagram/Facebook).
- No monetization, no paid tiers, no analytics tracking.
- No multi-device sync or offline mode in v1.
- No write-back to Google Contacts or any contact import source.
- No multi-user collaboration.
- No automatic background syncs in v1 (manual refresh only after onboarding bulk pull).
- No birthday tracking in v1 (deferred to v2).
- No in-app importance-ranking transparency in v1.

## 5. Core features

### 5.1 Sign-in + contact import

- OAuth via Google with scopes for Drive (appDataFolder read/write), Contacts (read-only, for import), and Calendar (read + write).
- On first sign-in, **load existing Drive data if present** (returning user on a new browser). Otherwise, offer a one-time import from Google Contacts to seed the contact list.
- **Google Contacts import is read-only and one-time.** The app pulls contacts and their labels but never writes back to Google Contacts. Future versions may support additional import sources (CSV, other services).
- **One bulk import during onboarding.** After that, re-import from Google Contacts is available manually via Settings. Automatic re-syncs deferred.
- All contact data and CRM metadata is persisted exclusively to `tether_contacts_v1.json` in Google Drive appDataFolder.

### 5.2 Contact profiles

Per-contact fields:
- Name, photo, phone, email (imported from source; editable in-app, changes saved to Drive).
- Labels/tags imported from the source (e.g. Google Contact groups); editable in-app, stored in Drive.
- User-added in-app:
  - LinkedIn URL, Instagram handle, Facebook URL, website (stored as reference links only — app does **not** scrape them).
  - Freeform notes (markdown supported).
  - Location (city, country; lat/long resolved via geocoding).
  - Custom fields (skills, job title, company, how-we-met).
- Interaction log: list of logged hangouts/calls/messages with date + optional note (see 5.5).
- Per-contact nudge frequency override (see 5.7).

#### 5.2.1 Categories

Categories are app-level concepts stored in the Drive JSON. They are not written to Google Contacts or any external system.

Reserved categories:
- Close Friends
- Casual Friends
- Professional
- Family
- Other

Plus any user-created categories.

**Key rules:**
- Labels imported from Google Contacts (or other sources) are preserved as tags and shown in the contact UI, but they don't automatically become categories.
- During onboarding, users can map their imported labels to CRM categories (e.g. their "Work" label → Professional). This mapping is stored in Drive; no changes are made to Google Contacts.
- The original imported labels are preserved as tags alongside the assigned categories.
- A contact may belong to multiple categories. See 5.2.2 for how color handles this.
- Adding/removing categories updates the Drive JSON only.

#### 5.2.2 Category colors

Each category has an assigned color used consistently across the app (dashboard tabs, map pins, calendar event badges, contact cards).

- Sensible default colors ship with two themes: **light** and **dark**. User picks between them in Settings. Individual colors are editable per category after that.
- **Multi-category contacts** (a contact belonging to two or more categories) render in a dedicated **Deep Purple** color, independent of their individual category colors. This avoids forcing the user to pick a priority order — it's a visually distinct "ambiguous" state. Expected to be uncommon.

### 5.3 Automatic importance ranking

Since the app imports all contacts (which may include hundreds of stale email-only entries), it ranks contacts by inferred importance so the user isn't drowning. Signals:

- Presence of any imported label or tag (labeled contacts rank higher than unlabeled).
- Presence of a CRM category assignment (ranks higher than unlabeled).
- Calendar co-attendance frequency over the last ~3 months.
- Logged interaction count and recency.
- Completeness of contact record (name + phone + email > email only).

Ranking affects default sort in All Contacts (5.4.5) and the close-friends suggestion list during onboarding. Does **not** auto-assign categories — user still chooses. Ranking is not exposed to the user in v1 (no "why is this contact ranked highly" hover).

### 5.4 Dashboard layout

Left-hand navigation with tabs in this fixed order:

1. Reconnect
2. Ask
3. Map
4. Calendar
5. All Contacts
6. Help
7. Settings

Tabs 1–5 are primary workflows. Help and Settings are utility tabs, visually separated (e.g. bottom of nav or divider above them).

#### 5.4.1 Reconnect (landing tab)

Default view on login after onboarding. Sections:

- **Close friends to catch up with** — contacts in the Close Friends category sorted by least-recently-contacted, with last-interaction date and a quick "Log interaction" button. Visual cue (category color badge + staleness indicator) for contacts past their nudge threshold.
- **Category group check-ins** — surfaces user-defined group-level nudges (see 5.7), e.g. "You haven't connected with anyone in Professional in 2 months."
- **Recent activity** — last 5–10 logged interactions.
- **Upcoming** — user-set reminders only in v1 (birthdays deferred to v2). Section hidden if empty.

Only close friends (and any group-nudge-enabled categories) surface proactive items. Other categories are browse-on-demand via All Contacts.

**Empty state during onboarding:** Until the user sets a nudge frequency for at least one contact, this tab shows a guided empty state with two calls to action:
1. "Set a nudge for a close friend" — opens a quick picker of the user's identified close friends.
2. "Go to All Contacts" — deep-link to All Contacts to browse.

#### 5.4.2 Ask (chat)

Natural language chat over the contact database.

- Queries: contact metadata (name, labels, category, location, custom fields) + user notes on each contact.
- Does **not** query calendar event content, emails, or external data.
- Example prompts: "Who do I know in Berlin?", "Which friends are into climbing?", "Who could mentor me on product management?", "I'm thinking of a trip to Southeast Asia, any friends I could visit?"
- Answers surface contact cards inline; clicking opens full profile.
- Chat can trigger the **Map tab** when the query is geographic — e.g. the trip-planning example above opens the map scoped to the region the user mentioned, with contacts pinned.
- LLM endpoint is user-configurable (see 5.8).

**Empty state (no API key configured):** Tab shows a setup prompt: "Add an API key to enable chat." Link to Settings → LLM config.

#### 5.4.3 Map

Interactive geographic view of contacts. Works by default for any user signed in with Google — no extra setup.

- Every contact with a resolved location appears as a pin, colored by category (Deep Purple for multi-category contacts).
- **Drop-a-pin mode:** user clicks anywhere on the map to drop a reference pin; sidebar then lists contacts with sort options:
  - Closest distance (default)
  - Most recently contacted within a fixed radius
  - Least recently contacted within a fixed radius
- Radius is user-adjustable (e.g. 10 km, 50 km, 500 km).
- Clustering at low zoom; clicking a pin opens contact card.
- Map is also invoked inline by the Ask tab for geographic queries. Chat-invoked view uses the same interface and supports the same sort options.
- Trip planning: driven entirely by the message the user typed in Ask. By default, map opens centered on the region the chat identified, showing contacts within a reasonable radius; user can then re-sort or drop a pin to refine.

#### 5.4.4 Calendar

Syncs Google Calendar and presents it alongside logged interactions. Works by default after sign-in.

- **Default window:** last ~3 months of past events + upcoming events.
- Each event shows:
  - Title, time, location.
  - **Matched attendees** — guests on the formal invite list cross-referenced against the user's contacts. Matches show as contact chips with category color.
  - **Unresolved attendees** (see below).

##### Unresolved attendees (the "question mark" flow)

When an event's title/description suggests a contact was there ("Dinner with Priya", "Coffee w/ Alex & Jordan") but no matching contact is formally on the guest list, the app renders that event with a **grayed-out placeholder chip with a question mark** for each suspected attendee.

The user resolves by clicking the question-mark chip, which opens a resolver:
- **Top suggestions from the app** (ranked by name match + co-attendance frequency + shared labels with confirmed guests). One-click confirm.
- **Manual search** box to pick any contact from the app's contact database if the app's guesses are wrong.
- **Dismiss** — marks the placeholder as "not a contact" so it stops surfacing.

Resolved attendees:
- Get added to the **actual Google Calendar event's guest list** (since we have Calendar write permission).
- Generate an interaction log entry for that contact on the event date (saved to Drive).
- Update the contact's last-contacted timestamp.

The Calendar tab surfaces a visible count of unresolved events at the top so the user can work through them quickly (especially highlighted after onboarding).

##### Logged interactions on the calendar

Interactions logged via Reconnect, contact profile, or bulk log render on the Calendar tab on their date. These are written as **events on a dedicated `Personal CRM` Google Calendar** created by the app in the user's Google account:
- Event title: `[contact name] — [interaction type]` (e.g. "Priya Shah — hangout").
- **No guest invitations.** The app does **not** add the contact to the event's invite list, so no Gmail notification is sent. The contact association is stored in the event body/metadata instead.
- Event body contains the user's note and the associated contact's name/ID.
- If the user declines Calendar write permission, logged interactions are saved to Drive and rendered on the Calendar tab locally only (not visible in Google Calendar or on other clients).

Permission prompt for calendar write is shown the first time the user logs an interaction or resolves an attendee, not during onboarding — it's asked in context when the benefit is visible.

#### 5.4.5 All Contacts

- Flat list of every imported contact.
- Default sort: importance ranking (see 5.3). User can re-sort by name, last contacted (most/least recent), category, location, date added.
- Filter by label/tag, category, or free-text search.
- Clicking a contact opens the full profile (5.2), where user can view and edit all fields. All edits are saved to Drive only.
- Bulk operations: assign category, set nudge frequency, archive.

#### 5.4.6 Help

Documentation and re-onboarding.

- Collapsible docs for each primary tab (Reconnect, Ask, Map, Calendar, All Contacts): what it does, how to use it, common tasks.
- Docs for key concepts: categories/labels model, nudges, interaction logging, privacy model.
- **"Restart onboarding"** button — re-runs the onboarding flow (5.9) from the top. Does not wipe data.
- **"Rerun dashboard walkthrough"** button — replays just the optional guided tour without the full onboarding. Accessible at any time, even if the user previously skipped it.
- Link to GitHub repo, issue tracker, changelog.
- Keyboard shortcuts reference.

#### 5.4.7 Settings

Account and app preferences.

- **Account**
  - Signed-in Google account (email, avatar).
  - **Sync status** — last Drive save timestamp, last calendar sync timestamp, current permission scopes granted. This is the only surface showing sync recency.
  - **Sync calendar** button — manual re-fetch of calendar events.
  - **Re-import contacts** button — re-pulls from Google Contacts and merges with existing Drive data (additive, no deletions).
  - **Unlink account** — signs out and clears all local app data. Confirmation required. Drive file is preserved.
- **Appearance**
  - Theme: light / dark (each ships with its own sensible default category palette).
  - Per-category color override (edit individual colors after picking a theme).
- **LLM config** (see 5.8)
  - Provider (OpenAI / Anthropic / local Ollama / other OpenAI-compatible).
  - API key (or endpoint URL for local).
  - Test connection button.
- **Calendar**
  - Toggle: write logged interactions to Google Calendar. Off → Drive-only (see 5.4.4).
  - Choose which Google Calendars to read from for event sync (user may have many calendars; default is primary only).
- **Nudges**
  - Default staleness threshold for close friends.
  - Group-level nudge cadences per category.
  - Email digest opt-in (weekly summary of stale close friends + overdue group check-ins).
- **Data**
  - "Clear all app data" — deletes the Drive JSON file and resets all local state. Requires confirmation. Does not touch Google Contacts or Calendar.

### 5.5 Manual interaction logging

- "Log interaction" button on every contact card and profile.
- Fields: date (defaults to today), type (hangout / call / text / email / event / other), optional note, optional location.
- Bulk log: "I was at [event] and saw [contacts A, B, C]" logs all three at once.
- Logged interactions:
  - Update the contact's last-contacted timestamp.
  - Appear in the contact's interaction log (saved to Drive).
  - Render on the Calendar tab on the appropriate date (see 5.4.4).
  - Write to `Personal CRM` Google Calendar (no guest invites, no Gmail notifications) if Calendar write permission granted; otherwise Drive-only.
- Edit/delete past log entries from the contact profile or from the calendar event. Edits propagate to Google Calendar in either direction.

### 5.6 Editing contacts in-app

- All contact fields (name, phone, email, address, notes, labels, categories) are editable in the contact profile.
- All edits are saved to the Drive JSON immediately. No write-back to Google Contacts or any import source.
- The Drive record is always authoritative. There is no sync conflict resolution — the app does not attempt to reconcile in-app edits with external changes to the import source.

### 5.7 Nudge frequencies

- **Per-contact nudge frequency:**
  - Default: off for all contacts.
  - During onboarding, user sets nudge frequencies for the close friends they selected.
  - User can override per-contact at any time from the profile.
- **Per-category nudge frequency:**
  - User can set group-level cadence (e.g. "Connect with someone in Professional at least every 2 months").
  - Surfaces on Reconnect tab as a group check-in prompt rather than per-contact nudges.
  - Default off for all categories; user opts in via Settings.
- Individual and group nudges coexist.
- Reconnect tab is non-functional (shows empty-state prompt) until at least one nudge frequency is set; see 5.4.1.
- No push notifications in v1. Optional opt-in weekly email digest of stale close friends + overdue group check-ins.

### 5.8 LLM configuration

User chooses where chat inference runs, based on their technical ability:

- **Cloud API key option:** user pastes their own OpenAI/Anthropic/other API key; stored locally in browser, never sent anywhere except the model provider. Easier setup.
- **Local model option:** point the app at a local Ollama endpoint (or any OpenAI-compatible local server). More private, requires the user to run Ollama.
- No default project-owned endpoint. User must pick one to enable the Ask tab.
- Configured in Settings → LLM config, also triggered on-demand when user first visits Ask tab.

### 5.9 Onboarding flow

Split into required steps done upfront and optional steps gated behind first-use of each feature.

**Required (done at first sign-in):**

1. **Sign in with Google** — request Drive (appDataFolder read/write), Contacts (read-only), and Calendar (read) scopes. Calendar write is deferred to first relevant action.
2. **Load or import** — if a Drive file exists (returning user), load it. Otherwise, offer a one-time import from Google Contacts. Progress indicator shown for large contact lists.
3. **Set up contacts:**
   - If the imported contacts have **existing labels**: app shows them and asks the user to map each label to a CRM category (e.g. map "Friends" → Close Friends, map "Work" → Professional, or skip). The mapping is stored in Drive; no changes are made to Google Contacts. Original imported labels are preserved as tags.
   - If the user has **no labels at all**: app skips the mapping step and asks the user to pick some close friends from a list of their top-ranked contacts (by importance ranking).
     - Guidance text: "Close friends are the people you want to stay in regular touch with. The more you add, the more nudges you'll get — pick as many as you can realistically keep up with."
     - Soft suggestion only; no hard cap.
4. **Dashboard walkthrough (optional, skippable)** — stepped tooltip tour of each tab with a short explanation and a highlight on the key UI element. On skip, a dismissable toast reads: "You can rerun the walkthrough anytime from the Help tab."

**On-demand (triggered when user first visits the relevant tab):**

- **Reconnect** — shows empty-state prompt until user sets a nudge frequency for at least one contact. Two quick-action buttons: "Set nudge for a close friend" (opens picker of identified close friends) or "Go to All Contacts."
- **Ask** — prompts for LLM API key if not yet configured; links to Settings.
- **Map** — works by default after sign-in.
- **Calendar** — works by default. Highlights recent events with unresolved attendees so the user can work through them.
- **All Contacts** — works by default.

Skipping the walkthrough is permanent for that session — the walkthrough does not reappear on subsequent tab visits. Users rerun it from Help. Onboarding as a whole can also be restarted from Help.

### 5.10 Help tab

See 5.4.6.

### 5.11 Settings tab

See 5.4.7.

## 6. Non-functional requirements

### 6.1 Privacy & data model

- **No project-owned backend stores user data.**
- All contact data (profiles, categories, tags, notes, custom fields, interaction logs, nudge settings, category colors) is stored in `tether_contacts_v1.json` in Google Drive appDataFolder. This file is private to the app and not visible from the Google Drive UI.
- Calendar data lives in Google Calendar (including logged interactions written to the `Personal CRM` calendar, when user grants write permission).
- LLM API keys are stored in browser localStorage only and are never written to Drive or sent anywhere except the user's chosen LLM provider.
- Google OAuth tokens stored in browser with standard OAuth flow; refreshed as needed.
- When user queries the Ask tab using a cloud LLM, contact metadata + notes relevant to the query are sent to the user's chosen provider. Made explicit in the UI.

### 6.2 Performance

- Dashboard loads < 500ms for 300 contacts after initial sync.
- Calendar tab renders 3 months of events < 1s.
- Chat response bounded by user's chosen LLM endpoint.
- Map renders smoothly with 300+ pins.

### 6.3 Accessibility

- WCAG 2.1 AA target.
- Keyboard navigable throughout, including map drop-pin, calendar attendee resolution, and onboarding wizard.
- Screen reader support for contact cards, dashboard, chat, calendar.

### 6.4 Browser support

Modern Chromium, Firefox, Safari. No Chromium-only features in v1.

## 7. Technical architecture (proposed)

- **Frontend:** React & Tailwind CSS. Modern UI with warm touch, earthy tones.
- **Storage:** Google Drive appDataFolder (`tether_contacts_v1.json`) as sole source of truth for all contact and CRM data. No IndexedDB.
- **Auth:** Google OAuth 2.0 (client-side flow, no backend).
- **Google APIs:** People API (read-only, for contact import); Calendar API (read + write); Drive API (appDataFolder read/write).
- **Geocoding:** OpenStreetMap Nominatim.
- **Map:** Leaflet + OpenStreetMap tiles.
- **LLM:** User-configured endpoint (cloud API key or local Ollama).
- **Hosting:** Static site on GitHub Pages / Cloudflare Pages / self-host.

No backend owned by the project. Everything runs in the user's browser.

## 8. User flows (key)

### 8.1 First-run / onboarding

1. Land → sign in with Google → grant Drive + Contacts read + Calendar read permissions.
2. App checks Drive for existing data. If none: pull all contacts from Google Contacts (progress bar).
3. If imported contacts have labels: map them to CRM categories (stored in Drive, not written to Google). Else: pick close friends from top-ranked contacts list.
4. Optional dashboard walkthrough (skip → toast reminder about Help tab).
5. Land on Reconnect tab with empty-state prompt → user sets a nudge for one close friend → Reconnect activates.

### 8.2 Log an interaction

Reconnect (or any contact card) → "Log interaction" → date + type + optional note → save → contact last-contacted updates in Drive, entry appears on Calendar tab. If first-ever log, app requests Calendar write permission; on grant, entry also written to `Personal CRM` Google Calendar with no guest invitations.

### 8.3 Resolve a calendar event's unknown guest

Calendar tab → event "Dinner with Priya" renders with a grayed-out `?` chip → user clicks chip → resolver opens with top suggestions → user clicks "Priya Shah" → Priya added to actual Google Calendar event's guest list, interaction logged for Priya on event date and saved to Drive.

### 8.4 Plan a trip via chat

Ask → "I'm going to Lisbon next month, who do I know there?" → chat answers with contact list + "Show on map" button → clicking opens Map tab centered on Lisbon → user drops a pin on their hotel location → sidebar re-sorts by closest distance.

### 8.5 Edit a contact in-app

All Contacts → click contact → edit phone number → save → change saved to Drive JSON immediately. No write-back to Google Contacts.

### 8.6 Add a tag to a contact

Contact profile → add tag "Climbing" → tag saved to Drive JSON. Tags are app-internal and are not written back to Google Contacts.

### 8.7 Restart onboarding

Help tab → "Restart onboarding" → wizard runs from step 1. Data preserved; mappings can be updated.

### 8.8 Manual re-sync

Settings → "Sync calendar" → app re-fetches last 3 months of calendar events. Sync status timestamp updates. To refresh contact data from Google Contacts, use Settings → "Re-import contacts" (additive merge, no deletions).

## 9. Success metrics

Since this is free and open source with no telemetry, traditional product metrics aren't trackable. Qualitative signals:

- GitHub stars, forks, and active issues.
- User-reported weekly active use in community surveys.
- Reports of users rekindling specific lapsed friendships.
- Self-reported logged interaction counts.

## 10. Milestones (v1)

- **M1 — Foundation** ✅ — Google OAuth, bulk contact import, Drive appDataFolder storage.
- **M2 — All Contacts + Editing** ✅ — Full contact list and profile views, in-app editing synced to Drive.
- **M3 — Categories + Reconnect** ✅ — Category system, nudge thresholds, Reconnect tab with staleness indicators.
- **M4 — Interaction Logging** — Manual and bulk interaction logging, calendar write integration, interaction history timeline.
- **M5 — Calendar** — Google Calendar sync, matched attendee chips, unresolved-attendee resolver, write-back to Calendar events.
- **M6 — Map** — Geographic contact view with category-colored pins, drop-pin proximity search, Ask tab integration.
- **M7 — Ask** ✅ (partial) — LLM chat over contact metadata, inline contact cards. Remaining: chat persistence, map invocation from chat.
- **M8 — Help + Settings** — Full settings surface (color picker, calendar selection, sync status), onboarding restart, dashboard walkthrough.
- **M9 — Polish** — Accessibility (WCAG 2.1 AA), performance optimization, documentation, cross-browser testing.

See `.resources/TODO.md` for detailed task breakdown.

## 11. Open questions

1. **Unresolved-attendee threshold.** Below what confidence should the app not even show a `?` chip? A bad guess is worse than no guess.
2. **Close-friends onboarding UX.** No hard cap means a user could pick 100 close friends and then get buried in nudges. Should the app show a running counter with a soft warning ("You've picked 40 — that's a lot to keep up with")?
3. **Onboarding label mapping for users with many labels.** A user with 30 existing labels will face a long mapping screen. Offer a "Skip, I'll do this later in Settings" option?
4. **Calendar write permission denial.** If user denies the prompt, the fallback is Drive-only. Should the app re-prompt later (e.g. after 10 logged interactions), or leave it to the user to enable from Settings?
5. **Geocoding privacy.** Every location field sent to Nominatim is a data-out event. Document this in the privacy note, or offer an opt-out (at the cost of the Map tab being less populated)?

## 12. v2 todo list

Deferred from v1 for a later release:

- **Birthdays** — show upcoming birthdays in Reconnect's "Upcoming" section and inline on the Calendar tab. Source from the contact's profile (manually entered or imported), editable in-app.
- **Automatic calendar sync** — background re-fetch of Google Calendar on a configurable interval, replacing today's manual-only sync.
- **Additional import sources** — CSV import, iCloud Contacts, LinkedIn connections, or other services. Drive remains the source of truth; imported data is merged in.
- **Multi-device sync** — Drive already handles this for the primary JSON; v2 work would focus on live conflict resolution when the same Drive file is written from two browsers simultaneously.
- **Importance-ranking transparency** — hover/tooltip explaining why a contact is ranked highly (labels + co-attendance + logged interactions + completeness).
- **Push notifications** — web push for stale close-friend nudges, in addition to the opt-in email digest.
- **Undo / edit history** — audit trail for contact edits with the ability to revert.
- **Gmail / Messages auto-logging** — read-only scan of email and message threads to auto-populate the interaction log (with user review). Large privacy implications — gated behind explicit opt-in and documentation.
- **Native mobile app** — iOS + Android, sharing most logic with the web via a shared core.
- **Friends-of-friends discovery** — optional, opt-in social feature to see intros the user could make between their own contacts based on shared labels or co-attendance.
- **Group events tracking** — beyond single-contact interactions, track recurring groups (e.g. a D&D party, a book club) as first-class entities.
- **Offline mode / PWA** — service worker, cached contact data, queued Drive writes that sync when back online.

---

*Draft v0.5 prepared April 24, 2026.*
