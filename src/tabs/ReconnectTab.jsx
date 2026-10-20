/* Tether — Reconnect tab component. */

const { useState, useEffect, useMemo } = React;
const { Icons } = window.TetherConstants;
const { Avatar, Button, Card, LabelPill } = window.TetherComponents;
const { useApp } = window.TetherContext;
const { useDrawer } = window.TetherDrawer;
const { daysSince, relativeDate, labelsFor } = window.TetherHelpers;

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
  const [nudgeDays, setNudgeDays] = useState(30);
  const ContactPickerModal = window.TetherTabs.ContactPickerModal;

  useEffect(() => {
    if (open) setNudgeDays(30);
  }, [open]);

  const eligible = state.contacts.filter((c) => c.nudgeFrequencyDays == null);

  const apply = (pickedContacts) => {
    const ids = pickedContacts.map(c => c.id);
    const days = Number(nudgeDays);
    if (ids.length === 0 || !days || days < 1) return;
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) => ids.includes(c.id) ? { ...c, nudgeFrequencyDays: days } : c),
    }));
    onClose();
  };

  return (
    <ContactPickerModal
      open={open}
      onClose={onClose}
      title="Add to Catch Up"
      eligibleContacts={eligible}
      onPick={apply}
      submitText="Add"
      disableSubmit={!nudgeDays || nudgeDays < 1}
      extraTopContent={
        <label>
          <span className="text-xs text-warm-600">Nudge every</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="number" min="1" value={nudgeDays}
              onChange={(e) => setNudgeDays(e.target.value)}
              className="w-20 px-3 py-2 rounded-lg border border-warm-300 bg-surface" />
            <span className="text-sm text-warm-600">days</span>
          </div>
        </label>
      }
    />
  );
}

window.TetherTabs = window.TetherTabs || {};
window.TetherTabs.ReconnectTab = ReconnectTab;
