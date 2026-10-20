/* Tether — All Contacts tab component (also handles Trash mode). */

const { useState, useMemo } = React;
const { Icons } = window.TetherConstants;
const { Avatar, Button, Card, LabelPill, Modal, LabelFilter } = window.TetherComponents;
const { useApp } = window.TetherContext;
const { useDrawer } = window.TetherDrawer;
const { relativeDate, labelsFor, importanceScore, callLLM } = window.TetherHelpers;

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
  const { state, setState, allLabels, updateContact, deleteContactPermanently } = useApp();
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
  const [confirmPermaDeleteId, setConfirmPermaDeleteId] = useState(null);

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
        return match && (c.crmLabels.includes(match.label) || c.googleLabels.includes(match.label));
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
      if (valA === '') return 1;
      if (valB === '') return -1;

      return valA.localeCompare(valB) * dir;
    });
    if (sort === 'deletedAt') r.sort((a, b) => {
      const valA = a.deletedAt || 0;
      const valB = b.deletedAt || 0;
      if (valA === valB) return a.name.localeCompare(b.name) * dir;
      return (valB - valA) * dir;
    });
    if (sort === 'label') r.sort((a, b) => {
      const getLab = (c) => {
        const labs = labelsFor(c, state.customLabels);
        return labs.length > 0 ? labs[0].label.replace(/^CRM:\s*/i, '').toLowerCase() : '';
      };
      const labA = getLab(a);
      const labB = getLab(b);

      if (labA === labB) return a.name.localeCompare(b.name) * dir;
      if (labA === '') return 1;
      if (labB === '') return -1;

      return labA.localeCompare(labB) * dir;
    });
    return r;
  }, [state.contacts, isTrashMode, sort, sortDir, filter, query, allLabels, aiMode, aiResults]);

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
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${aiMode
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
            <LabelFilter
              labels={allLabels.map((l) => ({
                key: l.key,
                display: l.label.replace(/^CRM:\s*/, ''),
                count: state.contacts.filter(
                  (c) =>
                    !c.isDeleted &&
                    (c.crmLabels.some((lbl) => lbl.toLowerCase().includes(l.label.replace(/^CRM:\s*/i, '').trim().toLowerCase())) ||
                      c.googleLabels.some((lbl) => lbl.toLowerCase().includes(l.label.replace(/^CRM:\s*/i, '').trim().toLowerCase())))
                ).length
              }))}
              activeFilter={filter}
              onFilterChange={setFilter}
              onEditLabels={() => setEditLabelsOpen(true)}
            />
          )}

          <Card className="overflow-hidden">
            <table className="w-full border-collapse bg-surface">
              <thead className="bg-surface text-xs text-warm-700 border-b border-warm-200">
                {isTrashMode ? (
                  <tr>
                    <th className="text-left py-4 px-4 font-normal cursor-pointer hover:bg-warm-50 select-none" onClick={() => handleSort('name')}>
                      Name{sortArrow('name')}
                    </th>
                    <th className="text-left py-4 px-4 hidden md:table-cell font-normal cursor-pointer hover:bg-warm-50 select-none" onClick={() => handleSort('deletedAt')}>
                      Date deleted{sortArrow('deletedAt')}
                    </th>
                    <th className="py-4 px-2 w-1" />
                  </tr>
                ) : (
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
                  </tr>
                )}
              </thead>
              <tbody>
                {(() => {
                  const favorites = isTrashMode ? [] : rows.filter((c) => c.isFavorite);
                  const others = isTrashMode ? rows : rows.filter((c) => !c.isFavorite);

                  const renderRow = (c) => {
                    const labs = labelsFor(c, state.customLabels);
                    if (isTrashMode) {
                      return (
                        <tr key={c.id} onClick={() => openDrawer(c.id)} className="border-b border-warm-100 hover:bg-warm-50 cursor-pointer">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Avatar contact={c} size={36} />
                              <div>
                                <div className="text-sm font-medium text-warm-900">{c.name}</div>
                                <div className="text-xs text-warm-600">{c.email || c.phone || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 hidden md:table-cell text-sm text-warm-700">{c.deletedAt ? relativeDate(c.deletedAt) : '—'}</td>
                          <td className="py-3 px-2 w-1" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => { updateContact(c.id, { isDeleted: false, deletedAt: null }); }}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-sage-50 text-sage-700 hover:bg-sage-100 border border-sage-200 transition whitespace-nowrap"
                                title="Recover contact"
                              >Recover</button>
                              <button
                                onClick={() => setConfirmPermaDeleteId(c.id)}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition whitespace-nowrap"
                                title="Delete forever"
                              >Delete Forever</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
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
                      </tr>
                    );
                  };

                  const colSpan = 3;
                  return (
                    <>
                      {favorites.length > 0 && (
                        <>
                          <tr>
                            <td colSpan={colSpan} className="py-3 px-4 text-sm font-medium text-warm-900 border-b border-warm-100">
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
                              <td colSpan={colSpan} className="py-3 px-4 text-sm font-medium text-warm-900 border-b border-warm-100">
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
      <Modal open={!!confirmPermaDeleteId} onClose={() => setConfirmPermaDeleteId(null)} title="Delete forever?" size="sm">
        <p className="text-sm text-warm-700 mb-4">This contact will be permanently deleted. This action cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmPermaDeleteId(null)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={() => { deleteContactPermanently(confirmPermaDeleteId); setConfirmPermaDeleteId(null); }}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}

window.TetherTabs = window.TetherTabs || {};
window.TetherTabs.AllContactsTab = AllContactsTab;
