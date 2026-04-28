/* Tether — Tab components (Reconnect, AllContacts, Calendar, Map, Ask, Help, Settings).
   Exposes window.TetherTabs for use by other modules. */

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const { Icons, RESERVED_LABELS, RESERVED_CATEGORIES, MULTI_COLOR, STORAGE_KEY } = window.TetherConstants;
const { Avatar, Button, Card, LabelPill, Tag, SectionHeader, Modal } = window.TetherComponents;
const { useApp } = window.TetherContext;
const { useDrawer } = window.TetherDrawer;
const { getUnresolvedHints, useUnresolvedCount, useStaleCloseCount } = window.TetherSidebar;
const { defaultState } = window.TetherStorage;
const { daysSince, relativeDate, formatDate, formatShort, labelsFor, colorFor, importanceScore } = window.TetherHelpers;

// ───────────────────────────────────────────────────────────────────
// RECONNECT TAB
// ───────────────────────────────────────────────────────────────────

const nudgeDaysColor = (daysRemaining) => {
  if (daysRemaining == null) return 'transparent';
  const clamped = Math.max(-30, Math.min(30, daysRemaining));
  const hue = Math.round(((clamped + 30) / 60) * 120);
  return `hsl(${hue}, 65%, 48%)`;
};

function ReconnectTab() {
  const { state, setState } = useApp();
  const { open: openDrawer, openLog } = useDrawer();
  const [addOpen, setAddOpen] = useState(false);

  const catchUp = useMemo(() => {
    return state.contacts
      .filter((c) => c.nudgeFrequencyDays != null)
      .map((c) => {
        const daysAgo = c.lastContactedAt ? daysSince(c.lastContactedAt) : (c.lastContactedDaysAgo ?? Infinity);
        const noHistory = daysAgo === Infinity;
        const daysRemaining = noHistory ? null : c.nudgeFrequencyDays - daysAgo;
        return { ...c, _daysAgo: daysAgo, _daysRemaining: daysRemaining, _noHistory: noHistory };
      })
      .sort((a, b) => {
        if (a._noHistory !== b._noHistory) return a._noHistory ? -1 : 1;
        return (a._daysRemaining ?? Infinity) - (b._daysRemaining ?? Infinity);
      });
  }, [state.contacts]);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-warm-900">Reconnect</h1>
        <p className="text-warm-600 mt-1">Catch up with your contacts.</p>
      </div>

      {state.contacts.length === 0 ? (
        <Card className="flex flex-col items-center justify-center min-h-[320px] text-center p-10 space-y-6">
          <div className="w-20 h-20 rounded-full bg-warm-100 flex items-center justify-center text-warm-400">
            <div className="scale-[2]">{Icons.reconnect}</div>
          </div>
          <div className="max-w-md">
            <h2 className="font-serif text-2xl text-warm-900 mb-2">Nobody to reconnect with</h2>
            <p className="text-warm-700">
              Add contacts you want to stay in touch with in the <strong>All Contacts</strong> tab first. Once you set a nudge frequency, they'll appear here.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <section>
            <div className="flex items-end justify-between gap-3 mb-3">
              <div>
                <h2 className="font-serif text-xl text-warm-900">Catch Up</h2>
                <p className="text-sm text-warm-600 mt-0.5">
                  {catchUp.length === 0
                    ? 'Add contacts you want to stay in touch with.'
                    : `${catchUp.length} ${catchUp.length === 1 ? 'contact' : 'contacts'} — sorted by urgency`}
                </p>
              </div>
              <Button size="sm" onClick={() => setAddOpen(true)}>+ Add contacts</Button>
            </div>

            {catchUp.length === 0 ? (
              <Card className="flex flex-col items-center justify-center min-h-[288px] text-center p-8">
                <p className="text-warm-700 mb-4">Your catch up list is empty. Add contacts — or a whole group of them — and set how often you want to be nudged.</p>
                <Button onClick={() => setAddOpen(true)}>+ Add contacts</Button>
              </Card>
            ) : (
              <div className="grid gap-2">
                {catchUp.map((c) => {
                  const overdue = !c._noHistory && c._daysRemaining < 0;
                  const errorState = c._noHistory;
                  const labs = labelsFor(c, state.customLabels);
                  const googleLabels = c.googleLabels.filter((l) => !l.startsWith('CRM:'));
                  const barColor = errorState ? 'hsl(0, 65%, 48%)' : nudgeDaysColor(c._daysRemaining);

                  const lastContactedText = errorState
                    ? 'No interactions logged yet'
                    : `Last contacted ${relativeDate(c.lastContactedAt)}`;

                  let statusText;
                  if (errorState) {
                    statusText = `No recent interactions (nudge every ${c.nudgeFrequencyDays} days)`;
                  } else if (overdue) {
                    statusText = `${Math.abs(Math.round(c._daysRemaining))} days overdue (nudge every ${c.nudgeFrequencyDays} days)`;
                  } else {
                    statusText = `${Math.round(c._daysRemaining)} days until nudge (nudge every ${c.nudgeFrequencyDays} days)`;
                  }

                  const emphasized = overdue || errorState;

                  return (
                    <Card
                      key={c.id}
                      className="group flex items-stretch overflow-hidden hover:shadow-md transition cursor-pointer"
                    >
                      <div style={{ width: 5, background: barColor, flexShrink: 0 }} />
                      <div className="p-4 flex items-center gap-4 flex-1 min-w-0 relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setState((s) => ({
                              ...s,
                              contacts: s.contacts.map((x) => x.id === c.id ? { ...x, nudgeFrequencyDays: null } : x),
                            }));
                          }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-warm-200 hover:bg-warm-300 text-warm-600 hover:text-warm-900 text-xs leading-none"
                          title="Remove from catch up"
                        >×</button>
                        <div onClick={() => openDrawer(c.id)} className="flex items-center gap-4 flex-1 min-w-0">
                          <Avatar contact={c} size={44} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`truncate ${emphasized ? 'font-bold text-warm-900' : 'font-medium text-warm-900'}`}>{c.name}</span>
                              {labs.map((x) => <LabelPill key={x.key} label={x} />)}
                              {googleLabels.map((l) => <Tag key={l} label={l} />)}
                            </div>
                            <div className="text-xs text-warm-600 mt-0.5">
                              {lastContactedText}
                              {c.location?.city && ` · ${c.location.city}`}
                            </div>
                            <div className={`text-xs font-medium mt-0.5 ${errorState ? 'text-red-700' : overdue ? 'text-amber-700' : 'text-warm-500'}`}>
                              {statusText}
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => openLog(c.id)}>Add an interaction</Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <AddToCatchUpModal open={addOpen} onClose={() => setAddOpen(false)} />
        </>
      )}
    </div>
  );
}

function AddToCatchUpModal({ open, onClose }) {
  const { state, setState } = useApp();
  const [search, setSearch] = useState('');
  const [filterLabel, setFilterLabel] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [nudgeDays, setNudgeDays] = useState(30);

  useEffect(() => {
    if (open) {
      setSearch('');
      setFilterLabel(null);
      setSelected(new Set());
      setNudgeDays(30);
    }
  }, [open]);

  if (!open) return null;

  const eligible = state.contacts.filter((c) => c.nudgeFrequencyDays == null);

  const labelCounts = {};
  eligible.forEach((c) => {
    c.googleLabels.filter((l) => !l.startsWith('CRM:')).forEach((l) => { labelCounts[l] = (labelCounts[l] || 0) + 1; });
    c.crmLabels.forEach((l) => { labelCounts[l] = (labelCounts[l] || 0) + 1; });
  });
  const allLabelsList = Object.keys(labelCounts).sort((a, b) => labelCounts[b] - labelCounts[a]);

  const visible = eligible.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterLabel) {
      const has = c.googleLabels.includes(filterLabel) || c.crmLabels.includes(filterLabel);
      if (!has) return false;
    }
    return true;
  });

  const toggleContact = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAllVisible = () => setSelected(new Set(visible.map((c) => c.id)));
  const clearSelection = () => setSelected(new Set());

  const apply = () => {
    const ids = Array.from(selected);
    const days = Number(nudgeDays);
    if (ids.length === 0 || !days || days < 1) return;
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) => ids.includes(c.id) ? { ...c, nudgeFrequencyDays: days } : c),
    }));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add to Catch Up" size="lg">
      <div className="p-6 space-y-4">
        <div className="flex gap-3 items-end flex-wrap">
          <label className="flex-1 min-w-[200px]">
            <span className="text-xs text-warm-600">Search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface" />
          </label>
          <label>
            <span className="text-xs text-warm-600">Nudge every</span>
            <div className="mt-1 flex items-center gap-2">
              <input type="number" min="1" value={nudgeDays}
                onChange={(e) => setNudgeDays(e.target.value)}
                className="w-20 px-3 py-2 rounded-lg border border-warm-300 bg-surface" />
              <span className="text-sm text-warm-600">days</span>
            </div>
          </label>
        </div>

        {allLabelsList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-warm-600 mr-1">Filter by label:</span>
            <button onClick={() => setFilterLabel(null)}
              className={`text-xs px-2 py-1 rounded-full transition ${filterLabel == null ? 'bg-sage-600 text-white' : 'bg-warm-100 text-warm-700 hover:bg-warm-200'}`}>
              All
            </button>
            {allLabelsList.map((l) => (
              <button key={l} onClick={() => setFilterLabel(filterLabel === l ? null : l)}
                className={`text-xs px-2 py-1 rounded-full transition ${filterLabel === l ? 'bg-sage-600 text-white' : 'bg-warm-100 text-warm-700 hover:bg-warm-200'}`}>
                {l.replace(/^CRM:\s*/, '')} <span className="opacity-60">· {labelCounts[l]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-warm-600">
          <span>{visible.length} matching · {selected.size} selected</span>
          <div className="flex gap-3">
            <button onClick={selectAllVisible} className="underline hover:text-warm-900" disabled={visible.length === 0}>Select all visible</button>
            {selected.size > 0 && <button onClick={clearSelection} className="underline hover:text-warm-900">Clear</button>}
          </div>
        </div>

        <div className="max-h-[40vh] overflow-y-auto border border-warm-200 rounded-lg divide-y divide-warm-100 bg-surface">
          {visible.length === 0 && <div className="p-4 text-sm text-warm-600 italic">No contacts match.</div>}
          {visible.map((c) => {
            const isSelected = selected.has(c.id);
            const googleLabels = c.googleLabels.filter((l) => !l.startsWith('CRM:'));
            return (
              <button key={c.id} onClick={() => toggleContact(c.id)}
                className={`w-full flex items-center gap-3 p-3 text-left transition ${isSelected ? 'bg-sage-50' : 'hover:bg-warm-50'}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-sage-500 border-sage-500' : 'border-warm-300'}`}>
                  {isSelected && <div className="text-white scale-75">{Icons.check}</div>}
                </div>
                <Avatar contact={c} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-warm-900 truncate">{c.name}</div>
                  <div className="text-xs text-warm-600 truncate">
                    {googleLabels.slice(0, 4).join(', ')}
                    {c.location?.city && `${googleLabels.length ? ' · ' : ''}${c.location.city}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-warm-200">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={apply} disabled={selected.size === 0 || !nudgeDays || nudgeDays < 1}>
            Add {selected.size > 0 ? `${selected.size} ` : ''}{selected.size === 1 ? 'contact' : 'contacts'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────
// ALL CONTACTS TAB
// ───────────────────────────────────────────────────────────────────

function EditLabelsModal({ open, onClose }) {
  const { allLabels, renameLabel, deleteLabel, addCustomLabel } = useApp();
  const [deleting, setDeleting] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState('');

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Manage Labels" size="md">
      <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
        <div className="mb-2">
          {adding ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); e.stopPropagation();
                    if (addName.trim()) {
                      addCustomLabel(addName.trim(), '#a98458');
                      setAddName('');
                      setAdding(false);
                    }
                  } else if (e.key === 'Escape') setAdding(false);
                }}
                className="flex-1 px-3 py-2 rounded-lg border border-warm-300 bg-warm-50 text-sm focus:outline-none focus:border-sage-500"
                placeholder="New label name"
              />
              <Button size="sm" onClick={() => {
                if (addName.trim()) {
                  addCustomLabel(addName.trim(), '#a98458');
                  setAddName('');
                  setAdding(false);
                }
              }}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-warm-300 rounded-xl text-warm-600 hover:text-warm-900 hover:border-warm-400 hover:bg-warm-50 transition text-sm font-medium"
            >
              <span className="scale-75">{Icons.plus}</span> Create new label
            </button>
          )}
        </div>
        {allLabels.map((l) => (
          <div key={l.key} className="flex flex-col gap-2 p-3 border border-warm-200 rounded-xl bg-surface">
            <div className="flex items-center justify-between gap-3">
              {editing === l.key ? (
                <div className="flex-1 flex gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault(); e.stopPropagation();
                        if (editName.trim()) renameLabel(l.label, editName.trim());
                        setEditing(null);
                      } else if (e.key === 'Escape') setEditing(null);
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-warm-300 bg-warm-50 text-sm focus:outline-none focus:border-sage-500"
                  />
                  <Button size="sm" onClick={() => { if (editName.trim()) renameLabel(l.label, editName.trim()); setEditing(null); }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              ) : (
                <>
                  <div className="font-medium text-warm-900 truncate flex-1">{l.label.replace(/^CRM:\s*/, '')}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditing(l.key); setEditName(l.label.replace(/^CRM:\s*/, '')); setDeleting(null); }} className="p-2 text-warm-600 hover:bg-warm-100 rounded-full transition" title="Edit name">{Icons.pencil}</button>
                    <button onClick={() => { setDeleting(l.key); setEditing(null); }} className="p-2 text-red-600 hover:bg-red-50 rounded-full transition" title="Delete label">{Icons.trash}</button>
                  </div>
                </>
              )}
            </div>

            {deleting === l.key && (
              <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-sm mt-2">
                <p className="text-red-900 mb-3">Delete this label?</p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => { deleteLabel(l.label, false); setDeleting(null); }} className="text-left px-3 py-2 bg-white rounded border border-red-200 hover:bg-red-100 text-red-700 transition">
                    <strong>Keep all contacts</strong> and delete this label
                  </button>
                  <button onClick={() => { deleteLabel(l.label, true); setDeleting(null); }} className="text-left px-3 py-2 bg-white rounded border border-red-200 hover:bg-red-100 text-red-700 transition">
                    <strong>Delete all contacts</strong> and delete this label
                  </button>
                  <button onClick={() => setDeleting(null)} className="text-left px-3 py-2 bg-transparent text-warm-600 hover:bg-warm-100 transition mt-1 rounded">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {allLabels.length === 0 && (
          <p className="text-sm text-warm-500 text-center italic">No labels yet.</p>
        )}
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose }) {
  const { setState } = useApp();

  const handleGoogleImport = () => {
    setState((s) => ({ ...s, phase: 'syncing', isImporting: true }));
    onClose();
  };

  const options = [
    { id: 'google', label: 'Google Contacts', icon: Icons.google, enabled: true, onClick: handleGoogleImport },
    { id: 'csv', label: 'CSV File', icon: Icons.externalLink, enabled: false },
    { id: 'vcard', label: 'vCard File', icon: Icons.externalLink, enabled: false },
    { id: 'icloud', label: 'iCloud Account', icon: Icons.externalLink, enabled: false },
    { id: 'sim', label: 'Phone SIM', icon: Icons.externalLink, enabled: false },
  ];

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Import Contacts" size="sm">
      <div className="p-6 space-y-4">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={opt.enabled ? opt.onClick : null}
            disabled={!opt.enabled}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ${opt.enabled
              ? 'border-warm-300 hover:bg-warm-100 bg-surface'
              : 'border-warm-100 bg-warm-50 opacity-50 cursor-not-allowed'
              }`}
          >
            <span className={opt.enabled ? 'text-warm-600' : 'text-warm-400'}>{opt.icon}</span>
            <span className="flex-1 text-sm font-medium text-warm-900">{opt.label}</span>
            {!opt.enabled && <span className="text-xs text-warm-500 uppercase tracking-wider">Soon</span>}
          </button>
        ))}
        <div className="pt-2 flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function AllContactsTab() {
  const { state, setState, allLabels } = useApp();
  const { open: openDrawer } = useDrawer();
  const [sort, setSort] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [editLabelsOpen, setEditLabelsOpen] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiResults, setAiResults] = useState(null);
  const [aiReason, setAiReason] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const isTrashMode = state.activeTab === 'trash';

  const exitAiMode = () => {
    setAiMode(false);
    setAiResults(null);
    setAiReason('');
    setQuery('');
    setClearConfirm(false);
  };

  const searchWithAI = async () => {
    if (!query.trim() || aiLoading) return;
    setAiLoading(true);
    setClearConfirm(false);
    try {
      const contactsList = state.contacts.filter((c) => !c.isDeleted).map((c) => {
        const parts = [c.name];
        if (c.location?.city) parts.push(`(${c.location.city})`);
        const labels = [...(c.googleLabels || []), ...(c.crmLabels || [])].map((l) => l.replace(/^CRM:\s*/i, '')).join(', ');
        if (labels) parts.push(`[${labels}]`);
        if ((c.skills || []).length) parts.push(`skills: ${c.skills.join(', ')}`);
        if (c.notes) parts.push(`notes: ${c.notes.slice(0, 80)}`);
        return parts.join(' ');
      }).join('\n');

      const systemPrompt = `You are a personal CRM search assistant. The user has these contacts:\n\n${contactsList}\n\nRespond in EXACTLY this format and nothing else:\nREASON: <one sentence explaining what you found>\nMATCHES: <comma-separated exact contact names, or "none">`;

      const text = await callLLM(state.llm, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ], { options: { num_predict: 200 } });

      const reasonMatch = text.match(/REASON:\s*(.+?)(?=\nMATCHES:|$)/is);
      const matchesMatch = text.match(/MATCHES:\s*(.+)$/is);
      const reason = reasonMatch?.[1]?.trim() || 'AI search complete.';
      const matchesRaw = matchesMatch?.[1]?.trim() || '';
      const matchedNames = matchesRaw.toLowerCase() === 'none' ? [] : matchesRaw.split(',').map((n) => n.trim()).filter(Boolean);

      const activeContacts = state.contacts.filter((c) => !c.isDeleted);
      const matchedIds = activeContacts
        .filter((c) => matchedNames.some((n) => {
          const cn = c.name.toLowerCase();
          const sn = n.toLowerCase();
          return cn === sn || cn.includes(sn) || sn.includes(cn.split(' ')[0]);
        }))
        .map((c) => c.id);

      setAiReason(reason);
      setAiResults(matchedIds);
      setAiMode(true);
    } catch (e) {
      setAiReason(`Search failed: ${e.message}`);
      setAiResults([]);
      setAiMode(true);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSort = (key) => {
    if (sort === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setSortDir('asc'); }
  };

  const sortArrow = (col) => {
    if (sort !== col) return <span className="ml-1 opacity-30 text-xs">↕</span>;
    return <span className="ml-1 text-xs text-sage-600">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const rows = useMemo(() => {
    let r = isTrashMode
      ? state.contacts.filter(c => c.isDeleted)
      : state.contacts.filter(c => !c.isDeleted);
    if (aiMode && aiResults !== null) {
      r = r.filter((c) => aiResults.includes(c.id));
    } else if (query) {
      const q = query.toLowerCase();
      r = r.filter((c) => c.name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.location?.city || '').toLowerCase().includes(q) ||
        (c.skills || []).join(' ').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q) ||
        c.crmLabels.join(' ').toLowerCase().includes(q) ||
        c.googleLabels.join(' ').toLowerCase().includes(q));
    }
    if (filter) {
      r = r.filter((c) => {
        const match = allLabels.find((lab) => lab.key === filter);
        return match && c.crmLabels.includes(match.label);
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sort === 'importance') r.sort((a, b) => (importanceScore(b) - importanceScore(a)) || a.name.localeCompare(b.name));
    if (sort === 'name') r.sort((a, b) => a.name.localeCompare(b.name) * dir);
    if (sort === 'location') r.sort((a, b) => {
      const getLoc = (c) => (c.location ? `${c.location.city || ''}, ${c.location.country || ''}` : '').trim().toLowerCase();
      const valA = getLoc(a);
      const valB = getLoc(b);

      if (valA === valB) return a.name.localeCompare(b.name) * dir;
      if (valA === '') return 1;  // Empty always at bottom
      if (valB === '') return -1;

      return valA.localeCompare(valB) * dir;
    });
    if (sort === 'lastContacted') r.sort((a, b) => {
      const valA = daysSince(a.lastContactedAt);
      const valB = daysSince(b.lastContactedAt);
      if (valA === valB) return a.name.localeCompare(b.name) * dir;
      return (valA - valB) * dir;
    });
    if (sort === 'label') r.sort((a, b) => {
      const getLab = (c) => {
        const labs = labelsFor(c, state.customLabels);
        return labs.length > 0 ? labs[0].label.replace(/^CRM:\s*/i, '').toLowerCase() : '';
      };
      const labA = getLab(a);
      const labB = getLab(b);

      if (labA === labB) return a.name.localeCompare(b.name) * dir;
      if (labA === '') return 1;  // Empty always at bottom
      if (labB === '') return -1;

      return labA.localeCompare(labB) * dir;
    });
    return r;
  }, [state.contacts, sort, sortDir, filter, query, allLabels, aiMode, aiResults]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-warm-900">{isTrashMode ? 'Trash' : 'All Contacts'}</h1>
          <p className="text-warm-600 mt-1">
            {rows.length} contact{rows.length === 1 ? '' : 's'} {isTrashMode ? 'in trash.' : 'in total.'}
            {isTrashMode && ' Items will be deleted permanently after 30 days.'}
          </p>
        </div>
        {!isTrashMode && state.contacts.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} icon={Icons.plus}>Import</Button>
        )}
      </div>

      {state.contacts.length === 0 ? (
        <Card className="flex flex-col items-center justify-center min-h-[320px] text-center p-10 space-y-6">
          <div className="w-20 h-20 rounded-full bg-warm-100 flex items-center justify-center text-warm-400">
            <div className="scale-[2]">{Icons.contacts}</div>
          </div>
          <div className="max-w-md">
            <h2 className="font-serif text-2xl text-warm-900 mb-2">No contacts yet</h2>
            <p className="text-warm-700">
              Import your contacts to start staying tethered to the people who matter. You can sync from Google or upload files.
            </p>
          </div>
          <Button size="lg" onClick={() => setImportOpen(true)} icon={Icons.plus}>Import contacts</Button>
        </Card>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-500">{Icons.search}</span>
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); if (aiMode) { setAiMode(false); setAiResults(null); } setClearConfirm(false); }}
                  placeholder='Search name, city, skill, note, or ask a question with "AI Search" …'
                  className={`pl-9 py-2 rounded-lg border bg-surface w-full transition-colors ${aiMode ? 'border-violet-400 pr-8' : 'border-warm-300 pr-3'}`}
                />
                {aiMode && (
                  <button
                    onClick={() => clearConfirm ? exitAiMode() : setClearConfirm(true)}
                    title="Clear AI search"
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${clearConfirm ? 'bg-red-500 text-white' : 'text-warm-400 hover:text-warm-700'}`}
                  >×</button>
                )}
              </div>
              {!isTrashMode && (
                <button
                  onClick={searchWithAI}
                  disabled={!state.llm?.connected || !query.trim() || aiLoading}
                  title={!state.llm?.connected ? 'Configure an AI model in Settings to use this feature' : undefined}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    aiMode
                      ? 'bg-violet-600 hover:bg-violet-700 border-violet-600 text-white'
                      : 'bg-surface border-warm-300 text-warm-700 hover:bg-warm-50'
                  }`}
                >
                  {aiLoading
                    ? <span className="flex items-center gap-2"><span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />Searching…</span>
                    : '✦ AI Search'}
                </button>
              )}
            </div>
            {clearConfirm && (
              <p className="text-xs text-amber-700 pl-1">
                AI results will not be saved. <button onClick={exitAiMode} className="underline font-medium">Clear anyway</button> · <button onClick={() => setClearConfirm(false)} className="underline">Cancel</button>
              </p>
            )}
            {aiLoading && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-sm text-violet-600">
                <span className="inline-block w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span>Asking AI…</span>
              </div>
            )}
            {aiMode && !aiLoading && !clearConfirm && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-sm text-violet-800">
                <span className="mt-0.5 shrink-0">✦</span>
                <span className="flex-1">{aiReason}</span>
              </div>
            )}
          </div>

          {allLabels.length > 0 && !isTrashMode && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-warm-600 mr-1">Filter by label:</span>
              <button
                onClick={() => setFilter(null)}
                className={`text-xs px-3 py-1.5 rounded-full transition ${filter == null || filter === ''
                  ? 'bg-sage-600 text-white shadow-sm'
                  : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                  }`}
              >
                All
              </button>
              {allLabels.map((l) => {
                const count = state.contacts.filter(
                  (c) =>
                    !c.isDeleted &&
                    (c.crmLabels.some((lbl) => lbl.toLowerCase().includes(l.label.replace(/^CRM:\s*/i, '').trim().toLowerCase())) ||
                      c.googleLabels.some((lbl) => lbl.toLowerCase().includes(l.label.replace(/^CRM:\s*/i, '').trim().toLowerCase())))
                ).length;
                return (
                  <button
                    key={l.key}
                    onClick={() => setFilter(filter === l.key ? null : l.key)}
                    className={`text-xs px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${filter === l.key ? 'bg-sage-600 text-white shadow-sm' : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                      }`}
                  >
                    {l.label.replace(/^CRM:\s*/, '')} <span className="opacity-60 font-mono text-[10px]">{count}</span>
                  </button>
                );
              })}
              <button
                onClick={() => setEditLabelsOpen(true)}
                className="ml-2 px-3 py-1.5 rounded-full flex items-center justify-center border border-warm-300 bg-surface text-warm-600 hover:bg-warm-50 hover:text-warm-900 transition shadow-sm text-xs gap-1.5"
                title="Edit labels"
              >
                <span className="scale-[0.8]">{Icons.pencil}</span> Edit labels
              </button>
            </div>
          )}

          <Card className="overflow-hidden">
            <table className="w-full border-collapse bg-surface">
              <thead className="bg-surface text-xs text-warm-700 border-b border-warm-200">
                <tr>
                  <th className="text-left py-4 px-4 font-normal cursor-pointer hover:bg-warm-50 select-none" onClick={() => handleSort('name')}>
                    Name{sortArrow('name')}
                  </th>
                  <th className="text-left py-4 px-4 hidden md:table-cell font-normal cursor-pointer hover:bg-warm-50 select-none" onClick={() => handleSort('label')}>
                    Label{sortArrow('label')}
                  </th>
                  <th className="text-left py-4 px-4 hidden lg:table-cell font-normal cursor-pointer hover:bg-warm-50 select-none" onClick={() => handleSort('location')}>
                    Location{sortArrow('location')}
                  </th>
                  <th className="text-left py-4 px-4 hidden md:table-cell font-normal cursor-pointer hover:bg-warm-50 select-none" onClick={() => handleSort('lastContacted')}>
                    Last contacted{sortArrow('lastContacted')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const favorites = rows.filter((c) => c.isFavorite);
                  const others = rows.filter((c) => !c.isFavorite);

                  const renderRow = (c) => {
                    const labs = labelsFor(c, state.customLabels);
                    const multi = labs.length > 1;
                    return (
                      <tr key={c.id} onClick={() => openDrawer(c.id)} className="border-b border-warm-100 hover:bg-warm-50 cursor-pointer">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Avatar contact={c} size={36} />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-warm-900">{c.name}</div>
                              <div className="text-xs text-warm-600">{c.email || c.phone || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {labs.map((x) => (
                              <LabelPill key={x.key} label={x} />
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell text-sm text-warm-700">{c.location ? `${c.location.city}, ${c.location.country}` : '—'}</td>
                        <td className="py-3 px-4 hidden md:table-cell text-sm text-warm-700">{relativeDate(c.lastContactedAt)}</td>
                      </tr>
                    );
                  };

                  return (
                    <>
                      {favorites.length > 0 && (
                        <>
                          <tr>
                            <td colSpan={4} className="py-3 px-4 text-sm font-medium text-warm-900 border-b border-warm-100">
                              <div className="flex items-center gap-2">
                                <span className="text-amber-500 scale-90">{Icons.starFilled || Icons.star}</span> Favorites ({favorites.length})
                              </div>
                            </td>
                          </tr>
                          {favorites.map(renderRow)}
                        </>
                      )}
                      {others.length > 0 && (
                        <>
                          {favorites.length > 0 && (
                            <tr>
                              <td colSpan={4} className="py-3 px-4 text-sm font-medium text-warm-900 border-b border-warm-100">
                                Contacts
                              </td>
                            </tr>
                          )}
                          {others.map(renderRow)}
                        </>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="p-12 text-center text-warm-500 space-y-3">
                {!aiMode && query ? (
                  <>
                    <p>No contacts found for <span className="text-warm-700 font-medium">"{query}"</span>.</p>
                    {state.llm?.connected ? (
                      <>
                        <p className="text-sm">Try AI Search to match by meaning, not just text.</p>
                        <button
                          onClick={searchWithAI}
                          disabled={aiLoading}
                          className="mt-1 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-40"
                        >
                          {aiLoading ? 'Searching…' : '✦ Search with AI'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm">Connect an AI model to search by meaning, not just text.</p>
                        <Button size="sm" variant="outline" onClick={() => setState((s) => ({ ...s, activeTab: 'settings' }))}>Configure in Settings</Button>
                      </>
                    )}
                  </>
                ) : (
                  <p>No contacts found matching your criteria.</p>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      <EditLabelsModal open={editLabelsOpen} onClose={() => setEditLabelsOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// CALENDAR TAB
// ───────────────────────────────────────────────────────────────────

function CalendarTab() {
  const { state } = useApp();

  const past = useMemo(() => state.events.filter((e) => new Date(e.start) < new Date()).sort((a, b) => new Date(b.start) - new Date(a.start)), [state.events]);
  const future = useMemo(() => state.events.filter((e) => new Date(e.start) >= new Date()).sort((a, b) => new Date(a.start) - new Date(b.start)), [state.events]);

  const unresolvedCount = useUnresolvedCount();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl text-warm-900">Calendar</h1>
          <p className="text-warm-600 mt-1">Events from Google Calendar — last 3 months and upcoming.</p>
        </div>
        {unresolvedCount > 0 && (
          <div className="text-sm px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <strong>{unresolvedCount}</strong> event{unresolvedCount === 1 ? '' : 's'} with unresolved attendees — tap the <span className="font-bold">?</span> chips to resolve.
          </div>
        )}
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
          {future.length > 0 && (
            <section>
              <SectionHeader>Upcoming</SectionHeader>
              <div className="space-y-2">
                {future.map((e) => <EventRow key={e.id} event={e} />)}
              </div>
            </section>
          )}

          <section>
            <SectionHeader>Past 3 months</SectionHeader>
            <div className="space-y-2">
              {past.map((e) => <EventRow key={e.id} event={e} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function EventRow({ event }) {
  const { state, resolveEventAttendee, dismissAttendee, removeGuestFromEvent } = useApp();
  const { open: openDrawer } = useDrawer();

  const matchedContacts = useMemo(() =>
    (event.guestEmails || [])
      .map((em) => state.contacts.find((c) => (c.email || '').toLowerCase() === em.toLowerCase()))
      .filter(Boolean),
    [event.guestEmails, state.contacts]
  );
  const unresolved = useMemo(() => getUnresolvedHints(event, state.contacts, state.dismissedAttendeeIds), [event, state.contacts, state.dismissedAttendeeIds]);
  const isInteractionLog = event.id.startsWith('log-');

  const [removeGuestConfirm, setRemoveGuestConfirm] = useState(null);

  const handleRemoveGuest = (e, email, name) => {
    e.preventDefault();
    e.stopPropagation();
    setRemoveGuestConfirm({ email, name });
  };

  return (
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
        {event.description && <div className="text-xs text-warm-700 mt-1.5">{event.description}</div>}
      </div>
      {!isInteractionLog && event.htmlLink && (
        <a href={event.htmlLink} target="_blank" rel="noreferrer"
          title="Open in Google Calendar"
          className="shrink-0 p-1.5 rounded-lg text-warm-400 hover:text-warm-700 hover:bg-warm-100 transition">
          {Icons.externalLink}
        </a>
      )}

      <Modal open={!!removeGuestConfirm} onClose={() => setRemoveGuestConfirm(null)} title="Remove guest?" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-warm-700">
            Are you sure you want to remove <strong>{removeGuestConfirm?.name}</strong> from this event?
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setRemoveGuestConfirm(null)}>Cancel</Button>
            <Button size="sm" onClick={() => {
              removeGuestFromEvent(event.id, removeGuestConfirm.email);
              setRemoveGuestConfirm(null);
            }} className="bg-red-600 hover:bg-red-700 text-white border-transparent">
              Remove guest
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function AddGuestButton({ event }) {
  const { state, addGuestToEvent } = useApp();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const suggestions = useMemo(() => {
    if (!search) return [];
    const confirmedEmails = new Set((event.guestEmails || []).map((e) => e.toLowerCase()));
    const q = search.toLowerCase();
    return state.contacts
      .filter((c) => !confirmedEmails.has((c.email || '').toLowerCase()))
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => importanceScore(b) - importanceScore(a))
      .slice(0, 5);
  }, [search, event.guestEmails, state.contacts]);

  if (!open) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Add guest"
        className="w-7 h-7 rounded-full bg-warm-100 hover:bg-warm-200 border border-warm-300 flex items-center justify-center text-warm-600 transition shrink-0">
        {Icons.plus}
      </button>
    );
  }

  return (
    <div className="relative">
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
        </div>
      </div>
    </div>
  );
}

function UnresolvedChip({ event, hint, onConfirm, onDismiss }) {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(hint.firstName);

  const suggestions = useMemo(() => {
    // Rank candidates by name match, co-attendance frequency, shared labels with confirmed guests
    const confirmedEmails = new Set(event.guestEmails.map((e) => e.toLowerCase()));
    const confirmedContacts = state.contacts.filter((c) => c.email && confirmedEmails.has(c.email.toLowerCase()));
    const sharedLabels = new Set(confirmedContacts.flatMap((c) => c.crmLabels));

    const q = search.toLowerCase();
    return state.contacts
      .filter((c) => !confirmedEmails.has((c.email || '').toLowerCase()))
      .map((c) => {
        let score = 0;
        if (c.name.toLowerCase().includes(q)) score += 50;
        if (c.name.toLowerCase().startsWith(q)) score += 30;
        // Shared labels
        c.crmLabels.forEach((l) => { if (sharedLabels.has(l)) score += 10; });
        // Importance
        score += importanceScore(c) * 0.3;
        return { c, score };
      })
      .filter((x) => x.score > 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.c);
  }, [search, event, state.contacts]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-warm-100 hover:bg-warm-200 border border-dashed border-warm-400 text-xs text-warm-700">
        <span className="w-4 h-4 rounded-full bg-warm-300 flex items-center justify-center text-[10px] font-bold">?</span>
        <span>{hint.firstName}</span>
      </button>
    );
  }

  return (
    <div className="relative">
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
        <div className="pt-2 mt-2 border-t border-warm-200 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { onDismiss(); setOpen(false); }}>Dismiss</Button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// MAP TAB
// ───────────────────────────────────────────────────────────────────

function MapTab() {
  const { state, updateContact } = useApp();
  const { open: openDrawer, openLog } = useDrawer();
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef({}); // keyed by contact id
  const dropPinRef = useRef(null);
  const [droppedLatLng, setDroppedLatLng] = useState(null);
  const [sort, setSort] = useState('closest');
  const [radiusKm, setRadiusKm] = useState(500);
  const [filterKey, setFilterKey] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [locInput, setLocInput] = useState('');
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState('');

  if (state.contacts.length === 0) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-3xl text-warm-900">Map</h1>
          <p className="text-warm-600 mt-1">Every contact with a city or address, pinned globally.</p>
        </div>
        <Card className="flex flex-col items-center justify-center min-h-[400px] text-center p-10 space-y-6">
          <div className="w-20 h-20 rounded-full bg-warm-100 flex items-center justify-center text-warm-400">
            <div className="scale-[2]">{Icons.map}</div>
          </div>
          <div className="max-w-md">
            <h2 className="font-serif text-2xl text-warm-900 mb-2">No contacts to map</h2>
            <p className="text-warm-700">
              Once you add contacts with locations in the <strong>All Contacts</strong> tab, they'll appear here automatically.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const selectedContact = selectedId ? state.contacts.find((c) => c.id === selectedId) : null;
  const hasPin = selectedContact && selectedContact.location && selectedContact.location.lat != null;

  const makePinIcon = (L, contact, selected) => {
    const color = colorFor(contact, state.customLabels);
    const size = selected ? 38 : 28;
    const border = selected ? 'border:3px solid white;box-shadow:0 0 0 2px ' + color + ';' : '';
    const inner = contact.photoUrl
      ? `<img src="${contact.photoUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentNode.innerHTML='<span>${contact.avatar.initials}</span>';this.parentNode.style.justifyContent='center';" />`
      : `<span>${contact.avatar.initials}</span>`;
    const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:${selected ? 13 : 10}px;box-shadow:0 2px 8px rgba(0,0,0,.35);${border}transition:all .15s;overflow:hidden">${inner}</div>`;
    return L.divIcon({ html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: '' });
  };

  // Map init
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    const L = window.L;
    const hint = state.mapFocus || { lat: 20, lng: 10, zoom: 2 };
    const map = L.map(mapRef.current, { center: [hint.lat, hint.lng], zoom: hint.zoom, worldCopyJump: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(map);
    map.on('click', () => { setDroppedLatLng((prev) => prev); setSelectedId(null); });
    map.on('click', (e) => setDroppedLatLng({ lat: e.latlng.lat, lng: e.latlng.lng }));
    leafletRef.current = map;

    // Fix for grey tiles / incorrect centering on initial mount or container resize
    const fixSize = () => {
      if (leafletRef.current) {
        leafletRef.current.invalidateSize();
      }
    };

    // Defer invalidateSize slightly to let DOM flexbox layout settle
    const timer = setTimeout(fixSize, 100);

    // Watch for ongoing size changes (e.g. sidebar collapsing, window resize)
    const resizeObserver = new ResizeObserver(() => fixSize());
    resizeObserver.observe(mapRef.current);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      leafletRef.current = null;
    };
  }, [state.mapFocus]);

  // Rebuild pins when contacts / filter / selection change
  useEffect(() => {
    const L = window.L;
    const map = leafletRef.current;
    if (!map) return;
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};
    const filterCat = [...RESERVED_LABELS, ...state.customLabels].find((c) => c.key === filterKey);
    state.contacts.forEach((c) => {
      if (!c.location || c.location.lat == null || c.location.lng == null) return;
      if (filterCat && !c.crmLabels.includes(filterCat.label)) return;
      const isSelected = c.id === selectedId;
      const icon = makePinIcon(L, c, isSelected);
      const marker = L.marker([c.location.lat, c.location.lng], { icon, zIndexOffset: isSelected ? 1000 : 0 })
        .on('click', (e) => { window.L.DomEvent.stopPropagation(e); setSelectedId((prev) => prev === c.id ? null : c.id); });
      marker.addTo(map);
      markersRef.current[c.id] = marker;
    });
  }, [state.contacts, state.customLabels, filterKey, selectedId]);

  // Pan to selected contact when selection changes
  useEffect(() => {
    if (!selectedId || !leafletRef.current) return;
    const c = state.contacts.find((x) => x.id === selectedId);
    if (c && c.location && c.location.lat != null) {
      leafletRef.current.setView([c.location.lat, c.location.lng], Math.max(leafletRef.current.getZoom(), 6), { animate: true });
    }
  }, [selectedId]);

  // Drop-pin marker
  useEffect(() => {
    const L = window.L;
    const map = leafletRef.current;
    if (!map) return;
    if (dropPinRef.current) { map.removeLayer(dropPinRef.current); dropPinRef.current = null; }
    if (droppedLatLng) {
      const icon = L.divIcon({
        html: `<div style="width:20px;height:20px;border-radius:50%;background:#2e231b;border:3px solid #fbf8f4;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
        iconSize: [20, 20], iconAnchor: [10, 10], className: '',
      });
      dropPinRef.current = L.marker([droppedLatLng.lat, droppedLatLng.lng], { icon }).addTo(map);
    }
  }, [droppedLatLng]);

  // mapFocus from Ask tab
  useEffect(() => {
    if (state.mapFocus && leafletRef.current) {
      leafletRef.current.setView([state.mapFocus.lat, state.mapFocus.lng], state.mapFocus.zoom || 5);
      setDroppedLatLng({ lat: state.mapFocus.lat, lng: state.mapFocus.lng });
    }
  }, [state.mapFocus]);

  const distKm = (a, b) => {
    const R = 6371, toRad = (v) => v * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };

  const geocode = async (query) => {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, { headers: { 'Accept-Language': 'en' } });
    const data = await r.json();
    if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
    return null;
  };

  const saveLocation = async () => {
    if (!locInput.trim() || !selectedContact) return;
    setLocBusy(true); setLocErr('');
    try {
      const result = await geocode(locInput.trim());
      if (!result) { setLocErr('Location not found. Try a more specific name.'); return; }
      const parts = result.display.split(',');
      const city = parts[0].trim();
      const country = parts[parts.length - 1].trim();
      updateContact(selectedContact.id, { location: { city, country, lat: result.lat, lng: result.lng, raw: result.display } });
      setLocInput(''); setLocErr('');
    } catch (e) { setLocErr('Geocoding failed. Check your connection.'); }
    finally { setLocBusy(false); }
  };

  const sidebarContacts = useMemo(() => {
    let r = state.contacts.filter((c) => c.location && c.location.lat != null);
    if (filterKey) {
      const cat = [...RESERVED_LABELS, ...state.customLabels].find((x) => x.key === filterKey);
      if (cat) r = r.filter((c) => labelsFor(c).some(l => l.label === cat.label));
    }
    if (droppedLatLng) {
      if (sort === 'closest') {
        r = r.map((c) => ({ c, d: distKm(c.location, droppedLatLng) })).sort((a, b) => a.d - b.d);
      } else {
        r = r.map((c) => ({ c, d: distKm(c.location, droppedLatLng) })).filter((x) => x.d <= radiusKm);
        if (sort === 'recentRadius') r.sort((a, b) => a.c.lastContactedDaysAgo - b.c.lastContactedDaysAgo);
        if (sort === 'staleRadius') r.sort((a, b) => b.c.lastContactedDaysAgo - a.c.lastContactedDaysAgo);
      }
      r = r.slice(0, 20).map((x) => ({ ...x.c, _dist: x.d }));
    } else {
      r = [...r].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30);
    }
    return r;
  }, [state.contacts, state.customLabels, droppedLatLng, sort, radiusKm, filterKey]);

  return (
    <div className="h-full flex">
      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0" />
        {!droppedLatLng && !selectedId && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-warm-900/90 text-warm-50 px-4 py-2 rounded-xl text-sm shadow-lg pointer-events-none">
            Click a pin or contact to select · click the map to drop a reference pin
          </div>
        )}
      </div>

      {/* Sidebar */}
      <aside className="w-80 shrink-0 border-l border-warm-200 bg-warm-50 flex flex-col">

        {/* Filters */}
        <div className="p-4 border-b border-warm-200 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl text-warm-900">Map</h2>
            {selectedId && <button onClick={() => setSelectedId(null)} className="text-warm-500 hover:text-warm-900 text-xl font-light leading-none">×</button>}
          </div>
          <select value={filterKey} onChange={(e) => setFilterKey(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-warm-300 bg-surface text-sm">
            <option value="">All labels</option>
            {RESERVED_LABELS.concat(state.customLabels || []).map((c) => <option key={c.key} value={c.key}>{c.label.replace(/^CRM:\s*/i, '')}</option>)}
          </select>
          {droppedLatLng && (
            <>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-warm-300 bg-surface text-sm">
                <option value="closest">Sort: Closest first</option>
                <option value="recentRadius">Sort: Recently contacted within radius</option>
                <option value="staleRadius">Sort: Least recently contacted within radius</option>
              </select>
              {sort !== 'closest' && (
                <div>
                  <label className="text-xs text-warm-700">Radius: {radiusKm} km</label>
                  <input type="range" min="10" max="2000" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="w-full" />
                </div>
              )}
              <Button size="sm" variant="ghost" onClick={() => setDroppedLatLng(null)} className="w-full">Clear dropped pin</Button>
            </>
          )}
        </div>

        {/* Inline contact panel — no overlay, stays in sidebar */}
        {selectedContact && (
          <div className="border-b border-warm-200 bg-surface p-4 space-y-3 animate-slide-up">
            <div className="flex items-start gap-3">
              <Avatar contact={selectedContact} size={44} ring />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-warm-900 truncate">{selectedContact.name}</div>
                <div className="text-xs text-warm-600 truncate mt-0.5">{selectedContact.email || selectedContact.phone || '—'}</div>
                <div className="text-xs text-warm-500 mt-0.5">Last contacted {relativeDate(selectedContact.lastContactedAt)}</div>
              </div>
            </div>

            {hasPin ? (
              <div className="text-xs text-warm-700 bg-warm-50 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(selectedContact, state.customLabels) }} />
                {selectedContact.location.city}{selectedContact.location.country ? `, ${selectedContact.location.country}` : ''}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No map pin — this contact won't appear on the map. Add a location to place them.
                </p>
                <div className="flex gap-2">
                  <input
                    value={locInput}
                    onChange={(e) => setLocInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveLocation()}
                    placeholder="e.g. Toronto, Canada"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-warm-300 bg-warm-50 text-xs"
                  />
                  <Button size="sm" onClick={saveLocation} disabled={locBusy || !locInput.trim()}>
                    {locBusy ? '…' : 'Set'}
                  </Button>
                </div>
                {locErr && <p className="text-xs text-red-700">{locErr}</p>}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="secondary" onClick={() => openLog(selectedContact.id)} className="flex-1">Add an interaction</Button>
              <Button size="sm" variant="outline" onClick={() => { openDrawer(selectedContact.id); setSelectedId(null); }} className="flex-1">Full profile</Button>
            </div>
          </div>
        )}

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto divide-y divide-warm-100">
          {sidebarContacts.length === 0 && (
            <div className="p-4 text-sm text-warm-600 italic">
              {droppedLatLng ? 'No contacts in range. Increase the radius or clear the filter.' : 'No contacts with map locations yet. Select a contact without a location to add one.'}
            </div>
          )}
          {sidebarContacts.map((c) => {
            const isSelected = c.id === selectedId;
            return (
              <button key={c.id}
                onClick={() => setSelectedId((prev) => prev === c.id ? null : c.id)}
                className={`w-full flex items-center gap-3 p-3 text-left transition ${isSelected ? 'bg-sage-50 border-l-2 border-sage-500 pl-[10px]' : 'hover:bg-warm-100 border-l-2 border-transparent'}`}
              >
                <Avatar contact={c} size={32} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${isSelected ? 'font-semibold text-warm-900' : 'font-medium text-warm-900'}`}>{c.name}</div>
                  <div className="text-xs text-warm-600 truncate">
                    {c.location.city}
                    {c._dist != null && ` · ${Math.round(c._dist)} km`}
                    {` · ${relativeDate(c.lastContactedAt)}`}
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(c, state.customLabels) }} />
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SHARED LLM HELPER
// ───────────────────────────────────────────────────────────────────

async function callLLM(llm, messages, ollamaOpts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    if (llm.provider === 'ollama' || llm.provider === 'other') {
      const endpoint = (llm.endpoint || 'http://localhost:11434').replace(/\/$/, '');
      const model = llm.model || 'llama3.2';
      const res = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ model, messages, stream: false, think: false, ...ollamaOpts }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama error ${res.status}${errText ? ': ' + errText.slice(0, 120) : ''}`);
      }
      const data = await res.json();
      return data.message?.content || '';
    }
    if (llm.provider === 'gemini') {
      const model = llm.model || 'gemini-2.0-flash';
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llm.apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({ model, messages }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let detail = body;
        try { detail = JSON.parse(body)?.error?.message || body; } catch {}
        const friendly = res.status === 429
          ? 'Rate limit hit — wait a moment and try again'
          : res.status === 403
            ? 'API key rejected — check it in Settings'
            : detail.slice(0, 150) || `HTTP ${res.status}`;
        throw new Error(`Gemini: ${friendly}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
    throw new Error(`Provider "${llm.provider}" is not yet supported for chat.`);
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────
// BOT MESSAGE — renders markdown with inline contact cards
// ───────────────────────────────────────────────────────────────────

function makeContactCard(c) {
  const initials = c.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const subtitle = [c.location?.city, c.custom?.title].filter(Boolean).join(' · ');
  return `<button class="contact-card-btn" data-contact-id="${c.id}">` +
    `<span class="contact-card-avatar">${initials}</span>` +
    `<span class="contact-card-info"><span class="contact-card-name">${c.name}</span>` +
    (subtitle ? `<span class="contact-card-sub">${subtitle}</span>` : '') +
    `</span></button>`;
}

function buildBotHTML(text, allContacts) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byName = {};
  (allContacts || []).forEach((c) => { byName[c.name] = c; });

  // First-name → contact map; null means ambiguous (multiple contacts share it)
  const byFirst = {};
  (allContacts || []).forEach((c) => {
    const first = c.name.split(/\s+/)[0];
    byFirst[first] = byFirst[first] === undefined ? c : null;
  });

  const placeholders = {};
  let idx = 0;
  const nextKey = () => { const k = `TETHERCONTACT${idx++}X`; return k; };
  const captured = new Set();

  const pin = (c) => {
    if (captured.has(c.id)) return null; // already pinned, don't double-replace
    captured.add(c.id);
    const key = nextKey();
    placeholders[key] = c;
    return key;
  };

  // Pass 1 — explicit [[Name]] markers from the LLM
  let processed = text.replace(/\[\[([^\]]+)\]\]/g, (full, name) => {
    const c = byName[name];
    if (!c) return name; // unknown name → render as plain text
    const key = nextKey();
    placeholders[key] = c;
    captured.add(c.id);
    return key;
  });

  // Pass 2 — exact full-name fallback for contacts the LLM forgot to bracket
  for (const c of (allContacts || [])) {
    if (captured.has(c.id)) continue;
    processed = processed.replace(new RegExp(`\\b${esc(c.name)}\\b`, 'g'), () => pin(c) || c.name);
  }

  // Pass 3 — unique first-name fallback (e.g. "Elo" → "Elo (Stockholm Hostel)")
  for (const [first, c] of Object.entries(byFirst)) {
    if (!c || captured.has(c.id)) continue;
    processed = processed.replace(new RegExp(`\\b${esc(first)}\\b`, 'g'), () => pin(c) || first);
  }

  let html = marked.parse(processed);

  for (const [key, c] of Object.entries(placeholders)) {
    html = html.replace(key, makeContactCard(c));
  }

  return DOMPurify.sanitize(html, { ALLOW_DATA_ATTR: true });
}

function BotMessage({ text, contacts, allContacts, openDrawer }) {
  const ref = useRef(null);
  const html = useMemo(() => buildBotHTML(text, allContacts), [text, allContacts]);

  useEffect(() => {
    if (!ref.current) return;
    const btns = ref.current.querySelectorAll('.contact-card-btn');
    btns.forEach((btn) => { btn.onclick = () => openDrawer(btn.dataset.contactId); });
    return () => btns.forEach((btn) => { btn.onclick = null; });
  }, [html, openDrawer]);

  return <div ref={ref} className="chat-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ASK (chat) TAB
// ───────────────────────────────────────────────────────────────────

function AskTab() {
  const { state, setState } = useApp();
  const { open: openDrawer } = useDrawer();
  const [messages, setMessages] = useState([
    { role: 'bot', text: `Hi ${state.googleProfile?.name?.split(' ')[0] || 'there'} — ask me anything about your network. Try: "Who do I know in Berlin?" or "Which friends work in tech?"` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const llm = state.llm;
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const queryLLM = async (question, history) => {
    const contactsSummary = state.contacts.slice(0, 200).map((c) => {
      const parts = [`- ${c.name}`];
      if (c.location?.city) parts.push(`(${c.location.city}${c.location.country ? ', ' + c.location.country : ''})`);
      const labels = [...(c.googleLabels || []), ...(c.crmLabels || [])].map((l) => l.replace(/^CRM:\s*/i, '')).join(', ');
      if (labels) parts.push(`[${labels}]`);
      if ((c.skills || []).length) parts.push(`skills: ${c.skills.join(', ')}`);
      return parts.join(' ');
    }).join('\n');

    const systemPrompt = `You are a helpful personal CRM assistant. The user has ${state.contacts.length} contacts:\n\n${contactsSummary}\n\nAnswer questions about the user's network concisely. When referring to a specific contact, wrap their EXACT name (as listed above) in double square brackets, e.g. [[Jane Smith]]. Use this for every contact you mention so the app can render interactive contact cards. Do not use this syntax for anyone not in the list.`;

    const text = await callLLM(llm, [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: question },
    ]);
    return text || 'No response from model.';
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    const history = messages.slice(1).map((m) => ({
      role: m.role === 'bot' ? 'assistant' : 'user',
      content: m.text,
    }));
    setMessages((ms) => [...ms, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const responseText = await queryLLM(q, history);
      const seen = new Set();
      const mentioned = [];
      for (const match of responseText.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const contact = state.contacts.find((c) => c.name === match[1]);
        if (contact && !seen.has(contact.id)) { seen.add(contact.id); mentioned.push(contact); }
      }
      setMessages((ms) => [...ms, { role: 'bot', text: responseText, contacts: mentioned }]);
    } catch (e) {
      const errMsg = e.name === 'AbortError'
        ? 'Request timed out. Check that your LLM is reachable and try again.'
        : e.message;
      setMessages((ms) => [...ms, { role: 'bot', text: `Error: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const showSetup = !llm.connected;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-warm-900">Ask</h1>
        <p className="text-warm-600 mt-1">AI-powered chatbot to help you answer questions about your contacts.</p>
      </div>

      {state.contacts.length === 0 ? (
        <Card className="flex flex-col items-center justify-center min-h-[320px] text-center p-10 space-y-6">
          <div className="w-20 h-20 rounded-full bg-warm-100 flex items-center justify-center text-warm-400">
            <div className="scale-[2]">{Icons.ask}</div>
          </div>
          <div className="max-w-md">
            <h2 className="font-serif text-2xl text-warm-900 mb-2">No data to ask about</h2>
            <p className="text-warm-700">
              Tether's AI features work best when you have contacts to query. Add some in the <strong>All Contacts</strong> tab first.
            </p>
          </div>
        </Card>
      ) : showSetup ? (
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md w-full p-8 text-center">
            <h2 className="font-serif text-2xl text-warm-900 mb-2">Connect Ollama to start chatting</h2>
            <p className="text-warm-700 mb-6">Configure your Ollama endpoint in Settings and hit <strong>Test &amp; Save</strong> to verify the connection.</p>
            <Button onClick={() => setState((s) => ({ ...s, activeTab: 'settings' }))}>Open Settings</Button>
          </Card>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 bg-warm-50/50 rounded-2xl border border-warm-200 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${m.role === 'user' ? 'bubble-user' : 'bubble-bot'} px-4 py-3 text-sm leading-relaxed`}>
                  {m.role === 'user'
                    ? <p>{m.text}</p>
                    : <BotMessage text={m.text} contacts={m.contacts} allContacts={state.contacts} openDrawer={openDrawer} />
                  }
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bubble-bot px-4 py-3 text-sm text-warm-500 flex items-center gap-1">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" style={{ animationDelay: '0.2s' }} />
                  <span className="thinking-dot" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="p-4 bg-surface border-t border-warm-200 flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="e.g. who do I know in Lisbon?"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl border border-warm-300 bg-warm-50 focus:bg-surface transition-colors disabled:opacity-50" />
            <Button onClick={send} icon={Icons.send} disabled={loading}>Send</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// HELP TAB
// ───────────────────────────────────────────────────────────────────

const HELP_DOCS = [
  { title: 'Reconnect', body: "Surfaces your close friends sorted by who you haven't talked to in the longest time. Only contacts labeled CRM: Close Friends with a nudge frequency appear here. Set either from All Contacts → contact profile, or during onboarding." },
  { title: 'Ask', body: "Chat over contact metadata and your notes. It does not read calendar events' text, emails, or anything outside Tether. Geographic queries can open the Map tab automatically." },
  { title: 'Map', body: "Pins every contact with a resolved city. Click anywhere to drop a reference pin — the sidebar then ranks contacts by distance (or recency within a radius). Colors match category." },
  { title: 'Calendar', body: "Pulls your last ~3 months + upcoming. Formal guests are auto-matched against your contacts. Titles like 'Dinner with X' that don't formally invite the contact get a question-mark chip — click to resolve and log an interaction." },
  { title: 'All Contacts', body: 'Every contact from Google. Default sort is our importance ranking (label presence + calendar co-attendance + logged interactions + contact completeness). Edit any contact; changes round-trip to Google.' },
  { title: 'Categories & labels', body: "Tether uses a reserved CRM: prefix on Google Contact labels so they don't clash with your personal labels. Adding CRM: Close Friends in Tether writes the label to Google. Any CRM: label you add in Google surfaces here on next sync." },
  { title: 'Nudges', body: "Per-contact nudge: set a cadence (e.g. every 30 days) from a contact's profile. Category nudges (e.g. 'connect with someone Professional every 2 months') are configured in Settings → Nudges. Both coexist." },
  { title: 'Privacy', body: "No backend — everything lives in your browser (app-only data) or in your own Google account (contacts & calendar). LLM queries go only to the provider you configured." },
];

function HelpTab() {
  const { setState } = useApp();
  const [open, setOpen] = useState(0);

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-warm-900">Help</h1>
        <p className="text-warm-600 mt-1">Docs, shortcuts, and onboarding controls.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setState((s) => ({ ...s, phase: 'walkthrough' }))}>Restart onboarding</Button>
        <Button variant="secondary" onClick={() => setState((s) => ({ ...s, phase: 'walkthrough' }))}>Rerun dashboard walkthrough</Button>
        <Button variant="ghost">
          <a href="https://github.com/" target="_blank" rel="noreferrer">GitHub repo ↗</a>
        </Button>
      </div>

      <Card className="divide-y divide-warm-100">
        {HELP_DOCS.map((d, i) => (
          <div key={i}>
            <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full flex items-center justify-between p-4 text-left hover:bg-warm-50">
              <span className="font-medium text-warm-900">{d.title}</span>
              <span className="text-warm-500">{open === i ? '–' : '+'}</span>
            </button>
            {open === i && <div className="px-4 pb-4 text-sm text-warm-700 leading-relaxed">{d.body}</div>}
          </div>
        ))}
      </Card>

      <Card className="p-6">
        <h3 className="font-serif text-lg mb-3">Keyboard shortcuts</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm text-warm-700">
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">G R</kbd>Go to Reconnect</div>
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">G A</kbd>Go to Ask</div>
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">G M</kbd>Go to Map</div>
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">G C</kbd>Go to Calendar</div>
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">/</kbd>Search in All Contacts</div>
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">Esc</kbd>Close drawer / modal</div>
        </div>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SETTINGS TAB
// ───────────────────────────────────────────────────────────────────

function SettingsTab() {
  const { state, setState, setTheme } = useApp();
  const [showRawData, setShowRawData] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');

  const updateNudges = (patch) => setState((s) => ({ ...s, nudges: { ...s.nudges, ...patch } }));

  const [llmDraft, setLlmDraft] = useState({
    provider: state.llm?.provider || 'ollama',
    endpoint: state.llm?.endpoint || 'http://localhost:11434',
    model: state.llm?.model || '',
    apiKey: state.llm?.apiKey || '',
    connected: state.llm?.connected || false,
  });
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState(
    state.llm?.connected ? { ok: true, message: 'Previously verified.' } : null
  );
  const [llmModels, setLlmModels] = useState(state.llm?.availableModels || []);
  const [showApiKey, setShowApiKey] = useState(false);

  const testAndSaveLlm = async () => {
    setLlmTesting(true);
    setLlmTestResult(null);
    try {
      const timed = async (url, opts) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
        finally { clearTimeout(t); }
      };

      if (llmDraft.provider === 'ollama' || llmDraft.provider === 'other') {
        const endpoint = (llmDraft.endpoint || 'http://localhost:11434').replace(/\/$/, '');
        const res = await timed(`${endpoint}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const modelNames = (data.models || []).map((m) => m.name);
        setLlmModels(modelNames);
        if (!modelNames.length) {
          setState((s) => ({ ...s, llm: { ...llmDraft, endpoint, connected: false } }));
          setLlmTestResult({ ok: false, message: 'Ollama reachable but no models found — run: ollama pull <model>' });
          return;
        }
        const selectedModel = llmDraft.model || modelNames[0];
        if (!modelNames.includes(selectedModel)) {
          setLlmTestResult({ ok: false, message: `Model "${selectedModel}" not found. Available: ${modelNames.slice(0, 3).join(', ')}${modelNames.length > 3 ? '…' : ''}` });
          return;
        }
        // Actually test the model responds via chat
        const chatCtrl = new AbortController();
        const chatTimer = setTimeout(() => chatCtrl.abort(), 90000);
        try {
          const chatRes = await fetch(`${endpoint}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: chatCtrl.signal,
            body: JSON.stringify({ model: selectedModel, messages: [{ role: 'user', content: 'hi' }], stream: false, think: false, options: { num_predict: 5 } }),
          });
          if (!chatRes.ok) {
            const errText = await chatRes.text().catch(() => '');
            throw new Error(`Model test failed: HTTP ${chatRes.status}${errText ? ' — ' + errText.slice(0, 100) : ''}`);
          }
        } finally {
          clearTimeout(chatTimer);
        }
        const saved = { ...llmDraft, endpoint, model: selectedModel, availableModels: modelNames, connected: true };
        setState((s) => ({ ...s, llm: saved }));
        setLlmDraft(saved);
        setLlmTestResult({ ok: true, message: `Connected. Using: ${selectedModel}${modelNames.length > 1 ? ` (${modelNames.length} models available)` : ''}` });
      } else if (llmDraft.provider === 'gemini') {
        if (!llmDraft.apiKey.trim()) throw new Error('API key is required.');
        const res = await timed(`https://generativelanguage.googleapis.com/v1beta/models?key=${llmDraft.apiKey}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const modelNames = (data.models || [])
          .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m) => m.name.replace('models/', ''));
        const preferred = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        const detectedModel = (llmDraft.model && modelNames.includes(llmDraft.model))
          ? llmDraft.model
          : preferred.find((p) => modelNames.includes(p)) || modelNames[0] || '';
        const saved = { ...llmDraft, model: detectedModel, availableModels: modelNames, connected: true };
        setState((s) => ({ ...s, llm: saved }));
        setLlmDraft(saved);
        setLlmModels(modelNames);
        setLlmTestResult({ ok: true, message: `Connected. ${modelNames.length} model${modelNames.length !== 1 ? 's' : ''} available.` });
      } else {
        const saved = { ...llmDraft, connected: false };
        setState((s) => ({ ...s, llm: saved }));
        setLlmDraft(saved);
        setLlmTestResult({ ok: true, message: 'Saved. Connection testing not yet supported for this provider.' });
      }
    } catch (e) {
      const errMsg = e.name === 'AbortError' ? 'Connection timed out.' : e.message;
      setState((s) => ({ ...s, llm: { ...llmDraft, connected: false } }));
      setLlmTestResult({ ok: false, message: `Could not connect — ${errMsg}` });
    } finally {
      setLlmTesting(false);
    }
  };

  const unlink = async () => {
    try {
      if (window.TetherGoogle) await window.TetherGoogle.revoke();
    } catch (e) { console.error('Revoke failed:', e); }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('tether-cal-asked');
    window.location.reload();
  };

  const deleteAllData = async () => {
    setDeleting(true);
    setDeleteMsg('');
    try {
      if (window.TetherGoogle) {
        // Overwrite Drive file with an empty contacts array
        await window.TetherGoogle.writeAppData({ contacts: [], version: 1, deletedAt: new Date().toISOString() });
      }

      // Reset state but keep auth & preferences
      setState((s) => ({
        ...defaultState(),
        googleSignedIn: s.googleSignedIn,
        googleProfile: s.googleProfile,
        demoMode: s.demoMode,
        theme: s.theme,
        llm: s.llm,
        phase: 'dashboard',
        activeTab: 'contacts',
      }));

      localStorage.removeItem(STORAGE_KEY);
      setDeleteConfirm(false);
      setDeleteMsg('✓ All contact data wiped from Drive and browser.');
      setTimeout(() => setDeleteMsg(''), 5000);
    } catch (e) {
      console.error('Delete failed:', e);
      setDeleteMsg(`Delete failed: ${e.message || 'unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-warm-900">Settings</h1>
        <p className="text-warm-600 mt-1">Account, appearance, LLM, calendar, and nudges.</p>
      </div>

      {/* Account */}
      <Card className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">Account</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {state.googleProfile && <Avatar contact={{ name: state.googleProfile.name, photoUrl: state.googleProfile.picture }} size={40} />}
            <div>
              <div className="font-medium">{state.googleProfile?.name}</div>
              <div className="text-xs text-warm-600">{state.googleProfile?.email}</div>
            </div>
          </div>
          <Button variant="outline" onClick={unlink}>Sign Out</Button>
        </div>
      </Card>

      {/* Appearance */}
      <Card className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">Appearance</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-warm-700">Theme</span>
          <div className="flex rounded-lg bg-warm-100 p-1">
            {['light', 'dark'].map((t) => (
              <button key={t} onClick={() => setTheme(t)}
                className={`px-4 py-1.5 rounded-md text-sm capitalize ${state.theme === t ? 'bg-surface shadow-sm text-warm-900' : 'text-warm-600'}`}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {RESERVED_LABELS.map((c) => (
              <div key={c.key} className="flex items-center gap-2 p-2 rounded-lg border border-warm-200 bg-surface text-sm">
                <span className="w-4 h-4 rounded-full" style={{ background: c.color }} />
                <span className="truncate">{c.label.replace(/^CRM:\s*/, '')}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* LLM */}
      <Card className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">LLM config</h3>
        <div>
          <span className="text-xs text-warm-600">Provider</span>
          <select value={llmDraft.provider}
            onChange={(e) => { setLlmDraft((d) => ({ ...d, provider: e.target.value, model: '' })); setLlmTestResult(null); setLlmModels([]); }}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface">
            <option value="ollama">Local Ollama</option>
            <option value="gemini">Google Gemini</option>
            <option value="openai" disabled>OpenAI (coming soon)</option>
            <option value="anthropic" disabled>Anthropic (coming soon)</option>
          </select>
        </div>
        {(llmDraft.provider === 'ollama' || llmDraft.provider === 'other') && (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p><strong>Model quality matters for local Ollama.</strong> Small models (under ~13B parameters) often give slow or inaccurate results on CRM tasks.</p>
              <p>If AI search or chat isn't working well, try switching to a more powerful model.</p>
            </div>
            <div>
              <span className="text-xs text-warm-600">Endpoint URL</span>
              <input value={llmDraft.endpoint}
                onChange={(e) => { setLlmDraft((d) => ({ ...d, endpoint: e.target.value })); setLlmTestResult(null); }}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface"
                placeholder="http://localhost:11434" />
            </div>
          </>
        )}
        {(llmDraft.provider === 'gemini' || llmDraft.provider === 'openai' || llmDraft.provider === 'anthropic') && (
          <div>
            <span className="text-xs text-warm-600">API Key</span>
            <div className="relative mt-1">
              <input type={showApiKey ? 'text' : 'password'} value={llmDraft.apiKey}
                onChange={(e) => { setLlmDraft((d) => ({ ...d, apiKey: e.target.value })); setLlmTestResult(null); setLlmModels([]); }}
                className="w-full px-3 py-2 pr-10 rounded-lg border border-warm-300 bg-surface"
                placeholder={llmDraft.provider === 'gemini' ? 'AIza…' : 'sk-…'} />
              <button type="button" onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-700 p-1">
                {showApiKey
                  ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>
        )}
        <div>
          <span className="text-xs text-warm-600">
            Model
            {llmModels.length > 0 && <span className="text-warm-400"> (populated from {llmDraft.provider === 'ollama' ? 'Ollama' : 'API key'})</span>}
          </span>
          {llmModels.length > 0 ? (
            <select value={llmDraft.model}
              onChange={(e) => { setLlmDraft((d) => ({ ...d, model: e.target.value })); setLlmTestResult(null); }}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface">
              {llmModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input value={llmDraft.model}
              onChange={(e) => { setLlmDraft((d) => ({ ...d, model: e.target.value })); setLlmTestResult(null); }}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface"
              placeholder="Click Test & Save to see available models" />
          )}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={testAndSaveLlm} disabled={llmTesting}>
            {llmTesting ? 'Testing…' : 'Test & Save'}
          </Button>
          {llmTestResult && (
            <span className={`text-sm ${llmTestResult.ok ? 'text-sage-700' : 'text-red-600'}`}>
              {llmTestResult.ok ? '✓ ' : '✗ '}{llmTestResult.message}
            </span>
          )}
        </div>
        {llmTestResult?.ok && llmDraft.provider === 'ollama' && (
          <p className="text-xs text-amber-700 dark:text-amber-400">If search results seem wrong or chat responses are poor, your model may not be powerful enough — try a larger or more capable model.</p>
        )}
        <p className="text-xs text-warm-500">Settings are stored locally in your browser and sent only to the provider you configure.</p>
      </Card>

      {/* Calendar */}
      <Card className="p-6 space-y-3">
        <h3 className="font-serif text-lg text-warm-900">Calendar</h3>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={state.calendarWriteEnabled} onChange={(e) => setState((s) => ({ ...s, calendarWriteEnabled: e.target.checked }))} />
          <span className="text-sm">Write logged interactions to Google Calendar (dedicated <strong>Personal CRM</strong> calendar, no guest invites).</span>
        </label>
      </Card>

      {/* Transparency Portal */}
      <Card className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">Transparency Portal</h3>
        <p className="text-sm text-warm-700">
          All your Tether data lives in a single hidden file (<code className="font-mono text-xs">tether_contacts_v1.json</code>) in your Google Drive's private <strong>appData</strong> folder — invisible in Drive UI, safe from accidental deletion.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => {
            const data = { contacts: state.contacts, version: 1, exportedAt: new Date().toISOString() };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'tether_contacts_v1.json';
            a.click();
            URL.revokeObjectURL(url);
          }}>Export all data</Button>
        </div>
      </Card>

      {/* Nudges */}
      <Card className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">Nudges</h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-warm-700">Default close-friend cadence:</span>
          <input type="number" min="1" value={state.nudges.defaultCloseFriendDays}
            onChange={(e) => updateNudges({ defaultCloseFriendDays: Number(e.target.value) })}
            className="w-20 px-2 py-1 rounded-lg border border-warm-300 bg-surface" />
          <span>days</span>
        </div>
        <div>
          <div className="space-y-2">
            {RESERVED_LABELS.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <span className="flex-1"><LabelPill label={c} /></span>
                <span className="text-xs text-warm-600">every</span>
                <input type="number" min="0" value={state.nudges.groupCadence[c.key] || ''}
                  onChange={(e) => updateNudges({ groupCadence: { ...state.nudges.groupCadence, [c.key]: e.target.value ? Number(e.target.value) : 0 } })}
                  className="w-20 px-2 py-1 rounded-lg border border-warm-300 bg-surface text-sm" placeholder="off" />
                <span className="text-xs text-warm-600">days</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Data Management */}
      <Card className="p-6 space-y-4 border-red-100">
        <h3 className="font-serif text-lg text-red-900">Danger Zone</h3>
        <p className="text-sm text-warm-700">
          Wipe all contact data, interactions, and notes. This affects both your private Google Drive file and your local browser storage.
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {deleteConfirm ? (
              <div className="flex gap-2 items-center">
                <Button variant="danger" onClick={deleteAllData} disabled={deleting}>
                  {deleting ? 'Wiping...' : 'Yes, delete everything'}
                </Button>
                <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeleteConfirm(true)}>
                Delete all contact data
              </Button>
            )}
          </div>
          {deleteMsg && <div className="text-xs text-sage-700 font-medium">{deleteMsg}</div>}
        </div>
      </Card>

      <Modal open={clearDataConfirm} onClose={() => setClearDataConfirm(false)} title="Clear app-only data?" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-warm-700">
            This will clear your LLM keys, nudges, custom fields, and notes from your browser. Your Google Contacts and Calendar will remain untouched.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setClearDataConfirm(false)}>Cancel</Button>
            <Button size="sm" onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }} className="bg-red-600 hover:bg-red-700 text-white border-transparent">
              Clear data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

window.TetherTabs = {
  ReconnectTab,
  AllContactsTab,
  CalendarTab,
  MapTab,
  AskTab,
  HelpTab,
  SettingsTab,
};
