/* Tether — Sidebar navigation.
   Exposes window.TetherSidebar for use by other modules. */

const { useMemo } = React;

const { Icons, RESERVED_LABELS } = window.TetherConstants;
const { useApp } = window.TetherContext;
const { useDrawer } = window.TetherDrawer;
const { importanceScore } = window.TetherHelpers;

// ───────────────────────────────────────────────────────────────────
// Helper hooks
// ───────────────────────────────────────────────────────────────────

// Detect contacts hinted by event title/description but not on guest list.
function getUnresolvedHints(event, contacts, dismissed) {
  const text = `${event.title} ${event.description || ''}`;
  const hits = [];
  const alreadyEmails = new Set(event.guestEmails.map((e) => e.toLowerCase()));
  contacts.forEach((c) => {
    if (c.email && alreadyEmails.has(c.email.toLowerCase())) return;
    const first = c.name.split(/\s+/)[0];
    if (first.length < 3) return;
    const re = new RegExp(`\\b${first}\\b`, 'i');
    if (re.test(text)) {
      const key = `${event.id}:${first.toLowerCase()}`;
      if (!dismissed.includes(key)) hits.push({ contact: c, firstName: first });
    }
  });
  // Dedupe by firstName, prefer highest-ranked contact
  const byName = {};
  hits.forEach((h) => {
    if (!byName[h.firstName.toLowerCase()] || importanceScore(h.contact) > importanceScore(byName[h.firstName.toLowerCase()].contact)) {
      byName[h.firstName.toLowerCase()] = h;
    }
  });
  return Object.values(byName);
}

function useUnresolvedCount() {
  const { state } = useApp();
  return useMemo(() => state.events.filter((e) => getUnresolvedHints(e, state.contacts, state.dismissedAttendeeIds).length > 0).length, [state.events, state.contacts, state.dismissedAttendeeIds]);
}
function useStaleCloseCount() {
  const { state } = useApp();
  return useMemo(() => state.contacts.filter((c) =>
    c.crmLabels.includes('CRM: Close Friends') &&
    c.nudgeFrequencyDays != null &&
    c.lastContactedDaysAgo > c.nudgeFrequencyDays
  ).length, [state.contacts]);
}

// ───────────────────────────────────────────────────────────────────
// Navigation config
// ───────────────────────────────────────────────────────────────────

const NAV = [
  { key: 'contacts', label: 'All Contacts', icon: Icons.contacts },
  { key: 'reconnect', label: 'Reconnect', icon: Icons.reconnect },
  { key: 'ask', label: 'Ask', icon: Icons.ask },
  { key: 'map', label: 'Map', icon: Icons.map },
  { key: 'calendar', label: 'Calendar', icon: Icons.calendar },
];
const NAV_UTIL = [
  { key: 'trash', label: 'Trash', icon: Icons.trash },
  { key: 'help', label: 'Help', icon: Icons.help },
  { key: 'settings', label: 'Settings', icon: Icons.settings },
];

// ───────────────────────────────────────────────────────────────────
// SIDEBAR
// ───────────────────────────────────────────────────────────────────

function Sidebar() {
  const { state, setState, allLabels, updateContact, addCustomLabel } = useApp();
  const setTab = (key) => setState((s) => ({ ...s, activeTab: key, activeLabelFilter: null }));
  const unresolvedCount = useUnresolvedCount();
  const staleCount = useStaleCloseCount();

  const isWalkthrough = state.phase === 'walkthrough';

  return (
    <aside className={`w-60 shrink-0 border-r border-warm-200 bg-warm-50 flex flex-col ${isWalkthrough ? 'relative z-[60]' : ''}`}>
      <div className="p-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sage-600 flex items-center justify-center">
            <div className="text-warm-50">{Icons.logo}</div>
          </div>
          <span className="font-serif text-xl font-semibold text-warm-900">Tether</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4">
        <nav className="px-3 pt-2 space-y-1">
          {NAV.map((item) => {
            const active = state.activeTab === item.key && !state.activeLabelFilter;
            const badge = item.key === 'calendar' && unresolvedCount > 0 ? unresolvedCount
              : item.key === 'reconnect' && staleCount > 0 ? staleCount : null;
            const isHighlight = isWalkthrough && active;
            return (
              <button key={item.key} onClick={() => setTab(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${active ? 'bg-warm-900 text-warm-50' : 'text-warm-700 hover:bg-warm-100'} ${isHighlight ? 'ring-4 ring-sage-400 ring-offset-2 ring-offset-warm-50' : ''}`}>
                <span className={active ? 'text-warm-50' : 'text-warm-600'}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {badge != null && <span className={`text-xs px-2 py-0.5 rounded-full ${active ? 'bg-warm-50/20 text-warm-50' : 'bg-sage-500 text-warm-50'}`}>{badge}</span>}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="px-3 py-3 border-t border-warm-200 space-y-1 shrink-0">
        {NAV_UTIL.map((item) => {
          const active = state.activeTab === item.key;
          const isHighlight = isWalkthrough && active;

          return (
            <button key={item.key} onClick={() => setTab(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${active ? 'bg-warm-900 text-warm-50' : 'text-warm-700 hover:bg-warm-100'} ${isHighlight ? 'ring-4 ring-sage-400 ring-offset-2 ring-offset-warm-50' : ''}`}>
              <span className={active ? 'text-warm-50' : 'text-warm-600'}>{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ───────────────────────────────────────────────────────────────────
// Expose on window
// ───────────────────────────────────────────────────────────────────

window.TetherSidebar = {
  Sidebar,
  getUnresolvedHints,
  useUnresolvedCount,
  useStaleCloseCount,
};
