/* Tether — Shared tab components (ContactPickerModal).
   Exposes window.TetherTabs.ContactPickerModal for use across tab files. */

const { useState, useEffect } = React;
const { Avatar, Button, Modal, LabelFilter } = window.TetherComponents;
const { importanceScore } = window.TetherHelpers;

function ContactPickerModal({
  open,
  onClose,
  title = "Select Contacts",
  eligibleContacts = [],
  onPick,
  submitText = "Done",
  disableSubmit = false,
  extraTopContent = null,
}) {
  const [search, setSearch] = useState('');
  const [filterLabel, setFilterLabel] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    if (open) {
      setSearch('');
      setFilterLabel(null);
      setSelectedIds(new Set());
    }
  }, [open]);

  if (!open) return null;

  const labelCounts = {};
  eligibleContacts.forEach((c) => {
    c.googleLabels.filter((l) => !l.startsWith('CRM:')).forEach((l) => { labelCounts[l] = (labelCounts[l] || 0) + 1; });
    c.crmLabels.forEach((l) => { labelCounts[l] = (labelCounts[l] || 0) + 1; });
  });
  const allLabelsList = Object.keys(labelCounts)
    .sort((a, b) => labelCounts[b] - labelCounts[a])
    .map(l => ({ key: l, display: l.replace(/^CRM:\s*/, ''), count: labelCounts[l] }));

  const visible = eligibleContacts.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterLabel) {
      const has = c.googleLabels.includes(filterLabel) || c.crmLabels.includes(filterLabel);
      if (!has) return false;
    }
    return true;
  }).sort((a, b) => importanceScore(b) - importanceScore(a));

  const toggleSelect = (id) => {
    setSelectedIds(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAllVisible = () => setSelectedIds(new Set(visible.map((c) => c.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleSubmit = () => {
    const picked = Array.from(selectedIds).map(id => eligibleContacts.find(c => c.id === id)).filter(Boolean);
    onPick(picked);
  };

  const { Icons } = window.TetherConstants;

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="p-6 space-y-4">
        <div className="flex gap-3 items-end flex-wrap">
          <label className="flex-1 min-w-[200px]">
            <span className="text-xs text-warm-600">Search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts…" autoFocus
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface" />
          </label>
          {extraTopContent}
        </div>

        <LabelFilter labels={allLabelsList} activeFilter={filterLabel} onFilterChange={setFilterLabel} />

        <div className="flex items-center justify-between text-xs text-warm-600">
          <span>{visible.length} matching · {selectedIds.size} selected</span>
          <div className="flex gap-3">
            <button onClick={selectAllVisible} className="underline hover:text-warm-900" disabled={visible.length === 0}>Select all visible</button>
            {selectedIds.size > 0 && <button onClick={clearSelection} className="underline hover:text-warm-900">Clear</button>}
          </div>
        </div>

        <div className="max-h-[40vh] overflow-y-auto border border-warm-200 rounded-lg divide-y divide-warm-100 bg-surface">
          {visible.length === 0 && <div className="p-4 text-sm text-warm-600 italic">No contacts match.</div>}
          {visible.map((c) => {
            const googleLabels = c.googleLabels.filter((l) => !l.startsWith('CRM:'));
            const isSelected = selectedIds.has(c.id);
            return (
              <button key={c.id} onClick={() => toggleSelect(c.id)}
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
          <Button onClick={handleSubmit} disabled={selectedIds.size === 0 || disableSubmit}>
            {submitText} {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

window.TetherTabs = window.TetherTabs || {};
window.TetherTabs.ContactPickerModal = ContactPickerModal;
