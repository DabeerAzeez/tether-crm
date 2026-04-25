/* Tether — Reusable UI components.
   Exposes window.TetherComponents for use by other modules. */

const { useState, useEffect, useRef } = React;
const { Icons } = window.TetherConstants;

// ───────────────────────────────────────────────────────────────────
// Small UI primitives
// ───────────────────────────────────────────────────────────────────

const Avatar = ({ contact, size = 40, ring = false }) => {
  const [imgError, setImgError] = useState(false);
  const { initials, hue } = contact.avatar || { initials: (contact.name || '?').slice(0, 2).toUpperCase(), hue: 200 };
  const ringClass = ring ? 'ring-2 ring-warm-200 ring-offset-2 ring-offset-warm-50' : '';

  if (contact.photoUrl && !imgError) {
    return (
      <img
        src={contact.photoUrl}
        alt={contact.name || ''}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover select-none ${ringClass}`}
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
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

const LabelPill = ({ label }) => (
  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-warm-100 text-warm-700 border border-warm-200 shadow-sm">
    {label.label.replace(/^CRM:\s*/i, '')}
  </span>
);
const Tag = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-warm-100 text-warm-700 border border-warm-200">
    {label}
    {onRemove && <button onClick={onRemove} className="opacity-60 hover:opacity-100">×</button>}
  </span>
);

const LabelMenu = ({ contact, allLabels, onToggle, onCreate, onClose }) => {
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute z-50 top-full right-0 mt-2 w-64 origin-top-right bg-surface rounded-xl shadow-2xl border border-warm-200 overflow-hidden animate-slide-up">
      <div className="px-4 py-3 border-b border-warm-100 bg-warm-50/50">
        <span className="text-sm font-medium text-warm-900">Manage labels</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {allLabels.map((cat) => {
          const has = contact.crmLabels.includes(cat.label) || contact.googleLabels.includes(cat.label);
          return (
            <button
              key={cat.key}
              onClick={() => onToggle(cat.label)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-warm-100 transition text-left group"
            >
              <span className="text-warm-500 group-hover:text-warm-700 scale-90">{Icons.label}</span>
              <span className="flex-1 text-sm text-warm-800">{cat.label.replace(/^CRM:\s*/i, '')}</span>
              {has && <span className="text-sage-600 scale-75">{Icons.check}</span>}
            </button>
          );
        })}
        {allLabels.length === 0 && <div className="px-4 py-8 text-center text-sm text-warm-500 italic">No labels yet</div>}
      </div>
      <div className="p-2 border-t border-warm-100">
        {creating ? (
          <div className="flex gap-2 p-1">
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault(); e.stopPropagation();
                  if (newLabel.trim()) {
                    onCreate(newLabel.trim());
                    setCreating(false);
                    setNewLabel('');
                  }
                } else if (e.key === 'Escape') setCreating(false);
              }}
              placeholder="Label name"
              className="flex-1 px-3 py-1.5 text-sm border border-warm-300 rounded-lg bg-warm-50 focus:outline-none focus:border-sage-500 min-w-0"
            />
            <button onClick={() => {
              if (newLabel.trim()) {
                onCreate(newLabel.trim());
                setCreating(false);
                setNewLabel('');
              }
            }} className="px-3 py-1.5 text-xs font-medium bg-sage-600 text-white rounded-lg hover:bg-sage-700 transition">Add</button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-warm-700 hover:bg-warm-100 rounded-lg transition"
          >
            <span className="scale-75 opacity-70">{Icons.plus}</span>
            <span>Create label</span>
          </button>
        )}
      </div>
    </div>
  );
};

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
// Location Autocomplete
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
// Expose on window
// ───────────────────────────────────────────────────────────────────

window.TetherComponents = {
  Avatar,
  Button,
  Card,
  LabelPill,
  Tag,
  LabelMenu,
  SectionHeader,
  Modal,
  LocationAutocomplete,
};
