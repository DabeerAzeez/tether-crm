/* Tether — Onboarding screens (SignIn, SyncProgress, LabelMapping, CloseFriendPicker, Walkthrough).
   Exposes window.TetherOnboarding for use by other modules. */

const { useState, useEffect, useMemo, Fragment } = React;

const { Icons, RESERVED_LABELS, RESERVED_CATEGORIES, loadClientId } = window.TetherConstants;
const { Avatar, Button, Card, Tag, LabelPill } = window.TetherComponents;
const { useApp } = window.TetherContext;
const { geocodeMissingLocations } = window.TetherStorage;
const { daysSince, importanceScore } = window.TetherHelpers;

// ───────────────────────────────────────────────────────────────────
// ONBOARDING SHELL
// ───────────────────────────────────────────────────────────────────

function OnboardingShell({ step, title, subtitle, children }) {
  const steps = ['Sign in', 'Sync', 'Set up contacts', 'Walkthrough'];
  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-warm-100 to-sage-100 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-8 justify-center">
          {steps.map((s, i) => (
            <Fragment key={i}>
              <div className={`flex items-center gap-2 text-xs ${i + 1 < step ? 'text-sage-700' : i + 1 === step ? 'text-warm-900 font-medium' : 'text-warm-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${i + 1 < step ? 'bg-sage-500 text-white' : i + 1 === step ? 'bg-warm-900 text-warm-50' : 'bg-warm-200 text-warm-600'}`}>
                  {i + 1 < step ? '✓' : i + 1}
                </div>
                <span className="hidden sm:inline">{s}</span>
              </div>
              {i < steps.length - 1 && <div className="w-6 h-px bg-warm-300" />}
            </Fragment>
          ))}
        </div>
        <div className="bg-surface rounded-2xl shadow-sm border border-warm-100 p-8">
          <h1 className="font-serif text-3xl text-warm-900 mb-2">{title}</h1>
          <p className="text-warm-700 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SIGN-IN SCREEN
// ───────────────────────────────────────────────────────────────────

function SignInScreen() {
  const { setState } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const connectGoogle = async () => {
    setErr('');
    setBusy(true);
    try {
      const clientId = loadClientId();
      await window.TetherGoogle.init(clientId);
      await window.TetherGoogle.signIn({ prompt: 'consent' });
      const profile = await window.TetherGoogle.fetchProfile();
      setState((s) => ({
        ...s,
        phase: 'syncing',
        googleSignedIn: true,
        googleProfile: {
          name: profile.name || profile.email,
          email: profile.email,
          picture: profile.picture,
        },
        demoMode: false,
      }));
    } catch (e) {
      console.error(e);
      setErr(e && e.message ? e.message : 'Sign-in failed. Check that your OAuth Client ID is configured correctly.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-warm-50 via-warm-100 to-sage-100">
      <div className="flex flex-col items-center text-center max-w-md w-full gap-6">
        {/* Icon */}
        <div className="w-20 h-20 rounded-3xl bg-sage-600 flex items-center justify-center shadow-xl">
          <div className="text-warm-50" style={{ transform: 'scale(2.2)' }}>{Icons.logo}</div>
        </div>

        {/* Wordmark */}
        <span className="font-serif text-4xl font-semibold text-warm-900 tracking-tight">Tether</span>

        {/* Tagline */}
        <h1 className="font-serif text-2xl text-warm-800 leading-snug">
          Stay tethered to those who matter.
        </h1>

        {/* Subtitle */}
        <p className="text-warm-600 leading-relaxed text-sm max-w-xs">
          A private open-source tool to help you keep track of and keep in touch with the important people in your life.
        </p>

        {/* Sign-in button */}
        <div className="w-full max-w-xs space-y-3">
          <button
            id="signin-google-btn"
            onClick={connectGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl border border-warm-300 bg-surface hover:bg-warm-50 shadow-sm transition-all duration-200 disabled:opacity-60"
          >
            {Icons.google}
            <span className="font-medium text-warm-900">{busy ? 'Connecting…' : 'Sign in with Google'}</span>
          </button>
          {err && <div className="text-sm text-red-700 text-center rounded-lg bg-red-50 border border-red-200 px-3 py-2">{err}</div>}
        </div>

        {/* Footer */}
        <p className="text-xs text-warm-500">
          Free · Open source · No backend · Your data stays yours
        </p>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SYNC PROGRESS
// ───────────────────────────────────────────────────────────────────

function SyncProgress() {
  const { state, setState } = useApp();
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Loading your contacts…');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setErr('');

        let contacts, events;

        if (state.demoMode) {
          // Demo: animate fake progress then use already-loaded mock data
          const steps = [
            [25, 'Loading demo contacts…'],
            [60, 'Fetching demo calendar…'],
            [90, 'Computing importance ranking…'],
            [100, 'Done'],
          ];
          for (const [pct, label] of steps) {
            setProgress(pct); setStage(label);
            await new Promise((r) => setTimeout(r, 350));
          }
          contacts = state.contacts;
          events = state.events;
        } else if (state.isImporting) {
          // Manual import from Google Contacts
          const resultContacts = await window.TetherGoogle.importContactsFromGoogle(({ label, pct }) => {
            setProgress(Math.round(pct * 0.7));
            setStage(label);
          });
          contacts = resultContacts;
          // Refresh events too
          const syncRes = await window.TetherGoogle.loadFromDrive(() => { });
          events = syncRes.events;
        } else {
          // Regular load from Drive
          const result = await window.TetherGoogle.loadFromDrive(({ label, pct }) => {
            setProgress(Math.round(pct * 0.8));
            setStage(label);
          });
          contacts = result.contacts;
          events = result.events;
        }

        // Geocode any contacts missing coordinates
        if (contacts.length > 0) {
          const needsGeocode = contacts.filter(
            (c) => c.location && c.location.city && c.location.lat == null
          );
          if (needsGeocode.length > 0) {
            setStage(`Geocoding locations (${needsGeocode.length} contacts)…`);
            setProgress(85);
            contacts = await geocodeMissingLocations(contacts, (done, total, updated) => {
              contacts = updated;
              setProgress(85 + Math.round((done / total) * 14));
              setStage(`Geocoding locations… ${done}/${total}`);
            });
            // Persist geocoded coordinates back to Drive
            if (window.TetherGoogle && !state.demoMode) {
              await window.TetherGoogle.saveContacts(contacts).catch(() => { });
            }
          }
        }

        setProgress(100);
        setStage('Done');
        await new Promise((r) => setTimeout(r, 400));

        setState((s) => ({
          ...s,
          contacts,
          events,
          isImporting: false,
          lastSyncAt: new Date().toISOString(),
          phase: 'dashboard',
          activeTab: 'contacts',
        }));
      } catch (e) {
        console.error('Load failed:', e);
        setErr(e && e.message ? e.message : 'Failed to load contacts');
      }
    })();
  }, [setState]);

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-warm-50 via-warm-100 to-sage-100">
        <div className="max-w-lg w-full">
          <Card className="p-10">
            <div className="text-center mb-6">
              <h2 className="font-serif text-2xl text-warm-900 mb-2">Load failed</h2>
              <p className="text-red-700 text-sm">{err}</p>
            </div>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
              Reload and try again
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-warm-50 via-warm-100 to-sage-100">
      <div className="max-w-lg w-full">
        <Card className="p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-sage-100 mx-auto flex items-center justify-center mb-6">
            <div className="text-sage-700" style={{ transform: 'scale(2)' }}>{Icons.logo}</div>
          </div>
          <h2 className="font-serif text-2xl text-warm-900 mb-2">Loading your contacts</h2>
          <p className="text-warm-600 text-sm mb-8">Checking your private Drive storage…</p>
          <div className="w-full bg-warm-100 rounded-full h-2 overflow-hidden mb-3">
            <div className="bg-sage-500 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-warm-700">{stage}</p>
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// LABEL MAPPING
// ───────────────────────────────────────────────────────────────────

function LabelMappingScreen() {
  const { state, setState } = useApp();

  const labelCounts = useMemo(() => {
    const counts = {};
    state.contacts.forEach((c) => c.googleLabels.forEach((l) => { counts[l] = (counts[l] || 0) + 1; }));
    return counts;
  }, [state.contacts]);

  const existingLabels = Object.keys(labelCounts).sort((a, b) => labelCounts[b] - labelCounts[a]);
  const [mappings, setMappings] = useState(() => {
    const seed = {};
    existingLabels.forEach((l) => {
      if (/friend/i.test(l)) seed[l] = 'close';
      else if (/work/i.test(l)) seed[l] = 'professional';
      else if (/family/i.test(l)) seed[l] = 'family';
      else seed[l] = '';
    });
    return seed;
  });

  const applyMappings = () => {
    setState((s) => {
      const contacts = s.contacts.map((c) => {
        const additions = [];
        c.googleLabels.forEach((gl) => {
          const key = mappings[gl];
          if (!key) return;
          const cat = RESERVED_CATEGORIES.find((x) => x.key === key);
          if (cat && !c.crmLabels.includes(cat.label)) additions.push(cat.label);
        });
        const crmLabels = [...c.crmLabels, ...additions];
        const isClose = crmLabels.includes('CRM: Close Friends');
        const nudgeFrequencyDays = isClose && c.nudgeFrequencyDays == null
          ? s.nudges.defaultCloseFriendDays
          : c.nudgeFrequencyDays;
        return { ...c, crmLabels, nudgeFrequencyDays };
      });
      const anyClose = contacts.some((c) => c.crmLabels.includes('CRM: Close Friends'));
      return {
        ...s,
        contacts,
        onboardingMappings: mappings,
        phase: anyClose ? 'walkthrough' : 'setup-closefriends',
      };
    });
  };

  const skipAll = () => {
    setState((s) => ({ ...s, phase: 'setup-closefriends' }));
  };

  return (
    <OnboardingShell step={2} title="Map your labels" subtitle="We found these labels in your Google Contacts. Map each one to a Tether category to keep their meaning consistent here. Your original labels stay exactly as they are.">
      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
        {existingLabels.length === 0 && (
          <p className="text-warm-600 italic">No labels found. You'll pick close friends next.</p>
        )}
        {existingLabels.map((lbl) => (
          <div key={lbl} className="flex items-center justify-between gap-4 p-3 bg-surface rounded-xl border border-warm-200">
            <div className="flex items-center gap-3 min-w-0">
              <Tag label={lbl} />
              <span className="text-xs text-warm-500 whitespace-nowrap">{labelCounts[lbl]} contact{labelCounts[lbl] > 1 ? 's' : ''}</span>
            </div>
            <select
              value={mappings[lbl] || ''}
              onChange={(e) => setMappings((m) => ({ ...m, [lbl]: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-warm-300 bg-warm-50 text-sm min-w-[180px]"
            >
              <option value="">Skip — keep as-is</option>
              {RESERVED_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label.replace(/^CRM:\s*/, '')}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-6 pt-6 border-t border-warm-200">
        <Button variant="ghost" onClick={skipAll}>Skip, I'll do this later in Settings</Button>
        <Button onClick={applyMappings}>Apply mappings</Button>
      </div>
    </OnboardingShell>
  );
}

// ───────────────────────────────────────────────────────────────────
// CLOSE-FRIEND PICKER
// ───────────────────────────────────────────────────────────────────

function CloseFriendPicker() {
  const { state, setState } = useApp();

  const ranked = useMemo(() => {
    return [...state.contacts].sort((a, b) => importanceScore(b) - importanceScore(a)).slice(0, 20);
  }, [state.contacts]);

  const [selected, setSelected] = useState(() =>
    new Set(state.contacts.filter((c) => c.crmLabels.includes('CRM: Close Friends')).map((c) => c.id))
  );

  const toggle = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const applyAndContinue = () => {
    setState((s) => {
      const ids = Array.from(selected);
      const contacts = s.contacts.map((c) => {
        const shouldHave = selected.has(c.id);
        const hasLabel = c.crmLabels.includes('CRM: Close Friends');
        let crmLabels = c.crmLabels;
        if (shouldHave && !hasLabel) crmLabels = [...crmLabels, 'CRM: Close Friends'];
        if (!shouldHave && hasLabel) crmLabels = crmLabels.filter((l) => l !== 'CRM: Close Friends');
        const nudgeFrequencyDays = shouldHave ? (c.nudgeFrequencyDays || s.nudges.defaultCloseFriendDays) : c.nudgeFrequencyDays;
        return { ...c, crmLabels, nudgeFrequencyDays };
      });
      return { ...s, contacts, selectedCloseFriendIds: ids, phase: 'walkthrough' };
    });
  };

  return (
    <OnboardingShell step={3} title="Pick your close friends" subtitle="The more you add, the more nudges you'll get — pick as many as you can realistically keep up with. You can always change this later.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
        {ranked.map((c) => {
          const isOn = selected.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${isOn ? 'bg-sage-50 border-sage-400' : 'bg-surface border-warm-200 hover:border-warm-300'}`}
            >
              <Avatar contact={c} size={36} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-warm-900 truncate">{c.name}</div>
                <div className="text-xs text-warm-600 truncate">{c.location?.city}{c.custom?.company ? ` · ${c.custom.company}` : ''}</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 ${isOn ? 'bg-sage-500 border-sage-500' : 'border-warm-300'} flex items-center justify-center`}>
                {isOn && <div className="text-white scale-75">{Icons.check}</div>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-6 pt-6 border-t border-warm-200">
        <div className="text-sm text-warm-700">
          <span className="font-medium">{selected.size}</span> selected
          {selected.size >= 30 && <span className="ml-2 text-amber-700">· that's a lot to keep up with</span>}
        </div>
        <Button onClick={applyAndContinue} disabled={false}>
          Continue
        </Button>
      </div>
    </OnboardingShell>
  );
}

// ───────────────────────────────────────────────────────────────────
// WALKTHROUGH
// ───────────────────────────────────────────────────────────────────

const WALKTHROUGH_STEPS = [
  { tabKey: 'contacts', title: 'All Contacts', body: "All your contacts live here. Import from Google Contacts (or other sources) using the Import button. You can also manage labels and filter from this tab.", position: 'top' },
  { tabKey: 'reconnect', title: 'Reconnect', body: "Close friends you haven't contacted in a while surface here, alongside group check-ins and recent activity.", position: 'top' },
  { tabKey: 'map', title: 'Map', body: "Every contact with a location is pinned. Drop a pin anywhere to find who's nearby, sorted by distance or recency.", position: 'top' },
  { tabKey: 'calendar', title: 'Calendar', body: "Syncs with Google Calendar. Question-mark chips flag events where we suspect a contact was there — one click resolves them and logs the interaction.", position: 'top' },
  { tabKey: 'help', title: 'Help', body: "Help has docs and a button to rerun this walkthrough.", position: 'bottom' },
  { tabKey: 'settings', title: 'Settings', body: "Settings is where you configure your theme, LLM, and sync options.", position: 'bottom' },
];

function WalkthroughOverlay() {
  const { state, setState } = useApp();
  const [step, setStep] = useState(0);

  const current = WALKTHROUGH_STEPS[step];

  useEffect(() => {
    if (current.tabKey) {
      setState(s => ({ ...s, activeTab: current.tabKey }));
    }
  }, [step, current.tabKey, setState]);

  const finish = (skipped) => {
    setState((s) => ({ ...s, phase: 'dashboard', walkthroughDone: true, walkthroughSkippedToastAt: skipped ? Date.now() : null }));
  };

  const alignClass = current.position === 'bottom' ? 'items-end pb-12' : 'items-start pt-32';

  return (
    <div className={`fixed inset-0 z-50 flex ${alignClass} justify-start pl-8 sm:pl-[280px] pointer-events-none animate-fade-in`}>
      <div className="absolute inset-0 bg-warm-900/40 backdrop-blur-sm pointer-events-auto" />
      <div className="relative z-10 pointer-events-auto bg-warm-50 rounded-2xl max-w-sm w-full p-8 shadow-2xl animate-slide-up border border-warm-200">
        <div className="flex items-center gap-2 mb-6">
          {WALKTHROUGH_STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-sage-500' : 'bg-warm-200'}`} />
          ))}
        </div>
        <h3 className="font-serif text-2xl text-warm-900 mb-3">{current.title}</h3>
        <p className="text-warm-700 leading-relaxed mb-8 text-sm">{current.body}</p>
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => finish(true)}>Skip</Button>
          <div className="flex gap-2">
            {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
            {step < WALKTHROUGH_STEPS.length - 1
              ? <Button onClick={() => setStep(step + 1)}>Next</Button>
              : <Button onClick={() => finish(false)}>Start</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkippedWalkthroughToast() {
  const { state, setState } = useApp();
  useEffect(() => {
    if (state.walkthroughSkippedToastAt) {
      const t = setTimeout(() => setState((s) => ({ ...s, walkthroughSkippedToastAt: null })), 4500);
      return () => clearTimeout(t);
    }
  }, [state.walkthroughSkippedToastAt]);
  if (!state.walkthroughSkippedToastAt) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-warm-900 text-warm-50 px-4 py-2 rounded-xl shadow-lg text-sm z-50 animate-slide-up">
      You can rerun the walkthrough anytime from the Help tab.
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Expose on window
// ───────────────────────────────────────────────────────────────────

window.TetherOnboarding = {
  SignInScreen,
  SyncProgress,
  LabelMappingScreen,
  CloseFriendPicker,
  WalkthroughOverlay,
  SkippedWalkthroughToast,
};
