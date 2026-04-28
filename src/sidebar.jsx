/* Tether — Sidebar navigation.
   Exposes window.TetherSidebar for use by other modules. */

const { useMemo, useState } = React;

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
  const { state, setState, allLabels, updateContact, addCustomLabel,
    createThread, deleteThread, renameThread, setActiveThread, MAX_THREADS } = useApp();
  const setTab = (key) => setState((s) => ({ ...s, activeTab: key, activeLabelFilter: null }));
  const unresolvedCount = useUnresolvedCount();
  const staleCount = useStaleCloseCount();

  const isWalkthrough = state.phase === 'walkthrough';

  // Thread management state
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const threads = state.chatThreads || [];
  const askActive = state.activeTab === 'ask';

  const handleThreadClick = (threadId) => {
    setActiveThread(threadId);
    if (state.activeTab !== 'ask') setTab('ask');
  };

  const startRename = (t) => {
    setRenamingId(t.id);
    setRenameValue(t.name);
    setConfirmDeleteId(null);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameThread(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const handleNewThread = (e) => {
    e.stopPropagation();
    createThread();
    if (state.activeTab !== 'ask') setTab('ask');
  };

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
              <React.Fragment key={item.key}>
                <button onClick={() => setTab(item.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${active ? 'bg-warm-900 text-warm-50' : 'text-warm-700 hover:bg-warm-100'} ${isHighlight ? 'ring-4 ring-sage-400 ring-offset-2 ring-offset-warm-50' : ''}`}>
                  <span className={active ? 'text-warm-50' : 'text-warm-600'}>{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {badge != null && <span className={`text-xs px-2 py-0.5 rounded-full ${active ? 'bg-warm-50/20 text-warm-50' : 'bg-sage-500 text-warm-50'}`}>{badge}</span>}
                  {item.key === 'ask' && askActive && threads.length < MAX_THREADS && (
                    <button
                      onClick={handleNewThread}
                      className="w-5 h-5 flex items-center justify-center rounded-full bg-warm-50/20 hover:bg-warm-50/40 text-warm-50 text-xs leading-none transition"
                      title="New thread"
                    >+</button>
                  )}
                </button>

                {/* Thread sub-list under Ask */}
                {item.key === 'ask' && askActive && threads.length > 0 && (
                  <div className="space-y-0.5 mt-0.5">
                    {threads.map((t, i) => {
                      const isActive = t.id === (state.activeThreadId || threads[threads.length - 1]?.id);
                      const isLast = (i === threads.length - 1) && (threads.length >= MAX_THREADS);

                      if (renamingId === t.id) {
                        return (
                          <div key={t.id} className="w-full flex items-center gap-3 px-3 py-1.5 rounded-xl text-sm transition relative">
                            {/* Connector */}
                            <div className="w-5 h-5 relative shrink-0">
                              <div className={`absolute left-1/2 ${i === 0 ? '-top-[16px] h-[26px]' : '-top-[50px] h-[62px]'} w-[14px] border-l-2 border-b-2 border-warm-900 rounded-bl-lg -translate-x-[1px]`} />
                            </div>
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                                if (e.key === 'Escape') { setRenamingId(null); }
                              }}
                              onBlur={commitRename}
                              className="flex-1 px-2 py-1 rounded text-xs border border-warm-300 bg-surface focus:outline-none focus:border-sage-500 min-w-0"
                            />
                          </div>
                        );
                      }

                      return (
                        <button
                          key={t.id}
                          onClick={() => handleThreadClick(t.id)}
                          className={`w-full group flex items-center gap-3 px-3 py-1.5 rounded-xl text-sm transition relative ${isActive
                            ? 'bg-warm-200 text-warm-900 font-medium'
                            : 'text-warm-600 hover:bg-warm-100 hover:text-warm-800'
                            }`}
                          title={t.name}
                        >
                          {/* Connector */}
                          <div className="w-5 h-5 relative shrink-0">
                            <div className={`absolute left-1/2 ${i === 0 ? '-top-[16px] h-[26px]' : '-top-[50px] h-[62px]'} w-[14px] border-l-2 border-b-2 border-warm-900 rounded-bl-lg -translate-x-[1px] transition-colors`} />
                          </div>

                          <div className="flex-1 min-w-0 flex items-center justify-between">
                            <span className="truncate text-xs flex-1 text-left">{t.name || 'Untitled'}</span>

                            {/* Hover actions */}
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                              <div
                                onClick={(e) => { e.stopPropagation(); startRename(t); }}
                                className="w-5 h-5 flex items-center justify-center text-warm-500 hover:text-warm-800 rounded transition cursor-pointer"
                                title="Rename"
                              >{Icons.pencil}</div>
                              {confirmDeleteId === t.id ? (
                                <div
                                  onClick={(e) => { e.stopPropagation(); deleteThread(t.id); setConfirmDeleteId(null); }}
                                  className="w-5 h-5 flex items-center justify-center text-red-600 hover:text-red-800 rounded transition cursor-pointer"
                                  title="Confirm delete"
                                >{Icons.trash}</div>
                              ) : (
                                <div
                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(t.id); setRenamingId(null); }}
                                  className="w-5 h-5 flex items-center justify-center text-warm-400 hover:text-red-600 rounded transition text-base leading-none cursor-pointer"
                                  title="Delete thread"
                                >×</div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {threads.length < MAX_THREADS && (
                      <button
                        onClick={handleNewThread}
                        className="w-full group flex items-center gap-3 px-3 py-1.5 rounded-xl text-sm transition relative text-warm-500 hover:text-warm-700 hover:bg-warm-100"
                      >
                        {/* Connector for + New thread */}
                        <div className="w-5 h-5 relative shrink-0">
                          <div className={`absolute left-1/2 ${threads.length === 0 ? '-top-[16px] h-[26px]' : '-top-[50px] h-[62px]'} w-[14px] border-l-2 border-b-2 border-warm-900 rounded-bl-lg -translate-x-[1px] transition-colors`} />
                        </div>
                        <span className="truncate text-xs flex-1 text-left">+ New thread</span>
                      </button>
                    )}
                  </div>
                )}
              </React.Fragment>
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
