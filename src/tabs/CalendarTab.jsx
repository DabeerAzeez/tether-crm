/* Tether — Calendar tab component. */

const { useState, useEffect, useMemo } = React;
const { Icons } = window.TetherConstants;
const { Avatar, Button, Card, SectionHeader, Modal } = window.TetherComponents;
const { useApp } = window.TetherContext;
const { useDrawer } = window.TetherDrawer;
const { getUnresolvedHints } = window.TetherSidebar;
const { importanceScore } = window.TetherHelpers;

function CalendarTab() {
  const { state, resolveEvent, dismissEvent } = useApp();
  const [pendingCollapsed, setPendingCollapsed] = useState(false);
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const blacklisted = (e) => {
    return (state.calendarKeywordBlacklist || []).some((kw) => e.title.toLowerCase().includes(kw.toLowerCase()));
  };
  const dismissed = (e) => state.dismissedEventIds?.includes(e.id);
  const visible = (e) => !blacklisted(e) && !dismissed(e);

  const now = new Date();

  const upcoming = [];
  const pending = [];
  const past = [];

  state.events.forEach((e) => {
    if (!visible(e)) return;
    const start = new Date(e.start);
    if (start >= now) {
      upcoming.push(e);
    } else {
      if (!e.synthetic && !state.resolvedEventIds?.includes(e.id)) {
        pending.push(e);
      } else {
        past.push(e);
      }
    }
  });

  upcoming.sort((a, b) => new Date(a.start) - new Date(b.start));
  pending.sort((a, b) => new Date(b.start) - new Date(a.start));
  past.sort((a, b) => new Date(b.start) - new Date(a.start));


  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl text-warm-900">Calendar</h1>
          <p className="text-warm-600 mt-1">Who have you been spending time with?</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setAddManualOpen(true)} icon={Icons.plus}>Add Past Event</Button>
        </div>
      </div>

      {state.contacts.length === 0 ? (
        <Card className="flex flex-col items-center justify-center min-h-[320px] text-center p-10 space-y-6">
          <div className="w-20 h-20 rounded-full bg-warm-100 flex items-center justify-center text-warm-400">
            <div className="scale-[2]">{Icons.calendar}</div>
          </div>
          <div className="max-w-md">
            <h2 className="font-serif text-2xl text-warm-900 mb-2">Connect your contacts first</h2>
            <p className="text-warm-700">
              To match calendar events with people in your life, you'll need to add some contacts first in the <strong>All Contacts</strong> tab.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/60 rounded-xl relative">
              <div
                className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-950/40 transition rounded-t-xl"
                onClick={() => setPendingCollapsed(!pendingCollapsed)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif text-lg text-amber-900 dark:text-amber-300 flex items-center gap-2">
                      <span className="scale-75 origin-left transform transition-transform" style={{ display: 'inline-block', rotate: pendingCollapsed ? '-90deg' : '0deg' }}>▼</span>
                      Pending Inbox ({pending.length})
                    </h2>
                    <div className="relative flex items-center">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowHelp(!showHelp); }}
                        onMouseEnter={() => setShowHelp(true)}
                        onMouseLeave={() => setShowHelp(false)}
                        className="text-amber-700 hover:text-amber-900 transition p-1 rounded-full hover:bg-amber-200/60"
                      >
                        {Icons.help}
                      </button>
                      {showHelp && (
                        <div className="absolute z-50 top-full left-0 mt-2 w-80 bg-white text-warm-900 text-sm rounded-xl p-4 shadow-xl border border-amber-200 cursor-default pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                          <p className="mb-3 text-warm-700">
                            Tether pulls all your calendar events to ensure nothing slips through the cracks. Use this inbox to verify who you actually met with and when.
                          </p>
                          <p className="mb-2 flex items-start gap-2 text-sage-800">
                            <span className="mt-1 shrink-0 text-sage-600">{Icons.check}</span>
                            <span><strong>Click Check (✓)</strong> to log a meetup to Tether and move it to your history. Make sure you've added all attendees who were there!</span>
                          </p>
                          <p className="flex items-start gap-2 text-red-800">
                            <span className="mt-1 shrink-0 text-red-600">{Icons.x}</span>
                            <span><strong>Click Dismiss (✕)</strong> to remove irrelevant events (like work blocks or chores where you didn't interact with anyone) from your archive.</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Review and curate your social history.</p>
                </div>
              </div>
              {!pendingCollapsed && (
                <div className="px-6 pb-6 space-y-2">
                  {pending.map((e) => <EventRow key={e.id} event={e} showActions={true} onResolve={() => resolveEvent(e.id)} onDismiss={() => dismissEvent(e.id)} />)}
                </div>
              )}
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <SectionHeader>Upcoming</SectionHeader>
              <div className="space-y-2">
                {upcoming.map((e) => <EventRow key={e.id} event={e} />)}
              </div>
            </section>
          )}

          <section>
            <SectionHeader>Past Events</SectionHeader>
            <div className="space-y-2">
              {past.map((e) => <EventRow key={e.id} event={e} />)}
              {past.length === 0 && <p className="text-sm text-warm-500 py-4 italic text-center">No past events found.</p>}
            </div>
          </section>
        </>
      )}

      <AddManualEventModal open={addManualOpen} onClose={() => setAddManualOpen(false)} />
    </div>
  );
}

function EventRow({ event, showActions, onResolve, onDismiss }) {
  const { state, resolveEventAttendee, dismissAttendee, removeGuestFromEvent } = useApp();
  const { open: openDrawer } = useDrawer();
  const { colorFor } = window.TetherHelpers;

  const [isResolving, setIsResolving] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const matchedContacts = useMemo(() =>
    (event.guestEmails || [])
      .map((em) => {
        const foundByEmail = state.contacts.find((c) => (c.email || '').toLowerCase() === em.toLowerCase());
        if (foundByEmail) return foundByEmail;
        const match = em.match(/^([^@]+)@contact\.local$/i);
        if (match) {
          return state.contacts.find((c) => c.id === match[1]);
        }
        return null;
      })
      .filter(Boolean),
    [event.guestEmails, state.contacts]
  );
  const unresolved = useMemo(() => getUnresolvedHints(event, state.contacts, state.dismissedAttendeeIds), [event, state.contacts, state.dismissedAttendeeIds]);
  const isInteractionLog = event.id.startsWith('log-');


  const handleRemoveGuest = (e, email) => {
    e.preventDefault();
    e.stopPropagation();
    removeGuestFromEvent(event.id, email);
  };

  const handleResolve = () => {
    if (unresolved.length > 0) return;
    setIsResolving(true);
    setIsLeaving(true);
    setTimeout(() => {
      onResolve();
    }, 500);
  };

  const handleDismiss = () => {
    setIsDismissing(true);
    setIsLeaving(true);
    setTimeout(() => {
      onDismiss();
    }, 500);
  };

  return (
    <div
      style={{
        maxHeight: isLeaving ? '0px' : '500px',
        opacity: isLeaving ? 0 : 1,
        paddingTop: isLeaving ? '0px' : '',
        paddingBottom: isLeaving ? '0px' : '',
        transform: isResolving
          ? 'scale(0.95) translateY(40px)'
          : isDismissing
            ? 'translate(300px, -300px) rotate(25deg) scale(0.6)'
            : 'none',
      }}
      className={`transition-all duration-500 ease-in-out relative ${isLeaving || isResolving || isDismissing ? 'overflow-hidden' : ''
        } ${isResolving
          ? 'ring-2 ring-sage-600 shadow-[0_0_15px_rgba(101,119,94,0.6)] rounded-xl'
          : ''
        }`}
    >
      <div
        style={{
          backgroundColor: isResolving
            ? 'rgba(34, 197, 94, 0.15)'
            : isDismissing
              ? 'rgba(239, 68, 68, 0.15)'
              : 'transparent'
        }}
        className="absolute inset-0 z-10 pointer-events-none transition-colors duration-500 rounded-2xl"
      />
      <Card className={`p-4 flex items-start gap-4 ${isInteractionLog ? 'bg-sage-50/50' : ''}`}>
        <div className="text-center w-14 shrink-0">
          <div className="text-xs text-warm-600 uppercase">{new Date(event.start).toLocaleDateString(undefined, { month: 'short' })}</div>
          <div className="text-2xl font-serif text-warm-900 leading-none">{new Date(event.start).getDate()}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-warm-900">{event.title}</span>
            {isInteractionLog && <span className="text-xs px-2 py-0.5 rounded-full bg-sage-100 text-sage-800 border border-sage-200">Tether log</span>}
          </div>
          <div className="text-xs text-warm-600 mt-0.5">{new Date(event.start).toLocaleDateString()} {event.location ? `· ${event.location}` : ''}</div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {matchedContacts.map((c) => (
              <button type="button" key={c.id} onClick={() => openDrawer(c.id)}
                onContextMenu={(e) => handleRemoveGuest(e, c.email || `${c.id}@contact.local`, c.name)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-warm-100 transition group relative"
                style={{ background: colorFor(c, state.customLabels) + '1a', border: `1px solid ${colorFor(c, state.customLabels)}33` }}>
                <Avatar contact={c} size={20} />
                <span className="text-xs font-medium" style={{ color: colorFor(c, state.customLabels) }}>{c.name}</span>
                <div
                  onClick={(e) => handleRemoveGuest(e, c.email || `${c.id}@contact.local`, c.name)}
                  className="absolute -top-1.5 -right-1.5 hidden group-hover:flex bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 text-[10px] items-center justify-center shadow-sm z-10"
                >×</div>
              </button>
            ))}
            {unresolved.map((u) => (
              <UnresolvedChip key={u.firstName} event={event} hint={u}
                onConfirm={(cId) => resolveEventAttendee(event.id, cId, u.firstName)}
                onDismiss={() => dismissAttendee(event.id, u.firstName)} />
            ))}
            <AddGuestButton event={event} />
            {matchedContacts.length === 0 && unresolved.length === 0 && (
              <span className="text-xs text-warm-500 italic">No attendees matched</span>
            )}
          </div>
        </div>
        {!isInteractionLog && event.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noreferrer"
            title="Open in Google Calendar"
            className="shrink-0 p-1.5 rounded-lg text-warm-400 hover:text-warm-700 hover:bg-warm-100 transition">
            {Icons.externalLink}
          </a>
        )}
        {showActions && (
          <div className="shrink-0 flex items-center gap-1.5 ml-2">
            <button
              disabled={unresolved.length > 0}
              onClick={handleResolve}
              title="Save to Tether & Move to Past Events"
              className={`p-2 rounded-lg transition border border-transparent ${unresolved.length > 0
                ? 'text-warm-400 opacity-40 cursor-not-allowed'
                : 'text-sage-600 hover:bg-green-100/60 hover:shadow-[0_0_10px_rgba(34,197,94,0.4)] hover:text-green-700 hover:border-green-300'
                }`}
            >
              {Icons.check}
            </button>
            <button
              onClick={handleDismiss}
              title="Ignore & Dismiss from Tether"
              className="p-2 rounded-lg text-warm-400 hover:text-red-700 hover:bg-red-100/60 hover:shadow-[0_0_10px_rgba(239,68,68,0.4)] hover:border-red-300 transition border border-transparent"
            >
              {Icons.x}
            </button>
          </div>
        )}


      </Card>
    </div>
  );
}

function AddGuestButton({ event }) {
  const { state, addGuestToEvent } = useApp();
  const ContactPickerModal = window.TetherTabs.ContactPickerModal;
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const suggestions = useMemo(() => {
    if (!search) return [];
    const confirmedEmails = new Set((event.guestEmails || []).map((e) => e.toLowerCase()));
    const q = search.toLowerCase();
    return state.contacts
      .filter((c) => !confirmedEmails.has((c.email || '').toLowerCase()) && !confirmedEmails.has(`${c.id}@contact.local`.toLowerCase()))
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => importanceScore(b) - importanceScore(a))
      .slice(0, 5);
  }, [search, event.guestEmails, state.contacts]);

  return (
    <div className="relative">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="Add guest"
        className="w-7 h-7 rounded-full bg-warm-100 hover:bg-warm-200 border border-warm-300 flex items-center justify-center text-warm-600 transition shrink-0">
        {Icons.plus}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute z-40 top-full left-0 mt-1 w-80 bg-surface rounded-xl shadow-xl border border-warm-200 p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-warm-700">Add contact to event</span>
              <button type="button" onClick={() => setOpen(false)} className="text-warm-500 hover:text-warm-700">{Icons.x}</button>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              autoFocus
              placeholder="Search by name..."
              className="w-full px-3 py-2 rounded-lg border border-warm-300 bg-warm-50 text-sm mb-2" />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {search && suggestions.length === 0 && <div className="text-xs text-warm-500 italic p-2">No matches</div>}
              {!search && <div className="text-xs text-warm-500 italic p-2 text-center">Type to search contacts</div>}
              {suggestions.map((c) => (
                <button type="button" key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { addGuestToEvent(event.id, c.id); setOpen(false); }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-warm-100 text-left">
                  <Avatar contact={c} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-warm-900 truncate">{c.name}</div>
                    <div className="text-xs text-warm-600 truncate">{c.email}</div>
                  </div>
                </button>
              ))}
              <div className="pt-2 mt-2 border-t border-warm-200">
                <button type="button" onClick={(e) => { e.preventDefault(); setOpen(false); setPickerOpen(true); }} className="w-full text-xs text-center font-medium text-sage-600 hover:text-sage-800 p-2 rounded hover:bg-sage-50 transition">See More</button>
              </div>
            </div>
          </div>
        </>
      )}
      {pickerOpen && (
        <ContactPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          eligibleContacts={state.contacts.filter(c => {
            const excluded = new Set((event.guestEmails || []).map(e => e.toLowerCase()));
            const syntheticEmail = `${c.id}@contact.local`.toLowerCase();
            const hasEmail = c.email && excluded.has(c.email.toLowerCase());
            const hasSynthetic = excluded.has(syntheticEmail);
            return !hasEmail && !hasSynthetic;
          })}
          onPick={(pickedContacts) => { pickedContacts.forEach(c => addGuestToEvent(event.id, c.id)); setPickerOpen(false); }}
        />
      )}
    </div>
  );
}

function UnresolvedChip({ event, hint, onConfirm, onDismiss }) {
  const { state } = useApp();
  const ContactPickerModal = window.TetherTabs.ContactPickerModal;
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState(hint.firstName);

  const suggestions = useMemo(() => {
    const confirmedEmails = new Set(event.guestEmails.map((e) => e.toLowerCase()));
    const confirmedContacts = state.contacts.filter((c) => c.email && confirmedEmails.has(c.email.toLowerCase()));
    const sharedLabels = new Set(confirmedContacts.flatMap((c) => c.crmLabels));

    const q = search.toLowerCase();
    return state.contacts
      .filter((c) => !confirmedEmails.has((c.email || '').toLowerCase()) && !confirmedEmails.has(`${c.id}@contact.local`.toLowerCase()))
      .map((c) => {
        let score = 0;
        if (c.name.toLowerCase().includes(q)) score += 50;
        if (c.name.toLowerCase().startsWith(q)) score += 30;
        c.crmLabels.forEach((l) => { if (sharedLabels.has(l)) score += 10; });
        score += importanceScore(c) * 0.3;
        return { c, score };
      })
      .filter((x) => x.score > 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.c);
  }, [search, event, state.contacts]);

  return (
    <div className="relative">
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-warm-100 hover:bg-warm-200 border border-dashed border-warm-400 text-xs text-warm-700">
          <span className="w-4 h-4 rounded-full bg-warm-300 flex items-center justify-center text-[10px] font-bold">?</span>
          <span>{hint.firstName}</span>
        </button>
      ) : (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full left-0 mt-1 w-80 bg-surface rounded-xl shadow-xl border border-warm-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-warm-700">Resolve "{hint.firstName}"</span>
              <button onClick={() => setOpen(false)} className="text-warm-500">{Icons.x}</button>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search any contact"
              className="w-full px-3 py-2 rounded-lg border border-warm-300 bg-warm-50 text-sm mb-2" />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {suggestions.length === 0 && <div className="text-xs text-warm-500 italic p-2">No matches</div>}
              {suggestions.map((c) => (
                <button key={c.id} onClick={() => { onConfirm(c.id); setOpen(false); }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-warm-100 text-left">
                  <Avatar contact={c} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-warm-900 truncate">{c.name}</div>
                    <div className="text-xs text-warm-600 truncate">{c.location?.city}{c.custom?.company ? ` · ${c.custom.company}` : ''}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="pt-2 mt-2 border-t border-warm-200 flex justify-between items-center gap-2">
              <button onClick={() => { setOpen(false); setPickerOpen(true); }} className="text-xs font-medium text-sage-600 hover:text-sage-800 px-2 transition">See More</button>
              <Button size="sm" variant="ghost" onClick={() => { onDismiss(); setOpen(false); }}>Dismiss</Button>
            </div>
          </div>
        </>
      )}
      {pickerOpen && (
        <ContactPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          eligibleContacts={state.contacts.filter(c => {
            const excluded = new Set((event.guestEmails || []).map(e => e.toLowerCase()));
            const syntheticEmail = `${c.id}@contact.local`.toLowerCase();
            const hasEmail = c.email && excluded.has(c.email.toLowerCase());
            const hasSynthetic = excluded.has(syntheticEmail);
            return !hasEmail && !hasSynthetic;
          })}
          onPick={(pickedContacts) => { pickedContacts.forEach(c => onConfirm(c.id)); setPickerOpen(false); }}
        />
      )}
    </div>
  );
}

function AddManualEventModal({ open, onClose }) {
  const { state, addManualEvent } = useApp();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState(new Set());

  useEffect(() => {
    if (open) {
      setTitle('');
      setDate(new Date().toISOString().slice(0, 10));
      setSearch('');
      setSelectedContactIds(new Set());
    }
  }, [open]);

  if (!open) return null;

  const q = search.toLowerCase();
  const suggestions = state.contacts
    .filter(c => !selectedContactIds.has(c.id))
    .filter(c => c.name.toLowerCase().includes(q))
    .sort((a, b) => importanceScore(b) - importanceScore(a))
    .slice(0, 5);

  const toggleContact = (id) => {
    setSelectedContactIds(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const submit = () => {
    if (title.trim() && date) {
      addManualEvent(title.trim(), date, Array.from(selectedContactIds));
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Past Event" size="md">
      <div className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-warm-900">Title</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface" placeholder="e.g. Dinner with Alice" />
        </div>
        <div>
          <label className="text-sm font-medium text-warm-900">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface" />
        </div>
        <div>
          <label className="text-sm font-medium text-warm-900">Attendees</label>
          {selectedContactIds.size > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 mb-3">
              {Array.from(selectedContactIds).map(id => {
                const c = state.contacts.find(x => x.id === id);
                if (!c) return null;
                return (
                  <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-warm-100 rounded-full border border-warm-200">
                    <Avatar contact={c} size={20} />
                    <span className="text-xs font-medium text-warm-900">{c.name}</span>
                    <button onClick={() => toggleContact(id)} className="text-warm-500 hover:text-warm-900 leading-none">×</button>
                  </div>
                );
              })}
            </div>
          )}
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface text-sm" placeholder="Search to add attendees..." />
          {search && (
            <div className="mt-1 border border-warm-200 rounded-lg divide-y divide-warm-100 bg-surface shadow-sm max-h-40 overflow-y-auto">
              {suggestions.length === 0 && <div className="p-2 text-xs text-warm-500 italic">No matches</div>}
              {suggestions.map((c) => (
                <button key={c.id} onClick={() => { toggleContact(c.id); setSearch(''); }} className="w-full flex items-center gap-2 p-2 hover:bg-warm-50 text-left">
                  <Avatar contact={c} size={24} />
                  <span className="text-sm text-warm-900">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-warm-200">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim() || !date}>Add Event</Button>
        </div>
      </div>
    </Modal>
  );
}

window.TetherTabs = window.TetherTabs || {};
window.TetherTabs.CalendarTab = CalendarTab;
