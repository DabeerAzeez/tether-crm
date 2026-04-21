/* Tether — Personal CRM prototype (v0.4)
   Single-file React app. Uses window.TETHER_MOCK for seed data, window.L for Leaflet. */

const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext, Fragment } = React;

// ───────────────────────────────────────────────────────────────────
// Constants & helpers
// ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tether-state-v1';
const CLIENT_ID_KEY = 'tether-google-client-id';
const MULTI_COLOR = 'var(--cat-multi)';

const loadClientId = () => {
  try {
    return (window.TETHER_CONFIG?.GOOGLE_OAUTH_CLIENT_ID) || localStorage.getItem(CLIENT_ID_KEY) || '';
  } catch (e) { return ''; }
};
const saveClientId = (id) => {
  try { localStorage.setItem(CLIENT_ID_KEY, id); } catch (e) { }
};

// Tether no longer imposes its own category taxonomy — users organize contacts with the labels
// they already have in Google Contacts (plus any custom categories they create).
const RESERVED_CATEGORIES = [];

const daysSince = (iso) => {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
};
const relativeDate = (iso) => {
  const d = daysSince(iso);
  if (d === Infinity) return 'Unknown';
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) === 1 ? '' : 's'} ago`;
  if (d < 365) return `${Math.floor(d / 30)} month${Math.floor(d / 30) === 1 ? '' : 's'} ago`;
  return `${Math.floor(d / 365)} year${Math.floor(d / 365) === 1 ? '' : 's'} ago`;
};
const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const formatShort = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const uid = () => Math.random().toString(36).slice(2, 10);

const categoryKeyForLabel = (label) => {
  const hit = RESERVED_CATEGORIES.find((c) => c.label === label);
  return hit ? hit.key : null;
};
const categoryByKey = (key, customCategories = []) =>
  RESERVED_CATEGORIES.find((c) => c.key === key) ||
  customCategories.find((c) => c.key === key);

// Contact has CRM labels (array of strings like "CRM: Close Friends").
// Returns array of matching category objects.
const categoriesFor = (contact, customCategories = []) => {
  const all = [...RESERVED_CATEGORIES, ...customCategories];
  return contact.crmLabels
    .map((lbl) => all.find((c) => c.label === lbl))
    .filter(Boolean);
};
const colorFor = (contact, customCategories = []) => {
  const cats = categoriesFor(contact, customCategories);
  if (cats.length > 1) return MULTI_COLOR;
  if (cats.length === 1) return cats[0].color;
  return '#a98458'; // warm-500 for uncategorized
};

// Importance ranking (5.3)
const importanceScore = (c) => {
  let s = 0;
  if (c.googleLabels.length > 0) s += 2;
  if (c.crmLabels.length > 0) s += 5;
  if (c.nudgeFrequencyDays != null) s += 10; // user cares enough to set a nudge
  // Recent interactions boost
  const d = daysSince(c.lastContactedAt);
  if (d < 30) s += 5;
  else if (d < 90) s += 2;
  // Completeness
  if (c.name && c.phone && c.email) s += 3;
  else if (c.email || c.phone) s += 1;
  if (c.location) s += 1;
  return s;
};

// Geocode contacts that have a city/address but no lat/lng.
// Respects Nominatim's 1 req/sec limit. Calls onProgress(done, total, updatedContacts).
async function geocodeMissingLocations(contacts, onProgress) {
  const toGeocode = contacts.filter(
    (c) => c.location && c.location.city && c.location.lat == null
  );
  if (toGeocode.length === 0) return contacts;

  let updated = [...contacts];

  for (let i = 0; i < toGeocode.length; i++) {
    const c = toGeocode[i];
    try {
      const query = [c.location.city, c.location.country].filter(Boolean).join(', ');
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await r.json();
      if (data && data[0]) {
        updated = updated.map((x) =>
          x.id === c.id
            ? { ...x, location: { ...x.location, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } }
            : x
        );
      }
    } catch (e) { /* skip individual failures */ }

    if (onProgress) onProgress(i + 1, toGeocode.length, updated);
    // Nominatim rate limit: max 1 req/sec
    if (i < toGeocode.length - 1) await new Promise((res) => setTimeout(res, 1100));
  }

  return updated;
}

// ───────────────────────────────────────────────────────────────────
// Storage
// ───────────────────────────────────────────────────────────────────

const defaultState = () => ({
  phase: 'signin', // signin | syncing | setup-mapping | setup-closefriends | walkthrough | dashboard
  googleSignedIn: false,
  googleProfile: null,
  contacts: [],
  events: [],
  customCategories: [], // user-added CRM: labels
  theme: 'light', // light | dark
  activeTab: 'reconnect',
  llm: { provider: 'demo', apiKey: '', endpoint: '' },
  calendarWriteEnabled: false,
  nudges: {
    defaultCloseFriendDays: 30,
    groupCadence: {}, // key -> days
    emailDigest: false,
  },
  dismissedAttendeeIds: [],
  walkthroughDone: false,
  onboardingMappings: {}, // googleLabel -> crmKey
  selectedCloseFriendIds: [],
});

const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
};
const saveState = (s) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { }
};

// ───────────────────────────────────────────────────────────────────
// Icons (minimal SVG set)
// ───────────────────────────────────────────────────────────────────

const Icon = ({ d, className = 'w-5 h-5', stroke = 'currentColor', fill = 'none', strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);
const Icons = {
  reconnect: <Icon d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />,
  ask: <Icon d="M7 8h10M7 12h6M21 12a9 9 0 1 1-3.5-7.1L21 3v5h-5" />,
  map: <Icon d={<><path d="M9 20l-6-2V6l6 2m0 12l6-2m-6 2V8m6 10l6 2V8l-6-2m0 12V6" /></>} />,
  calendar: <Icon d={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>} />,
  contacts: <Icon d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>} />,
  help: <Icon d={<><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></>} />,
  settings: <Icon d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>} />,
  plus: <Icon d="M12 5v14M5 12h14" />,
  x: <Icon d="M18 6L6 18M6 6l12 12" />,
  check: <Icon d="M20 6L9 17l-5-5" />,
  send: <Icon d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  search: <Icon d={<><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></>} />,
  pin: <Icon d={<><path d="M20 10c0 7-8 13-8 13S4 17 4 10a8 8 0 1 1 16 0z" /><circle cx="12" cy="10" r="3" /></>} />,
  edit: <Icon d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />,
  externalLink: <Icon d={<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>} />,
  google: <svg viewBox="0 0 48 48" className="w-5 h-5"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.1 35 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.6l6.2 5.2C41.3 34.8 44 29.8 44 24c0-1.2-.1-2.4-.4-3.5z" /></svg>,
  logo: (
    <svg viewBox="0 0 32 32" className="w-6 h-6">
      <path d="M16 3c3 4 7 7 7 12a7 7 0 1 1-14 0c0-5 4-8 7-12z" fill="var(--sage-500)" />
      <path d="M16 11v15" stroke="var(--warm-800)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

// ───────────────────────────────────────────────────────────────────
// Small UI primitives
// ───────────────────────────────────────────────────────────────────

const Avatar = ({ contact, size = 40, ring = false }) => {
  const { initials, hue } = contact.avatar || { initials: (contact.name || '?').slice(0, 2).toUpperCase(), hue: 200 };
  const ringClass = ring ? 'ring-2 ring-warm-200 ring-offset-2 ring-offset-warm-50' : '';
  if (contact.photoUrl) {
    return (
      <img
        src={contact.photoUrl}
        alt={contact.name || ''}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover select-none ${ringClass}`}
        style={{ width: size, height: size }}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.nextSibling.style.display = 'flex';
        }}
      />
    );
  }
  return (
    <div
      className={`shrink-0 rounded-full flex items-center justify-center text-white font-semibold select-none ${ringClass}`}
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, hsl(${hue}, 55%, 55%), hsl(${(hue + 40) % 360}, 55%, 42%))`,
        fontSize: Math.max(10, Math.floor(size * 0.36)),
      }}
    >
      {initials}
    </div>
  );
};

const Button = ({ children, onClick, variant = 'primary', size = 'md', icon, className = '', disabled, type = 'button' }) => {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition select-none focus:ring-2 focus:ring-sage-400 focus:ring-offset-2 focus:ring-offset-warm-50';
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-5 py-3 text-base' };
  const variants = {
    primary: 'bg-sage-600 hover:bg-sage-700 text-warm-50 shadow-sm',
    secondary: 'bg-warm-100 hover:bg-warm-200 text-warm-800 border border-warm-200',
    ghost: 'text-warm-700 hover:bg-warm-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    outline: 'border border-warm-300 text-warm-800 hover:bg-warm-100',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      {icon}{children}
    </button>
  );
};

const Card = ({ children, className = '' }) => (
  <div className={`bg-surface rounded-2xl shadow-sm border border-warm-100 ${className}`}>{children}</div>
);

const CategoryPill = ({ category, onRemove }) => {
  const isVar = category.color?.startsWith('var(');
  const style = isVar ? {
    background: category.bg,
    color: category.color,
    border: `1px solid ${category.border}`,
  } : {
    background: `${category.color}1a`,
    color: category.color,
    border: `1px solid ${category.color}33`,
  };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={style}>
      <span className="w-2 h-2 rounded-full" style={{ background: category.color }} />
      {category.label.replace(/^CRM:\s*/, '')}
      {onRemove && (
        <button onClick={onRemove} className="ml-1 opacity-60 hover:opacity-100">×</button>
      )}
    </span>
  );
};

const Tag = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-warm-100 text-warm-700 border border-warm-200">
    {label}
    {onRemove && <button onClick={onRemove} className="opacity-60 hover:opacity-100">×</button>}
  </span>
);

const SectionHeader = ({ children, action, sub }) => (
  <div className="flex items-center justify-between mb-3">
    <div>
      <h3 className="font-serif text-lg text-warm-900">{children}</h3>
      {sub && <p className="text-xs text-warm-600 mt-0.5">{sub}</p>}
    </div>
    {action}
  </div>
);

const Modal = ({ open, onClose, children, title, size = 'md' }) => {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center drawer-backdrop bg-warm-900/40 animate-fade-in" onClick={onClose}>
      <div className={`bg-warm-50 rounded-2xl shadow-xl w-full ${sizes[size]} mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-slide-up`} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200">
            <h2 className="font-serif text-xl text-warm-900">{title}</h2>
            <button onClick={onClose} className="text-warm-600 hover:text-warm-900">{Icons.x}</button>
          </div>
        )}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// App context
// ───────────────────────────────────────────────────────────────────

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

function AppProvider({ children }) {
  const [state, setStateRaw] = useState(() => {
    const loaded = loadState();
    return loaded || defaultState();
  });

  const setState = useCallback((updater) => {
    setStateRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveState(next);
      return next;
    });
  }, []);

  // Restore Google token on page load so writes work without re-signing in
  useEffect(() => {
    const s = loadState();
    if (s && s.googleSignedIn && !s.demoMode && window.TetherGoogle) {
      window.TetherGoogle.init(loadClientId())
        .then(() => window.TetherGoogle.tryRestoreToken())
        .catch(() => { });
    }
  }, []);

  // ── Contact ops
  const updateContact = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, [setState]);

  const addCrmLabelToContact = useCallback((id, label) => {
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) => c.id === id
        ? { ...c, crmLabels: c.crmLabels.includes(label) ? c.crmLabels : [...c.crmLabels, label] }
        : c),
    }));
  }, [setState]);

  const removeCrmLabelFromContact = useCallback((id, label) => {
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) => c.id === id
        ? { ...c, crmLabels: c.crmLabels.filter((l) => l !== label) }
        : c),
    }));
  }, [setState]);

  const logInteraction = useCallback((contactId, { date, type, note, location }) => {
    const iso = date || new Date().toISOString();
    const entry = { id: uid(), date: iso, type, note: note || '', location: location || '' };
    setState((s) => {
      const contact = s.contacts.find((c) => c.id === contactId);
      const contacts = s.contacts.map((c) => c.id === contactId
        ? {
          ...c,
          interactions: [entry, ...c.interactions],
          lastContactedAt: iso,
          lastContactedDaysAgo: daysSince(iso),
        } : c);
      // Also surface on Calendar tab as a synthetic "Personal CRM" event
      const syntheticEvent = {
        id: `log-${entry.id}`,
        title: `${contact?.name || 'Contact'} — ${type}`,
        start: iso, end: iso,
        location: location || '',
        description: note || '',
        guestEmails: contact?.email ? [contact.email] : [],
        synthetic: true,
      };
      return { ...s, contacts, events: [syntheticEvent, ...s.events] };
    });
  }, [setState]);

  const logInteractionMany = useCallback((contactIds, data) => {
    contactIds.forEach((id) => logInteraction(id, data));
  }, [logInteraction]);

  // ── Category ops
  const allCategories = useMemo(() => [...RESERVED_CATEGORIES, ...state.customCategories], [state.customCategories]);

  // ── Event / attendee ops
  const addGuestToEvent = useCallback((eventId, contactId) => {
    setState((s) => {
      const contact = s.contacts.find((c) => c.id === contactId);
      if (!contact) return s;
      const email = contact.email || `${contact.id}@contact.local`;
      const events = s.events.map((e) => {
        if (e.id !== eventId) return e;
        const guestEmails = e.guestEmails.includes(email) ? e.guestEmails : [...e.guestEmails, email];
        return { ...e, guestEmails };
      });
      return { ...s, events };
    });
  }, [setState]);

  const removeGuestFromEvent = useCallback((eventId, email) => {
    setState((s) => {
      const events = s.events.map((e) => {
        if (e.id !== eventId) return e;
        const guestEmails = e.guestEmails.filter((em) => em.toLowerCase() !== email.toLowerCase());
        return { ...e, guestEmails };
      });
      return { ...s, events };
    });
  }, [setState]);

  const resolveEventAttendee = useCallback((eventId, contactId, hintFirstName) => {
    setState((s) => {
      const contact = s.contacts.find((c) => c.id === contactId);
      const events = s.events.map((e) => {
        if (e.id !== eventId) return e;
        const email = contact?.email || `${contact?.id}@contact.local`;
        const guestEmails = e.guestEmails.includes(email) ? e.guestEmails : [...e.guestEmails, email];
        return { ...e, guestEmails, resolvedAt: new Date().toISOString() };
      });
      const ev = s.events.find((e) => e.id === eventId);
      const interactionDate = ev ? ev.start : new Date().toISOString();
      const entry = { id: uid(), date: interactionDate, type: 'hangout', note: `Resolved from "${ev?.title}"` };
      const contacts = s.contacts.map((c) => c.id === contactId
        ? {
          ...c,
          interactions: [entry, ...c.interactions],
          lastContactedAt: interactionDate > (c.lastContactedAt || '') ? interactionDate : c.lastContactedAt,
          lastContactedDaysAgo: Math.min(c.lastContactedDaysAgo, daysSince(interactionDate)),
        } : c);
      const dismissKey = hintFirstName ? `${eventId}:${hintFirstName.toLowerCase()}` : null;
      const dismissedAttendeeIds = dismissKey && !s.dismissedAttendeeIds.includes(dismissKey)
        ? [...s.dismissedAttendeeIds, dismissKey]
        : s.dismissedAttendeeIds;
      return { ...s, events, contacts, dismissedAttendeeIds };
    });
  }, [setState]);

  const dismissAttendee = useCallback((eventId, name) => {
    setState((s) => ({
      ...s,
      dismissedAttendeeIds: [...s.dismissedAttendeeIds, `${eventId}:${name.toLowerCase()}`],
    }));
  }, [setState]);

  const addCustomCategory = useCallback((label, color) => {
    const key = label.replace(/^CRM:\s*/, '').toLowerCase().replace(/\s+/g, '-');
    const full = label.startsWith('CRM:') ? label : `CRM: ${label}`;
    setState((s) => ({
      ...s,
      customCategories: [...s.customCategories, { key, label: full, color }],
    }));
  }, [setState]);

  const setTheme = useCallback((theme) => {
    setState((s) => ({ ...s, theme }));
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [setState]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
  }, [state.theme]);

  const value = {
    state, setState,
    updateContact, addCrmLabelToContact, removeCrmLabelFromContact,
    logInteraction, logInteractionMany,
    resolveEventAttendee, dismissAttendee,
    addGuestToEvent, removeGuestFromEvent,
    addCustomCategory, setTheme,
    allCategories,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

// ───────────────────────────────────────────────────────────────────
// SIGN-IN SCREEN
// ───────────────────────────────────────────────────────────────────

function SignInScreen() {
  const { setState } = useApp();
  const [clientId, setClientId] = useState(() => loadClientId());
  const [editingId, setEditingId] = useState(() => !loadClientId());
  const [pendingId, setPendingId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const saveClient = () => {
    const v = pendingId.trim();
    if (!v) { setErr('Paste the OAuth Client ID first.'); return; }
    saveClientId(v);
    setClientId(v);
    setEditingId(false);
    setErr('');
  };

  const connectGoogle = async () => {
    setErr('');
    setBusy(true);
    try {
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
      setErr(e && e.message ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const useDemo = () => {
    const mock = window.TETHER_MOCK;
    setState((s) => ({
      ...s,
      phase: 'syncing',
      googleSignedIn: true,
      googleProfile: mock.googleProfile,
      contacts: mock.contacts.map((c) => ({ ...c, crmLabels: [] })),
      events: mock.events.map((e) => ({ ...e })),
      demoMode: true,
    }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-warm-50 via-warm-100 to-sage-100">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-sage-600 flex items-center justify-center shadow-lg">
              <div className="scale-150 text-warm-50">{Icons.logo}</div>
            </div>
            <span className="font-serif text-3xl font-semibold text-warm-900">Tether</span>
          </div>
          <h1 className="font-serif text-4xl text-warm-900 mb-3">Stay tethered to the people who matter.</h1>
          <p className="text-warm-700 leading-relaxed">
            A private, open-source personal CRM that sits on top of your Google Contacts and Calendar.
          </p>
        </div>

        <Card className="p-8">
          {editingId ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-warm-900">Google OAuth Client ID</span>
                <input
                  value={pendingId}
                  onChange={(e) => setPendingId(e.target.value)}
                  placeholder="123456789-abc.apps.googleusercontent.com"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-warm-300 bg-surface font-mono text-xs"
                />
              </label>
              {err && <div className="text-sm text-red-700">{err}</div>}
              <div className="flex gap-2">
                <Button onClick={saveClient} className="flex-1">Save Client ID</Button>
                {clientId && <Button variant="ghost" onClick={() => { setEditingId(false); setErr(''); }}>Cancel</Button>}
              </div>
              <button onClick={() => setShowSetup((v) => !v)} className="text-xs text-sage-700 hover:underline">
                {showSetup ? 'Hide' : 'Show'} setup instructions
              </button>
              {showSetup && (
                <div className="bg-warm-100 rounded-lg p-4 text-xs text-warm-800 space-y-2 leading-relaxed">
                  <p><strong>One-time setup in Google Cloud:</strong></p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open <a className="underline text-sage-700" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">console.cloud.google.com</a> and create (or pick) a project.</li>
                    <li>Enable <strong>People API</strong> and <strong>Google Calendar API</strong> under APIs &amp; Services → Library.</li>
                    <li>Under APIs &amp; Services → OAuth consent screen, create an "External" app, add your Gmail as a test user, and add scopes: <code className="font-mono">/auth/contacts</code>, <code className="font-mono">/auth/calendar.readonly</code>, <code className="font-mono">profile</code>, <code className="font-mono">email</code>.</li>
                    <li>Under Credentials → Create Credentials → <strong>OAuth client ID</strong> → Web application. Add this origin to <em>Authorized JavaScript origins</em>:
                      <div className="mt-1 font-mono bg-surface px-2 py-1 rounded border border-warm-300 break-all">{origin || '(open this page via http/https first)'}</div>
                    </li>
                    <li>Copy the Client ID and paste it above.</li>
                  </ol>
                  {origin.startsWith('file://') && (
                    <p className="text-red-700"><strong>Note:</strong> Google OAuth does not allow <code>file://</code> origins. Serve this folder over HTTP (e.g. <code className="font-mono">python -m http.server</code> or VS Code Live Server) and reopen.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={connectGoogle}
                disabled={busy}
                className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl border border-warm-300 bg-surface hover:bg-warm-50 shadow-sm transition disabled:opacity-60"
              >
                {Icons.google}
                <span className="font-medium text-warm-900">{busy ? 'Connecting…' : 'Sign in with Google'}</span>
              </button>
              {err && <div className="text-sm text-red-700 mt-3">{err}</div>}
              <p className="text-xs text-warm-600 text-center mt-4">
                Requests read access to Contacts, Contacts write, and Calendar read. Calendar write is deferred.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs text-warm-600">
                <span className="font-mono truncate max-w-[60%]" title={clientId}>Client ID: {clientId.slice(0, 12)}…</span>
                <button onClick={() => { setPendingId(clientId); setEditingId(true); }} className="text-sage-700 hover:underline">Change</button>
              </div>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-warm-200 text-center">
            <button onClick={useDemo} className="text-xs text-warm-600 hover:text-warm-900 underline">
              Or explore with mock data (no Google account)
            </button>
          </div>
        </Card>

        <p className="text-center text-xs text-warm-500 mt-6">
          Free · Open source · No project-owned backend · Your data stays yours
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
  const [stage, setStage] = useState('Syncing your network…');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setErr('');

        let contacts, events;

        if (state.demoMode) {
          // Demo: animate fake progress then use already-loaded mock data
          const steps = [
            [15, 'Loading demo contacts…'],
            [40, 'Mapping mock labels…'],
            [70, 'Fetching demo calendar…'],
            [90, 'Computing importance ranking…'],
            [100, 'Done'],
          ];
          for (const [pct, label] of steps) {
            setProgress(pct); setStage(label);
            await new Promise((r) => setTimeout(r, 350));
          }
          contacts = state.contacts;
          events = state.events;
        } else {
          // Real sync — single call, captures result
          const result = await window.TetherGoogle.syncAll(({ label, pct }) => {
            setProgress(Math.round(pct * 0.65));
            setStage(label);
          });
          contacts = result.contacts;
          events = result.events;
        }

        // Geocode contacts that have a city but no coordinates
        const needsGeocode = contacts.filter(
          (c) => c.location && c.location.city && c.location.lat == null
        );
        if (needsGeocode.length > 0) {
          setStage(`Geocoding map locations (${needsGeocode.length} contacts)…`);
          setProgress(66);
          contacts = await geocodeMissingLocations(contacts, (done, total, updated) => {
            contacts = updated;
            setProgress(66 + Math.round((done / total) * 32));
            setStage(`Geocoding map locations… ${done}/${total}`);
          });
        }

        setProgress(100);
        setStage('Done');
        await new Promise((r) => setTimeout(r, 500));

        setState((s) => ({
          ...s,
          contacts,
          events,
          lastSyncAt: new Date().toISOString(),
          phase: 'walkthrough',
        }));
      } catch (e) {
        console.error('Sync failed:', e);
        setErr(e && e.message ? e.message : 'Sync failed');
      }
    })();
  }, [setState]);

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-warm-50 via-warm-100 to-sage-100">
        <div className="max-w-lg w-full">
          <Card className="p-10">
            <div className="text-center mb-6">
              <h2 className="font-serif text-2xl text-warm-900 mb-2">Sync failed</h2>
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
            <div className="scale-[2] text-sage-700">{Icons.logo}</div>
          </div>
          <h2 className="font-serif text-2xl text-warm-900 mb-2">Syncing your network</h2>
          <p className="text-warm-600 text-sm mb-8">One-time sync. After this, use "Sync now" from Settings.</p>
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
// LABEL MAPPING (existing Google labels → CRM categories)
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
    // Seed sensible defaults based on label names
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
        // Seed default nudge frequency for newly minted close friends
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
        // Seed nudge frequency for close friends
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
// WALKTHROUGH
// ───────────────────────────────────────────────────────────────────

const WALKTHROUGH_STEPS = [
  { tabKey: 'reconnect', title: 'Reconnect', body: "Your landing tab. Close friends you haven't contacted in a while surface here, alongside group check-ins and recent activity.", position: 'top' },
  { tabKey: 'ask', title: 'Ask', body: "Chat over your network. Ask things like 'Who do I know in Berlin?' or 'Which friends are into climbing?' — configure an LLM in Settings, or use the built-in demo matcher.", position: 'top' },
  { tabKey: 'map', title: 'Map', body: "Every contact with a location is pinned. Drop a pin anywhere to find who's nearby, sorted by distance or recency.", position: 'top' },
  { tabKey: 'calendar', title: 'Calendar', body: "Syncs with Google Calendar. Question-mark chips flag events where we suspect a contact was there — one click resolves them and logs the interaction.", position: 'top' },
  { tabKey: 'contacts', title: 'All Contacts', body: "Every contact Google knows about. Default sort is our importance ranking — tweak from the header.", position: 'top' },
  { tabKey: 'help', title: 'Help', body: "Help has docs and a button to rerun this walkthrough.", position: 'bottom' },
  { tabKey: 'settings', title: 'Settings', body: "Settings is where you change theme, LLM config, and sync options.", position: 'bottom' },
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
// SIDEBAR
// ───────────────────────────────────────────────────────────────────

const NAV = [
  { key: 'reconnect', label: 'Reconnect', icon: Icons.reconnect },
  { key: 'ask', label: 'Ask', icon: Icons.ask },
  { key: 'map', label: 'Map', icon: Icons.map },
  { key: 'calendar', label: 'Calendar', icon: Icons.calendar },
  { key: 'contacts', label: 'All Contacts', icon: Icons.contacts },
];
const NAV_UTIL = [
  { key: 'help', label: 'Help', icon: Icons.help },
  { key: 'settings', label: 'Settings', icon: Icons.settings },
];

function Sidebar() {
  const { state, setState } = useApp();
  const setTab = (key) => setState((s) => ({ ...s, activeTab: key }));
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
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map((item) => {
          const active = state.activeTab === item.key;
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
      <div className="px-3 py-3 border-t border-warm-200 space-y-1">
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
      {state.googleProfile && (
        <div className="p-4 border-t border-warm-200 flex items-center gap-3">
          <Avatar contact={{ name: state.googleProfile.name, avatar: state.googleProfile.picture }} size={32} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-warm-900 truncate">{state.googleProfile.name}</div>
            <div className="text-xs text-warm-600 truncate">{state.googleProfile.email}</div>
          </div>
        </div>
      )}
    </aside>
  );
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

// ───────────────────────────────────────────────────────────────────
// LOCATION AUTOCOMPLETE
// ───────────────────────────────────────────────────────────────────

function LocationAutocomplete({ value, onChange }) {
  const displayVal = value ? [value.city, value.country].filter(Boolean).join(', ') : '';
  const [query, setQuery] = useState(displayVal);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  // Sync display when value changes externally
  useEffect(() => {
    const d = value ? [value.city, value.country].filter(Boolean).join(', ') : '';
    setQuery(d);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = (q) => {
    clearTimeout(timerRef.current);
    if (!q || q.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`;
        const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        const data = await r.json();
        setSuggestions(data || []);
        setOpen((data || []).length > 0);
      } catch (e) {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const select = (item) => {
    const addr = item.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || item.display_name.split(',')[0].trim();
    const country = addr.country || '';
    setQuery([city, country].filter(Boolean).join(', '));
    setSuggestions([]);
    setOpen(false);
    onChange({ city, country, lat: parseFloat(item.lat), lng: parseFloat(item.lon), raw: item.display_name });
  };

  const fmt = (item) => {
    const addr = item.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || item.display_name.split(',')[0].trim();
    const region = addr.state || addr.region || '';
    const country = addr.country || '';
    return { city, sub: [region, country].filter(Boolean).join(', ') };
  };

  const clear = () => { setQuery(''); setSuggestions([]); setOpen(false); onChange(null); };

  return (
    <div ref={wrapRef} className="relative flex-1">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Type a city or place…"
          className="w-full px-3 py-1.5 pr-8 rounded-lg border border-warm-300 bg-surface text-sm focus:outline-none focus:border-sage-500"
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 text-xs animate-pulse">…</span>}
        {!loading && query && (
          <button onMouseDown={clear} className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-700 text-base leading-none">×</button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-warm-200 rounded-xl shadow-xl overflow-hidden">
          {suggestions.map((item, i) => {
            const { city, sub } = fmt(item);
            return (
              <button key={i} onMouseDown={() => select(item)}
                className="w-full text-left px-3 py-2.5 hover:bg-warm-50 border-b border-warm-100 last:border-0 transition">
                <div className="text-sm font-medium text-warm-900">{city}</div>
                {sub && <div className="text-xs text-warm-500 mt-0.5">{sub}</div>}
              </button>
            );
          })}
          <div className="px-3 py-1.5 bg-warm-50 border-t border-warm-100">
            <p className="text-xs text-warm-500">Powered by OpenStreetMap · city names work fine</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// CONTACT DRAWER
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

function ContactDrawer() {
  const { state, updateContact, addCrmLabelToContact, removeCrmLabelFromContact, allCategories } = useApp();
  const { contactId, close, openLog } = useDrawer();
  const contact = contactId ? state.contacts.find((c) => c.id === contactId) : null;
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncErrorMsg, setSyncErrorMsg] = useState('');

  useEffect(() => {
    if (contact) setDraft({ ...contact });
    setEdit(false);
    setSyncErrorMsg('');
  }, [contactId]);

  if (!contact || !draft) return null;

  const save = async () => {
    const patch = {
      name: draft.name, email: draft.email, phone: draft.phone,
      linkedin: draft.linkedin, instagram: draft.instagram, facebook: draft.facebook, website: draft.website,
      notes: draft.notes,
      custom: draft.custom,
      nudgeFrequencyDays: draft.nudgeFrequencyDays,
      location: draft.location,
    };
    if (!state.demoMode && window.TetherGoogle && window.TetherGoogle.hasToken()) {
      setSaving(true);
      try {
        const newEtag = await window.TetherGoogle.updatePerson(contact, patch);
        updateContact(contact.id, { ...patch, ...(newEtag ? { etag: newEtag } : {}) });
        setEdit(false);
      } catch (e) {
        console.error('[Tether] Sync failed:', e);
        setSyncErrorMsg(e?.result?.error?.message || e?.message || 'Unknown error');
      } finally {
        setSaving(false);
      }
    } else {
      updateContact(contact.id, patch);
      setEdit(false);
    }
  };

  const cats = categoriesFor(contact, state.customCategories);
  const availableCats = allCategories.filter((c) => !contact.crmLabels.includes(c.label));
  const nonCrmLabels = contact.googleLabels;

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end animate-fade-in" onClick={close}>
        <div className="absolute inset-0 bg-warm-900/40 drawer-backdrop" />
        <div className="relative w-full max-w-xl bg-warm-50 h-full overflow-y-auto shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-warm-200 flex items-start gap-4">
            <Avatar contact={contact} size={64} ring />
            <div className="flex-1 min-w-0">
              {edit ? (
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="font-serif text-2xl w-full bg-transparent border-b border-warm-300 focus:border-sage-500 py-1" />
              ) : (
                <h2 className="font-serif text-2xl text-warm-900">{contact.name}</h2>
              )}

              <div className="mt-1 flex flex-wrap gap-1.5">
                {nonCrmLabels.map((l) => <Tag key={l} label={l} />)}
              </div>
            </div>
            <button onClick={close} className="text-warm-600 hover:text-warm-900 p-1">{Icons.x}</button>
          </div>

          {/* Add category + actions */}
          <div className="px-6 py-3 bg-warm-100/50 border-b border-warm-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" icon={Icons.plus} onClick={() => openLog(contact.id)}>Log interaction</Button>
              {availableCats.length > 0 && (
                <select onChange={(e) => { if (e.target.value) addCrmLabelToContact(contact.id, e.target.value); e.target.value = ''; }}
                  className="px-3 py-1.5 rounded-lg border border-warm-300 bg-surface text-sm" defaultValue="">
                  <option value="">+ Add category</option>
                  {availableCats.map((c) => <option key={c.key} value={c.label}>{c.label.replace(/^CRM:\s*/, '')}</option>)}
                </select>
              )}
            </div>
            <div className="flex gap-2">
              {edit ? (
                <>
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setDraft({ ...contact }); setEdit(false); }}>Cancel</Button>
                  <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save to Google'}</Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" icon={Icons.edit} onClick={() => setEdit(true)}>Edit</Button>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Contact info */}
            <section>
              <SectionHeader>Contact</SectionHeader>
              <div className="space-y-2 text-sm">
                {['email', 'phone'].map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <span className="w-20 text-warm-600 capitalize">{f}</span>
                    {edit ? (
                      <input value={draft[f] || ''} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-warm-300 bg-surface" />
                    ) : <span className="text-warm-900">{contact[f] || '—'}</span>}
                  </div>
                ))}
                <div className="flex items-start gap-3">
                  <span className="w-20 text-warm-600 pt-1.5">Location</span>
                  {edit ? (
                    <LocationAutocomplete
                      value={draft.location}
                      onChange={(loc) => setDraft({ ...draft, location: loc })}
                    />
                  ) : (
                    <span className="text-warm-900 pt-1">
                      {contact.location?.city ? [contact.location.city, contact.location.country].filter(Boolean).join(', ') : '—'}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Social */}
            <section>
              <SectionHeader>Links</SectionHeader>
              <div className="space-y-2 text-sm">
                {['linkedin', 'instagram', 'facebook', 'website'].map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <span className="w-20 text-warm-600 capitalize">{f}</span>
                    {edit ? (
                      <input value={draft[f] || ''} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-warm-300 bg-surface" placeholder="Paste URL or handle" />
                    ) : contact[f] ? <span className="text-warm-900 truncate">{contact[f]}</span> : <span className="text-warm-500">—</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-warm-500 mt-2 italic">Tether stores links but does not scrape these services.</p>
            </section>

            {/* Custom */}
            <section>
              <SectionHeader>Custom fields</SectionHeader>
              <div className="space-y-2 text-sm">
                {['company', 'title', 'howWeMet'].map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <span className="w-24 text-warm-600">{f === 'howWeMet' ? 'How we met' : f.charAt(0).toUpperCase() + f.slice(1)}</span>
                    {edit ? (
                      <input value={draft.custom?.[f] || ''} onChange={(e) => setDraft({ ...draft, custom: { ...draft.custom, [f]: e.target.value } })}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-warm-300 bg-surface" />
                    ) : <span className="text-warm-900">{contact.custom?.[f] || '—'}</span>}
                  </div>
                ))}
                <div className="flex items-start gap-3">
                  <span className="w-24 text-warm-600">Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(contact.skills || []).map((s) => <Tag key={s} label={s} />)}
                    {(!contact.skills || contact.skills.length === 0) && <span className="text-warm-500">—</span>}
                  </div>
                </div>
              </div>
            </section>

            {/* Notes */}
            <section>
              <SectionHeader>Notes</SectionHeader>
              {edit ? (
                <textarea value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  rows={5} className="w-full p-3 rounded-lg border border-warm-300 bg-surface text-sm" />
              ) : (
                <div className="note text-sm text-warm-800 leading-relaxed whitespace-pre-wrap">{contact.notes || '—'}</div>
              )}
            </section>

            {/* Nudge */}
            <section>
              <SectionHeader>Nudge frequency</SectionHeader>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-warm-600">Remind me every</span>
                {edit ? (
                  <input type="number" min="0" value={draft.nudgeFrequencyDays || ''}
                    onChange={(e) => setDraft({ ...draft, nudgeFrequencyDays: e.target.value ? Number(e.target.value) : null })}
                    className="w-20 px-2 py-1.5 rounded-lg border border-warm-300 bg-surface" />
                ) : <span className="font-medium text-warm-900">{contact.nudgeFrequencyDays || '—'}</span>}
                <span className="text-warm-600">days</span>
              </div>
            </section>

            {/* History */}
            <section>
              <SectionHeader>Interaction history</SectionHeader>
              <div className="space-y-2">
                {contact.interactions.map((i) => (
                  <div key={i.id} className="flex items-start gap-3 p-3 bg-surface rounded-lg border border-warm-200">
                    <div className="w-2 h-2 rounded-full bg-sage-500 mt-2" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-warm-900 capitalize">{i.type}</span>
                        <span className="text-warm-500">· {formatDate(i.date)} ({relativeDate(i.date)})</span>
                      </div>
                      {i.note && <div className="text-xs text-warm-700 mt-0.5">{i.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
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
// RECONNECT TAB
// ───────────────────────────────────────────────────────────────────

// Nudge days = nudgeFrequencyDays - daysSinceLastContact.
// A positive value means you're on track (green); the contact still has time before you're due to
// reach out. A negative value means you've fallen behind — the nudge deadline has passed and you
// owe them a message. Cards are sorted ascending by nudge days so the most overdue appear first.
// The left-side color bar maps nudge days to a red→green gradient (clamped to ±30 days).
const nudgeDaysColor = (daysRemaining) => {
  if (daysRemaining == null) return 'transparent';
  const clamped = Math.max(-30, Math.min(30, daysRemaining));
  const hue = Math.round(((clamped + 30) / 60) * 120); // -30 → hue 0 (red), +30 → hue 120 (green)
  return `hsl(${hue}, 65%, 48%)`;
};

function ReconnectTab() {
  const { state, setState } = useApp();
  const { open: openDrawer, openLog } = useDrawer();
  const [addOpen, setAddOpen] = useState(false);

  // The Catch Up list is anyone with a nudge frequency set — the user opts a contact in
  // explicitly, regardless of which Google/custom category they belong to.
  // Sort ascending by nudge days remaining (most overdue first). Contacts with no logged
  // interactions (daysAgo === Infinity) sort above everyone as an error/empty state.
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

  const upcoming = useMemo(() =>
    state.events
      .filter((e) => new Date(e.start) > new Date())
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 5),
    [state.events]
  );

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-warm-900">Reconnect</h1>
        <p className="text-warm-600 mt-1">Who needs a little warmth today.</p>
      </div>

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
              const errorState = c._noHistory; // no interactions logged yet
              const cats = categoriesFor(c, state.customCategories);
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
                          {cats.map((x) => <CategoryPill key={x.key} category={x} />)}
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
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// ADD-TO-CATCH-UP MODAL
// ───────────────────────────────────────────────────────────────────
// Lets users bulk-add contacts to the Catch Up list by setting a shared nudge frequency.
// Supports searching by name and filtering by label (Google label or custom category),
// so you can e.g. add every "Improv Members" contact at once with a 20-day nudge.

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

  // Only show contacts not already on the catch-up list
  const eligible = state.contacts.filter((c) => c.nudgeFrequencyDays == null);

  // All distinct labels across eligible contacts (Google labels + custom CRM labels, minus the
  // legacy "CRM:" reserved prefixes which no longer exist)
  const labelCounts = {};
  eligible.forEach((c) => {
    c.googleLabels.filter((l) => !l.startsWith('CRM:')).forEach((l) => { labelCounts[l] = (labelCounts[l] || 0) + 1; });
    c.crmLabels.forEach((l) => { labelCounts[l] = (labelCounts[l] || 0) + 1; });
  });
  const allLabels = Object.keys(labelCounts).sort((a, b) => labelCounts[b] - labelCounts[a]);

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

        {allLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-warm-600 mr-1">Filter by label:</span>
            <button onClick={() => setFilterLabel(null)}
              className={`text-xs px-2 py-1 rounded-full transition ${filterLabel == null ? 'bg-sage-600 text-white' : 'bg-warm-100 text-warm-700 hover:bg-warm-200'}`}>
              All
            </button>
            {allLabels.map((l) => (
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

function AllContactsTab() {
  const { state, allCategories } = useApp();
  const { open: openDrawer } = useDrawer();
  const [sort, setSort] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');

  const handleSort = (key) => {
    if (sort === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setSortDir('asc'); }
  };

  const sortArrow = (col) => {
    if (sort !== col) return <span className="ml-1 opacity-30 text-xs">↕</span>;
    return <span className="ml-1 text-xs text-sage-600">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const rows = useMemo(() => {
    let r = [...state.contacts];
    if (query) {
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
        const match = allCategories.find((cat) => cat.key === filter);
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
    if (sort === 'category') r.sort((a, b) => {
      const getCat = (c) => {
        const labels = c.googleLabels || [];
        // Ignore generic system labels if others exist
        const filtered = labels.filter(l => !['My Contacts', 'Starred', 'Chatted'].includes(l));
        const first = filtered[0] || labels[0] || '';
        return first.replace(/^CRM:\s*/i, '').trim().toLowerCase();
      };
      const catA = getCat(a);
      const catB = getCat(b);
      
      if (catA === catB) return a.name.localeCompare(b.name) * dir;
      if (catA === '') return 1;  // Empty always at bottom
      if (catB === '') return -1;
      
      return catA.localeCompare(catB) * dir;
    });
    return r;
  }, [state.contacts, sort, sortDir, filter, query, allCategories]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="font-serif text-3xl text-warm-900">All Contacts</h1>
        <p className="text-warm-600 mt-1">{state.contacts.length} contacts from Google — sorted by {sort === 'importance' ? 'inferred importance' : sort}.</p>
      </div>
      <div className="relative w-full">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-500">{Icons.search}</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, city, skill, note…"
          className="pl-9 pr-3 py-2 rounded-lg border border-warm-300 bg-surface w-full" />
      </div>


      <Card className="overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-warm-100 text-xs text-warm-700 uppercase">
            <tr>
              <th className="text-left py-3 px-4 border-r border-warm-200 cursor-pointer hover:bg-warm-200 select-none" onClick={() => handleSort('name')}>
                Name{sortArrow('name')}
              </th>
              <th className="text-left py-3 px-4 border-r border-warm-200 hidden md:table-cell cursor-pointer hover:bg-warm-200 select-none" onClick={() => handleSort('category')}>
                Category{sortArrow('category')}
              </th>
              <th className="text-left py-3 px-4 border-r border-warm-200 hidden lg:table-cell cursor-pointer hover:bg-warm-200 select-none" onClick={() => handleSort('location')}>
                Location{sortArrow('location')}
              </th>
              <th className="text-left py-3 px-4 hidden md:table-cell cursor-pointer hover:bg-warm-200 select-none" onClick={() => handleSort('lastContacted')}>
                Last contacted{sortArrow('lastContacted')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const cats = categoriesFor(c, state.customCategories);
              const multi = cats.length > 1;
              return (
                <tr key={c.id} onClick={() => openDrawer(c.id)}
                  className="border-t border-warm-100 hover:bg-warm-50 cursor-pointer">
                  <td className="py-3 px-4 border-r border-warm-200">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar contact={c} size={36} />
                        {multi && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full" style={{ background: MULTI_COLOR, border: '2px solid white' }} />}
                      </div>
                      <div>
                        <div className="font-medium text-warm-900">{c.name}</div>
                        <div className="text-xs text-warm-600">{c.email || c.phone || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 border-r border-warm-200 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {cats.map((x) => <CategoryPill key={x.key} category={x} />)}
                      {c.googleLabels.filter((l) => !l.startsWith('CRM:')).map((l) => <Tag key={l} label={l} />)}
                    </div>
                  </td>
                  <td className="py-3 px-4 border-r border-warm-200 hidden lg:table-cell text-sm text-warm-700">
                    {c.location ? `${c.location.city}, ${c.location.country}` : '—'}
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell text-sm text-warm-700">{relativeDate(c.lastContactedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
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

  const handleRemoveGuest = (e, email, name) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Remove ${name} from this event?`)) {
      removeGuestFromEvent(event.id, email);
    }
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
              style={{ background: colorFor(c, state.customCategories) + '1a', border: `1px solid ${colorFor(c, state.customCategories)}33` }}>
              <Avatar contact={c} size={20} />
              <span className="text-xs font-medium" style={{ color: colorFor(c, state.customCategories) }}>{c.name}</span>
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

  const selectedContact = selectedId ? state.contacts.find((c) => c.id === selectedId) : null;
  const hasPin = selectedContact && selectedContact.location && selectedContact.location.lat != null;

  const makePinIcon = (L, contact, selected) => {
    const color = colorFor(contact, state.customCategories);
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
    return () => { map.remove(); leafletRef.current = null; };
  }, []);

  // Rebuild pins when contacts / filter / selection change
  useEffect(() => {
    const L = window.L;
    const map = leafletRef.current;
    if (!map) return;
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};
    const filterCat = [...RESERVED_CATEGORIES, ...state.customCategories].find((c) => c.key === filterKey);
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
  }, [state.contacts, state.customCategories, filterKey, selectedId]);

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
      const cat = [...RESERVED_CATEGORIES, ...state.customCategories].find((x) => x.key === filterKey);
      if (cat) r = r.filter((c) => c.crmLabels.includes(cat.label));
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
  }, [state.contacts, state.customCategories, droppedLatLng, sort, radiusKm, filterKey]);

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
            <option value="">All categories</option>
            {RESERVED_CATEGORIES.concat(state.customCategories).map((c) => <option key={c.key} value={c.key}>{c.label.replace(/^CRM:\s*/, '')}</option>)}
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
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(selectedContact, state.customCategories) }} />
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
              <Button size="sm" variant="secondary" onClick={() => openLog(selectedContact.id)} className="flex-1">Log interaction</Button>
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
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(c, state.customCategories) }} />
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// ASK (chat) TAB
// ───────────────────────────────────────────────────────────────────

const CITY_HINTS = {
  lisbon: { lat: 38.7223, lng: -9.1393, zoom: 6 },
  portugal: { lat: 39.4, lng: -8, zoom: 6 },
  berlin: { lat: 52.52, lng: 13.405, zoom: 6 },
  london: { lat: 51.5074, lng: -0.1278, zoom: 6 },
  paris: { lat: 48.8566, lng: 2.3522, zoom: 6 },
  tokyo: { lat: 35.68, lng: 139.69, zoom: 5 },
  kyoto: { lat: 35.01, lng: 135.77, zoom: 5 },
  japan: { lat: 36, lng: 138, zoom: 5 },
  'southeast asia': { lat: 10, lng: 110, zoom: 4 },
  asia: { lat: 20, lng: 100, zoom: 3 },
  europe: { lat: 50, lng: 10, zoom: 4 },
  africa: { lat: 0, lng: 20, zoom: 3 },
  'new york': { lat: 40.7, lng: -74, zoom: 7 },
  'san francisco': { lat: 37.77, lng: -122.42, zoom: 7 },
  nyc: { lat: 40.7, lng: -74, zoom: 7 },
  sf: { lat: 37.77, lng: -122.42, zoom: 7 },
};

function AskTab() {
  const { state, setState } = useApp();
  const { open: openDrawer } = useDrawer();
  const [messages, setMessages] = useState([
    { role: 'bot', text: `Hi ${state.googleProfile?.name?.split(' ')[0] || 'there'} — ask me anything about your network. Try: "Who do I know in Berlin?" or "Which friends are into climbing?"` },
  ]);
  const [input, setInput] = useState('');
  const llm = state.llm;
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const answer = (q) => {
    const lc = q.toLowerCase();
    // City / region detection
    const hintKey = Object.keys(CITY_HINTS).find((k) => lc.includes(k));
    const isLocationQ = /\b(in|near|around|visit|trip|travel|live|lives)\b/.test(lc) || hintKey;

    // Skill detection
    const skillWords = ['climb', 'mentor', 'product', 'design', 'surf', 'write', 'wine', 'coffee', 'machine learning', 'ml', 'security', 'invest', 'engineer', 'photograph', 'cook', 'book', 'hike'];
    const matchedSkill = skillWords.find((w) => lc.includes(w));

    // Mentor query
    if (/mentor/.test(lc)) {
      const topic = q.match(/mentor[ing]*\s+(me\s+)?(on|about|for)?\s*(.+?)(\?|$)/i)?.[3] || '';
      const topicLc = topic.toLowerCase();
      const candidates = state.contacts
        .filter((c) => c.crmLabels.includes('CRM: Professional') || (c.skills || []).some((s) => topicLc && s.toLowerCase().includes(topicLc)))
        .sort((a, b) => importanceScore(b) - importanceScore(a))
        .slice(0, 6);
      return { text: `Here are contacts who could mentor you${topic ? ` on ${topic}` : ''}:`, contacts: candidates };
    }

    // "Where do X live" or location
    if (isLocationQ) {
      const city = Object.keys(CITY_HINTS).find((k) => lc.includes(k));
      const candidates = state.contacts.filter((c) => {
        if (!c.location) return false;
        const hay = `${c.location.city} ${c.location.country}`.toLowerCase();
        return city ? hay.includes(city) : skillWords.some((s) => lc.includes(s) && (c.skills || []).join(' ').toLowerCase().includes(s));
      }).slice(0, 10);

      const hint = hintKey ? CITY_HINTS[hintKey] : null;

      return {
        text: candidates.length > 0
          ? `Found ${candidates.length} contact${candidates.length === 1 ? '' : 's'}${city ? ` in or near ${city.charAt(0).toUpperCase() + city.slice(1)}` : ''}:`
          : `I don't see any contacts there. Try another city or drop a pin on the Map.`,
        contacts: candidates,
        mapHint: hint,
      };
    }

    // Skill
    if (matchedSkill) {
      const candidates = state.contacts.filter((c) => {
        const hay = `${(c.skills || []).join(' ')} ${c.notes || ''} ${c.custom?.title || ''}`.toLowerCase();
        return hay.includes(matchedSkill);
      }).slice(0, 10);
      return {
        text: candidates.length
          ? `Contacts related to "${matchedSkill}":`
          : `No clear matches for "${matchedSkill}". Try adding it as a skill or to a contact's notes.`,
        contacts: candidates,
      };
    }

    // Fallback: name match
    const byName = state.contacts.filter((c) => c.name.toLowerCase().includes(lc)).slice(0, 5);
    if (byName.length > 0) {
      return { text: `Matches by name:`, contacts: byName };
    }

    return { text: `I'm a simple rule-based demo matcher — I look for city names and skills. Try a question like "who do I know in Lisbon" or "which friends are into climbing." Add your own LLM key in Settings for real open-ended chat.` };
  };

  const send = () => {
    if (!input.trim()) return;
    const q = input.trim();
    setInput('');
    setMessages((ms) => [...ms, { role: 'user', text: q }]);
    setTimeout(() => {
      const res = answer(q);
      setMessages((ms) => [...ms, { role: 'bot', ...res }]);
      if (res.mapHint) {
        // Store for map tab
        setState((s) => ({ ...s, mapFocus: res.mapHint }));
      }
    }, 350);
  };

  // If no LLM provider config AND user wants "real" mode, show setup prompt
  const showSetup = llm.provider !== 'demo' && !llm.apiKey && !llm.endpoint;

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      <div className="px-8 py-5 border-b border-warm-200">
        <h1 className="font-serif text-3xl text-warm-900">Ask</h1>
        <p className="text-warm-600 text-sm mt-1">
          Natural language over contact metadata + your notes. Using <strong>{llm.provider === 'demo' ? 'Demo matcher (local)' : llm.provider}</strong>.
        </p>
      </div>

      {showSetup ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="max-w-md w-full p-8 text-center">
            <h2 className="font-serif text-2xl text-warm-900 mb-2">Add an API key to enable chat</h2>
            <p className="text-warm-700 mb-6">Paste your OpenAI/Anthropic key in Settings → LLM config — or switch to the built-in Demo matcher.</p>
            <Button onClick={() => setState((s) => ({ ...s, activeTab: 'settings' }))}>Open Settings</Button>
          </Card>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${m.role === 'user' ? 'bubble-user' : 'bubble-bot'} px-4 py-3 text-sm leading-relaxed`}>
                  <p>{m.text}</p>
                  {m.contacts && m.contacts.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 gap-1.5">
                      {m.contacts.map((c) => (
                        <button key={c.id} onClick={() => openDrawer(c.id)}
                          className="flex items-center gap-2 p-2 rounded-lg bg-surface/60 hover:bg-surface text-warm-900 text-left">
                          <Avatar contact={c} size={28} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{c.name}</div>
                            <div className="text-xs opacity-70 truncate">{c.location?.city}{c.custom?.title ? ` · ${c.custom.title}` : ''}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {m.mapHint && (
                    <div className="mt-3">
                      <Button size="sm" variant="secondary" onClick={() => setState((s) => ({ ...s, activeTab: 'map', mapFocus: m.mapHint }))}>
                        {Icons.pin} Show on map
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="px-8 py-4 border-t border-warm-200 flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="e.g. who do I know in Lisbon?"
              className="flex-1 px-4 py-3 rounded-xl border border-warm-300 bg-surface" />
            <Button onClick={send} icon={Icons.send}>Send</Button>
          </div>
        </>
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
  const [resetConfirm, setResetConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const updateLLM = (patch) => setState((s) => ({ ...s, llm: { ...s.llm, ...patch } }));
  const updateNudges = (patch) => setState((s) => ({ ...s, nudges: { ...s.nudges, ...patch } }));

  const unlink = async () => {
    setSyncMsg('');
    try {
      if (window.TetherGoogle) await window.TetherGoogle.revoke();
    } catch (e) { console.error('Revoke failed:', e); }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('tether-cal-asked');
    localStorage.removeItem(CLIENT_ID_KEY);
    window.location.reload();
  };

  const syncNow = async () => {
    if (syncing) return;
    setSyncMsg('');
    setSyncing(true);
    try {
      if (state.demoMode) {
        setSyncMsg('Demo mode — no real sync available.');
        setSyncing(false);
        return;
      }
      setSyncMsg('Syncing contacts & calendar…');
      const result = await window.TetherGoogle.syncAll(() => { });
      let { contacts, events } = result;
      const needsGeocode = contacts.filter(
        (c) => c.location && c.location.city && c.location.lat == null
      );
      if (needsGeocode.length > 0) {
        setSyncMsg(`Geocoding ${needsGeocode.length} locations…`);
        contacts = await geocodeMissingLocations(contacts, (done, total) => {
          setSyncMsg(`Geocoding locations… ${done}/${total}`);
        });
      }
      setState((s) => ({
        ...s,
        contacts,
        events,
        lastSyncAt: new Date().toISOString(),
      }));
      setSyncMsg('Synced!');
      setTimeout(() => setSyncMsg(''), 3000);
    } catch (e) {
      console.error('Sync error:', e);
      setSyncMsg(e && e.message ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
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
        <div className="flex items-center gap-3">
          {state.googleProfile && <Avatar contact={{ name: state.googleProfile.name, avatar: state.googleProfile.picture }} size={40} />}
          <div>
            <div className="font-medium">{state.googleProfile?.name}</div>
            <div className="text-xs text-warm-600">{state.googleProfile?.email}</div>
          </div>
        </div>
        <div className="text-sm text-warm-700 space-y-1">
          <div>Mode: <strong>{state.demoMode ? 'Demo (mock data)' : 'Real Google Contacts + Calendar'}</strong></div>
          <div>Last sync: <strong>{state.lastSyncAt ? relativeDate(state.lastSyncAt) : 'Initial sync pending'}</strong></div>
          {!state.demoMode && <div>Scopes: <span className="font-mono text-xs">contacts (r/w), calendar.read</span></div>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={syncNow} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
          {resetConfirm
            ? <Button variant="danger" onClick={unlink}>Confirm unlink & clear data</Button>
            : <Button variant="outline" onClick={() => setResetConfirm(true)}>Unlink account</Button>}
        </div>
        {syncMsg && <div className={`text-xs ${syncMsg.includes('fail') || syncMsg.includes('Failed') ? 'text-red-700' : 'text-sage-700'}`}>{syncMsg}</div>}
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
          <p className="text-sm text-warm-700 mb-2">Category colors</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {RESERVED_CATEGORIES.map((c) => (
              <div key={c.key} className="flex items-center gap-2 p-2 rounded-lg border border-warm-200 bg-surface text-sm">
                <span className="w-4 h-4 rounded-full" style={{ background: c.color }} />
                <span className="truncate">{c.label.replace(/^CRM:\s*/, '')}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-warm-500 mt-2 italic">Per-category overrides editable in a later build. Multi-category contacts always render in <span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: MULTI_COLOR }}></span> Deep Purple.</p>
        </div>
      </Card>

      {/* LLM */}
      <Card className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">LLM config</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-warm-600">Provider</span>
            <select value={state.llm.provider} onChange={(e) => updateLLM({ provider: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface">
              <option value="demo">Demo matcher (local, no network)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="ollama">Local Ollama</option>
              <option value="other">Other (OpenAI-compatible)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-warm-600">{state.llm.provider === 'ollama' || state.llm.provider === 'other' ? 'Endpoint URL' : 'API key'}</span>
            <input type="password" value={state.llm.provider === 'ollama' || state.llm.provider === 'other' ? state.llm.endpoint : state.llm.apiKey}
              onChange={(e) => updateLLM(state.llm.provider === 'ollama' || state.llm.provider === 'other' ? { endpoint: e.target.value } : { apiKey: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface" placeholder={state.llm.provider === 'demo' ? 'Not needed' : '—'}
              disabled={state.llm.provider === 'demo'} />
          </label>
        </div>
        <div className="text-xs text-warm-500">Keys are stored locally in your browser and sent only to the provider you chose.</div>
      </Card>

      {/* Calendar */}
      <Card className="p-6 space-y-3">
        <h3 className="font-serif text-lg text-warm-900">Calendar</h3>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={state.calendarWriteEnabled} onChange={(e) => setState((s) => ({ ...s, calendarWriteEnabled: e.target.checked }))} />
          <span className="text-sm">Write logged interactions to Google Calendar (dedicated <strong>Personal CRM</strong> calendar, no guest invites).</span>
        </label>
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
          <p className="text-sm text-warm-700 mb-2">Per-category cadence (group check-ins on Reconnect)</p>
          <div className="space-y-2">
            {RESERVED_CATEGORIES.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <span className="flex-1"><CategoryPill category={c} /></span>
                <span className="text-xs text-warm-600">every</span>
                <input type="number" min="0" value={state.nudges.groupCadence[c.key] || ''}
                  onChange={(e) => updateNudges({ groupCadence: { ...state.nudges.groupCadence, [c.key]: e.target.value ? Number(e.target.value) : 0 } })}
                  className="w-20 px-2 py-1 rounded-lg border border-warm-300 bg-surface text-sm" placeholder="off" />
                <span className="text-xs text-warm-600">days</span>
              </div>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-3 pt-2 border-t border-warm-200">
          <input type="checkbox" checked={state.nudges.emailDigest} onChange={(e) => updateNudges({ emailDigest: e.target.checked })} />
          <span className="text-sm">Send me a weekly email digest of stale close friends and overdue group check-ins.</span>
        </label>
      </Card>

      {/* Data */}
      <Card className="p-6 space-y-3">
        <h3 className="font-serif text-lg text-warm-900">Data</h3>
        <p className="text-sm text-warm-700">App-only data (LLM keys, nudges, custom fields, notes) is stored in your browser. Clearing does not touch Google.</p>
        <Button variant="outline" onClick={() => {
          if (confirm('Clear all app-only data? Your Google Contacts and Calendar are untouched.')) {
            localStorage.removeItem(STORAGE_KEY);
            window.location.reload();
          }
        }}>Clear app-only data</Button>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// DASHBOARD
// ───────────────────────────────────────────────────────────────────

function Dashboard() {
  const { state } = useApp();

  const tabs = {
    reconnect: <ReconnectTab />,
    ask: <AskTab />,
    map: <MapTab />,
    calendar: <CalendarTab />,
    contacts: <AllContactsTab />,
    help: <HelpTab />,
    settings: <SettingsTab />,
  };

  return (
    <div className="h-screen flex bg-warm-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative z-0">
        {tabs[state.activeTab] || <ReconnectTab />}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// ROOT
// ───────────────────────────────────────────────────────────────────

function Root() {
  const { state } = useApp();

  // Keyboard shortcuts
  useEffect(() => {
    let pending = null;
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'g') { pending = 'g'; setTimeout(() => { pending = null; }, 700); return; }
      if (pending === 'g') {
        const map = { r: 'reconnect', a: 'ask', m: 'map', c: 'calendar' };
        if (map[e.key]) {
          // Use setStateWithContext via a hacky global
          document.dispatchEvent(new CustomEvent('tether-tab', { detail: map[e.key] }));
        }
        pending = null;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (state.phase === 'signin') return <SignInScreen />;
  if (state.phase === 'syncing') return <SyncProgress />;
  if (state.phase === 'setup-mapping') return <LabelMappingScreen />;
  if (state.phase === 'setup-closefriends') return <CloseFriendPicker />;
  if (state.phase === 'walkthrough') return <><Dashboard /><WalkthroughOverlay /></>;
  return <><Dashboard /><SkippedWalkthroughToast /></>;
}

function KeyListener() {
  const { setState } = useApp();
  useEffect(() => {
    const h = (e) => setState((s) => ({ ...s, activeTab: e.detail }));
    document.addEventListener('tether-tab', h);
    return () => document.removeEventListener('tether-tab', h);
  }, [setState]);
  return null;
}

function App() {
  return (
    <AppProvider>
      <DrawerProvider>
        <KeyListener />
        <Root />
      </DrawerProvider>
    </AppProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
