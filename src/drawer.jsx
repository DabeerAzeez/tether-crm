/* Tether — Contact Drawer and Log Interaction Modal.
   Exposes window.TetherDrawer for use by other modules. */

const { useState, useEffect, useMemo, useRef, createContext, useContext } = React;

const { Icons } = window.TetherConstants;
const { Avatar, Button, Card, LabelPill, Tag, LabelMenu, SectionHeader, Modal, LocationAutocomplete } = window.TetherComponents;
const { useApp } = window.TetherContext;
const { daysSince, formatDate, relativeDate, labelsFor, colorFor } = window.TetherHelpers;

// ───────────────────────────────────────────────────────────────────
// DRAWER CONTEXT
// ───────────────────────────────────────────────────────────────────

const DrawerCtx = createContext(null);
const useDrawer = () => useContext(DrawerCtx);

function DrawerProvider({ children }) {
  const [contactId, setContactId] = useState(null);
  const [logForId, setLogForId] = useState(null);
  const open = (id) => setContactId(id);
  const close = () => setContactId(null);
  const openLog = (id) => setLogForId(id);
  const closeLog = () => setLogForId(null);
  return (
    <DrawerCtx.Provider value={{ contactId, open, close, openLog, closeLog, logForId }}>
      {children}
      <ContactDrawer />
      <LogInteractionModal />
    </DrawerCtx.Provider>
  );
}

// ───────────────────────────────────────────────────────────────────
// CONTACT DRAWER
// ───────────────────────────────────────────────────────────────────

function ContactDrawer() {
  const { state, updateContact, deleteContactPermanently, addCrmLabelToContact, removeCrmLabelFromContact, addCustomLabel, allLabels } = useApp();
  const { contactId, close, openLog } = useDrawer();
  const contact = contactId ? state.contacts.find((c) => c.id === contactId) : null;
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncErrorMsg, setSyncErrorMsg] = useState('');
  const [showLabelMenu, setShowLabelMenu] = useState(false);

  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    if (contact) setDraft({ ...contact });
    setEdit(false);
    setSyncErrorMsg('');
  }, [contactId]);

  if (!contact || !draft) return null;

  const save = async () => {
    const patch = {
      name: draft.name, email: draft.email, phone: draft.phone,
      websites: draft.websites,
      notes: draft.notes, custom: draft.custom,
      nudgeFrequencyDays: draft.nudgeFrequencyDays,
      location: draft.location,
    };

    // Optimistically update local state first
    const updatedContacts = state.contacts.map((c) => c.id === contact.id ? { ...c, ...patch } : c);
    updateContact(contact.id, patch);
    setEdit(false);

    // Then persist the full array to Drive (single source of truth)
    if (!state.demoMode && window.TetherGoogle && window.TetherGoogle.hasToken()) {
      setSaving(true);
      try {
        await window.TetherGoogle.saveContacts(updatedContacts);
      } catch (e) {
        console.error('[Tether] Drive save failed:', e);
        setSyncErrorMsg(e?.message || 'Unknown error');
      } finally {
        setSaving(false);
      }
    }
  };

  const labs = labelsFor(contact, state.customLabels);
  const availableLabels = allLabels.filter((c) => !contact.crmLabels.includes(c.label));
  const nonCrmLabels = contact.googleLabels;

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end animate-fade-in" onClick={close}>
        <div className="absolute inset-0 bg-warm-900/40 drawer-backdrop" />
        <div className="relative w-full max-w-xl bg-warm-50 h-full overflow-y-auto shadow-2xl animate-slide-up flex flex-col" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-warm-200 bg-surface sticky top-0 z-10">
            <button onClick={close} className="p-2 text-warm-600 hover:bg-warm-100 rounded-full transition">{Icons.chevronLeft}</button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => updateContact(contact.id, { isFavorite: !contact.isFavorite })}
                className={`p-2 rounded-full transition ${contact.isFavorite ? 'text-amber-500' : 'text-warm-600 hover:bg-warm-100'}`}
                title={contact.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {contact.isFavorite ? Icons.starFilled : Icons.star}
              </button>
              {contact.isDeleted ? (
                <>
                  <button onClick={() => updateContact(contact.id, { isDeleted: false, deletedAt: null })} className="px-3 py-1.5 text-sm font-medium bg-sage-100 text-sage-700 hover:bg-sage-200 rounded-lg transition" title="Recover contact">Recover</button>
                  <button onClick={() => setConfirmAction('deletePermanently')} className="p-2 text-red-600 hover:bg-red-50 rounded-full transition" title="Delete permanently">{Icons.trash}</button>
                </>
              ) : (
                <>
                  <button className="p-2 text-warm-600 hover:bg-warm-100 rounded-full transition" onClick={() => setEdit(true)}>{Icons.pencil}</button>
                  <button onClick={() => setConfirmAction('trash')} className="p-2 text-warm-600 hover:bg-red-50 hover:text-red-600 rounded-full transition" title="Delete contact">{Icons.trash}</button>
                </>
              )}
            </div>
          </div>

          {/* Profile Section */}
          <div className="flex flex-col items-center pt-8 pb-6 px-6 relative bg-surface border-b border-warm-200">
            <Avatar contact={contact} size={160} ring />

            <div className="mt-4 w-full text-center">
              {edit ? (
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="font-serif text-4xl text-center w-full bg-transparent border-b border-warm-300 focus:border-sage-500 py-1" autoFocus />
              ) : (
                <h2 className="font-serif text-4xl text-warm-900">{contact.name}</h2>
              )}

            </div>

            <div className="mt-4 flex items-center justify-center gap-1.5 flex-wrap">
              {labs.map((l) => (
                <LabelPill key={l.key} label={l} />
              ))}
              <div className="relative ml-0.5">
                <button
                  onClick={() => setShowLabelMenu(!showLabelMenu)}
                  className={labs.length === 0
                    ? "px-2.5 py-1 rounded-full border border-warm-300 hover:bg-warm-100 text-warm-600 flex items-center gap-1.5 transition text-xs font-medium bg-surface shadow-sm"
                    : "w-6 h-6 rounded-full border border-warm-300 hover:bg-warm-100 text-warm-600 flex items-center justify-center transition"
                  }
                  title="Manage labels"
                >
                  <span className="scale-75">{labs.length === 0 ? Icons.plus : Icons.pencil}</span>
                  {labs.length === 0 && <span>Add labels</span>}
                </button>
                {showLabelMenu && (
                  <LabelMenu
                    contact={contact}
                    allLabels={allLabels}
                    onToggle={(lbl) => {
                      const norm = (l) => l.replace(/^CRM:\s*/i, '').trim().toLowerCase();
                      const n = norm(lbl);
                      const hasCrm = contact.crmLabels.some(l => norm(l) === n);
                      const hasGoogle = contact.googleLabels.some(l => norm(l) === n);

                      if (hasCrm || hasGoogle) {
                        const crm = contact.crmLabels.filter(l => norm(l) !== n);
                        const google = contact.googleLabels.filter(l => norm(l) !== n);
                        updateContact(contact.id, { crmLabels: crm, googleLabels: google });
                      } else {
                        updateContact(contact.id, { crmLabels: [...contact.crmLabels, lbl] });
                      }
                    }}
                    onCreate={(name) => {
                      addCustomLabel(name, '#a98458');
                      addCrmLabelToContact(contact.id, `CRM: ${name}`);
                    }}
                    onClose={() => setShowLabelMenu(false)}
                  />
                )}
              </div>
            </div>

          </div>


          <div className="p-6 space-y-6 flex-1 bg-warm-50">
            {/* Contact details */}
            <Card className="p-5">
              <SectionHeader>Contact details</SectionHeader>
              <div className="space-y-4 text-sm mt-4">
                {['email', 'phone'].map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-8 flex justify-center text-warm-400">{f === 'email' ? Icons.mail : Icons.phone}</div>
                    <div className="flex-1">
                      {edit ? (
                        <input value={draft[f] || ''} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg border border-warm-300 bg-surface" placeholder={`Add ${f}`} />
                      ) : (
                        <div className="text-warm-900">{contact[f] || `Add ${f}`}</div>
                      )}
                      <div className="text-[10px] text-warm-500 uppercase tracking-wider mt-0.5">{f === 'email' ? 'Home' : 'Mobile'}</div>
                    </div>
                  </div>
                ))}

                <div className="flex items-start gap-3">
                  <div className="w-8 flex justify-center text-warm-400 mt-1.5">{Icons.pin}</div>
                  <div className="flex-1">
                    {edit ? (
                      <LocationAutocomplete
                        value={draft.location}
                        onChange={(loc) => setDraft({ ...draft, location: loc })}
                      />
                    ) : (
                      <div className="text-warm-900 pt-1">
                        {contact.location?.city ? [contact.location.city, contact.location.country].filter(Boolean).join(', ') : 'Add location'}
                      </div>
                    )}
                    <div className="text-[10px] text-warm-500 uppercase tracking-wider mt-0.5">Address</div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader>Links</SectionHeader>
              <div className="space-y-4 text-sm mt-4">
                {(edit ? draft.websites || [] : contact.websites || []).map((site, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 flex justify-center text-warm-400">{Icons.externalLink}</div>
                    <div className="flex-1">
                      {edit ? (
                        <div className="flex gap-2">
                          <input value={site.url} onChange={(e) => { const newSites = [...(draft.websites || [])]; newSites[i].url = e.target.value; setDraft({ ...draft, websites: newSites }); }} className="flex-1 px-3 py-1.5 rounded-lg border border-warm-300 bg-surface min-w-0" placeholder="Website URL" />
                          <input value={site.label} onChange={(e) => { const newSites = [...(draft.websites || [])]; newSites[i].label = e.target.value; setDraft({ ...draft, websites: newSites }); }} className="w-24 px-3 py-1.5 rounded-lg border border-warm-300 bg-surface" placeholder="Label" />
                          <button onClick={() => { const newSites = (draft.websites || []).filter((_, idx) => idx !== i); setDraft({ ...draft, websites: newSites }); }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition scale-90" title="Remove Link">{Icons.trash}</button>
                        </div>
                      ) : (
                        <>
                          <div className="text-warm-900 truncate"><a href={site.url.startsWith('http') ? site.url : `https://${site.url}`} target="_blank" rel="noreferrer" className="hover:underline">{site.url}</a></div>
                          <div className="text-[10px] text-warm-500 uppercase tracking-wider mt-0.5">{site.label || 'Website'}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {edit && (
                  <button onClick={() => setDraft({ ...draft, websites: [...(draft.websites || []), { url: '', label: '' }] })} className="text-sm text-sage-600 hover:text-sage-700 flex items-center gap-1 mt-2">
                    <span className="scale-75">{Icons.plus}</span> Add Website
                  </button>
                )}
                {!edit && !(contact.websites?.length) && <div className="text-sm text-warm-500">No websites added.</div>}
              </div>
              <p className="text-xs text-warm-500 mt-4 italic">Tether stores links but does not scrape these services.</p>
            </Card>

            <Card className="p-5">
              <SectionHeader>Details & Notes</SectionHeader>
              <div className="space-y-4 text-sm mt-4">
                {['company', 'title', 'howWeMet'].map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-24 text-warm-600">{f === 'howWeMet' ? 'How we met' : f.charAt(0).toUpperCase() + f.slice(1)}</div>
                    {edit ? (
                      <input value={draft.custom?.[f] || ''} onChange={(e) => setDraft({ ...draft, custom: { ...draft.custom, [f]: e.target.value } })}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-warm-300 bg-surface" />
                    ) : <div className="flex-1 text-warm-900">{contact.custom?.[f] || '—'}</div>}
                  </div>
                ))}

                <div className="flex items-start gap-3">
                  <div className="w-24 text-warm-600">Skills</div>
                  <div className="flex-1 flex flex-wrap gap-1.5">
                    {(contact.skills || []).map((s) => <Tag key={s} label={s} />)}
                    {(!contact.skills || contact.skills.length === 0) && <span className="text-warm-500">—</span>}
                  </div>
                </div>

                <div className="pt-4 border-t border-warm-100">
                  <div className="text-warm-600 mb-2">Notes</div>
                  {edit ? (
                    <textarea value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                      rows={4} className="w-full p-3 rounded-lg border border-warm-300 bg-surface text-sm" />
                  ) : (
                    <div className="note text-sm text-warm-800 leading-relaxed whitespace-pre-wrap">{contact.notes || '—'}</div>
                  )}
                </div>

                <div className="pt-4 border-t border-warm-100 flex items-center gap-3 text-sm">
                  <span className="text-warm-600">Remind me every</span>
                  {edit ? (
                    <input type="number" min="0" value={draft.nudgeFrequencyDays || ''}
                      onChange={(e) => setDraft({ ...draft, nudgeFrequencyDays: e.target.value ? Number(e.target.value) : null })}
                      className="w-20 px-2 py-1.5 rounded-lg border border-warm-300 bg-surface" />
                  ) : <span className="font-medium text-warm-900">{contact.nudgeFrequencyDays || '—'}</span>}
                  <span className="text-warm-600">days</span>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader action={<Button size="sm" variant="ghost" icon={Icons.plus} onClick={() => openLog(contact.id)}>Add</Button>}>
                Recent interactions
              </SectionHeader>
              <div className="mt-4 space-y-4">
                {contact.interactions.length === 0 ? (
                  <p className="text-sm text-warm-500 italic">No interactions logged yet.</p>
                ) : (
                  <div className="relative pl-3 border-l-2 border-warm-200 space-y-6">
                    {contact.interactions.map((ix) => (
                      <div key={ix.id} className="relative">
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-sage-400 border-[3px] border-surface" />
                        <div className="text-xs text-warm-500 mb-1 flex justify-between">
                          <span>{formatDate(ix.date)}</span>
                          <span className="capitalize">{ix.type}</span>
                        </div>
                        {ix.note && <div className="text-sm text-warm-800 bg-warm-50 p-3 rounded-lg border border-warm-100">{ix.note}</div>}
                        {ix.location && <div className="text-xs text-warm-600 mt-1 flex items-center gap-1"><span className="scale-75 opacity-70">{Icons.pin}</span>{ix.location}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Edit mode footer actions */}
          {edit && (
            <div className="sticky bottom-0 p-4 bg-surface border-t border-warm-200 flex justify-end gap-3 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setDraft({ ...contact }); setEdit(false); }}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!syncErrorMsg} onClose={() => setSyncErrorMsg('')} title="Sync to Google failed" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-warm-700">
            Your changes were saved locally but couldn't be synced to Google Contacts.
          </p>
          {syncErrorMsg && (
            <p className="text-xs font-mono bg-warm-100 rounded-lg px-3 py-2 text-warm-800">{syncErrorMsg}</p>
          )}
          <p className="text-sm text-warm-700">
            Try signing out and back in to refresh your Google connection, then save again.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setSyncErrorMsg('')}>OK</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmAction} onClose={() => setConfirmAction(null)} title={confirmAction === 'trash' ? 'Move to trash?' : 'Permanently delete?'} size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-warm-700">
            {confirmAction === 'trash'
              ? 'This contact will be moved to the trash and deleted permanently after 30 days.'
              : 'This contact will be permanently deleted. This action cannot be undone.'}
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button size="sm" onClick={() => {
              if (confirmAction === 'trash') {
                updateContact(contact.id, { isDeleted: true, deletedAt: Date.now() });
              } else {
                deleteContactPermanently(contact.id);
              }
              setConfirmAction(null);
              close();
            }} className="bg-red-600 hover:bg-red-700 text-white border-transparent">
              {confirmAction === 'trash' ? 'Move to trash' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────
// LOG INTERACTION MODAL
// ───────────────────────────────────────────────────────────────────

function LogInteractionModal() {
  const { state, logInteraction, logInteractionMany, setState } = useApp();
  const { logForId, closeLog } = useDrawer();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState('hangout');
  const [note, setNote] = useState('');
  const [location, setLocation] = useState('');
  const [extraIds, setExtraIds] = useState([]); // bulk log
  const [bulkSearch, setBulkSearch] = useState('');
  const [calPrompt, setCalPrompt] = useState(false);

  useEffect(() => {
    if (logForId) {
      setDate(new Date().toISOString().slice(0, 10));
      setType('hangout');
      setNote('');
      setLocation('');
      setExtraIds([]);
      setBulkSearch('');
    }
  }, [logForId]);

  if (!logForId) return null;

  const mainContact = state.contacts.find((c) => c.id === logForId);
  const matches = bulkSearch
    ? state.contacts.filter((c) => c.id !== logForId && !extraIds.includes(c.id) && c.name.toLowerCase().includes(bulkSearch.toLowerCase())).slice(0, 5)
    : [];

  const submit = () => {
    const iso = new Date(date).toISOString();
    const ids = [logForId, ...extraIds];
    logInteractionMany(ids, { date: iso, type, note, location });
    // First-ever log: prompt for calendar write
    if (!state.calendarWriteEnabled && !localStorage.getItem('tether-cal-asked')) {
      localStorage.setItem('tether-cal-asked', '1');
      setCalPrompt(true);
    } else {
      closeLog();
    }
  };

  return (
    <Modal open={!!logForId} onClose={closeLog} title={`Add an interaction with ${mainContact?.name}`} size="md">
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-warm-600">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface" />
          </label>
          <label className="block">
            <span className="text-xs text-warm-600">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface">
              {['hangout', 'call', 'text', 'email', 'event', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-warm-600">Location (optional)</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface" placeholder="e.g. Blue Bottle, Hayes Valley" />
        </label>
        <label className="block">
          <span className="text-xs text-warm-600">Note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface" placeholder="What came up?" />
        </label>

        <div>
          <span className="text-xs text-warm-600">Also at this hangout? (bulk log)</span>
          <div className="mt-1 relative">
            <input value={bulkSearch} onChange={(e) => setBulkSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-warm-300 bg-surface" placeholder="Search contacts…" />
            {matches.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-surface rounded-lg shadow border border-warm-200">
                {matches.map((c) => (
                  <button key={c.id} onClick={() => { setExtraIds([...extraIds, c.id]); setBulkSearch(''); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-warm-100 text-left">
                    <Avatar contact={c} size={24} />
                    <span className="text-sm">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {extraIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {extraIds.map((id) => {
                const c = state.contacts.find((x) => x.id === id);
                return (
                  <Tag key={id} label={c.name} onRemove={() => setExtraIds(extraIds.filter((x) => x !== id))} />
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-warm-200">
          <Button variant="ghost" onClick={closeLog}>Cancel</Button>
          <Button onClick={submit}>Add interaction</Button>
        </div>
      </div>

      {calPrompt && (
        <div className="p-5 bg-sage-50 border-t border-sage-200 text-sm">
          <p className="font-medium text-warm-900 mb-1">Write interactions to Google Calendar?</p>
          <p className="text-warm-700 mb-3">We'll create a dedicated <strong>Personal CRM</strong> calendar and add this interaction — no guest invites, so nothing gets emailed to the contact.</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setCalPrompt(false); closeLog(); }}>Not now</Button>
            <Button size="sm" onClick={() => { setState((s) => ({ ...s, calendarWriteEnabled: true })); setCalPrompt(false); closeLog(); }}>Enable</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────
// Expose on window
// ───────────────────────────────────────────────────────────────────

window.TetherDrawer = {
  DrawerCtx,
  useDrawer,
  DrawerProvider,
};
