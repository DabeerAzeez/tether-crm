/* Tether — Map tab component. */

const { useState, useEffect, useMemo, useRef } = React;
const { Icons } = window.TetherConstants;
const { Avatar, Button, Card } = window.TetherComponents;
const { useApp } = window.TetherContext;
const { useDrawer } = window.TetherDrawer;
const { relativeDate, labelsFor, colorFor } = window.TetherHelpers;

function MapTab() {
  const { state, updateContact, allLabels } = useApp();
  const { open: openDrawer, contactId } = useDrawer();
  const wasDrawerOpen = useRef(false);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef({});
  const dropPinRef = useRef(null);
  const circleRef = useRef(null);
  const linesRef = useRef([]);
  const [droppedLatLng, setDroppedLatLng] = useState(null);
  const [sort, setSort] = useState('name');
  const sortRef = useRef(sort);
  useEffect(() => { sortRef.current = sort; }, [sort]);
  const [sortOpen, setSortOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [radiusKm, setRadiusKm] = useState(500);
  const [filterKey, setFilterKey] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const sortOptions = [
    { value: 'name', label: 'A → Z' },
    { value: 'closest', label: 'Closest first' },
    { value: 'recent', label: 'Recently contacted' },
    { value: 'stale', label: 'Least recently contacted' },
  ];

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

  const makePinIcon = (L, contact, selected) => {
    let color = colorFor(contact, state.customLabels);
    const hue = contact.avatar?.hue || 200;
    const avatarBg = `linear-gradient(135deg, hsl(${hue}, 55%, 55%), hsl(${(hue + 40) % 360}, 55%, 42%))`;
    if (state.demoMode && contact.avatar && contact.avatar.hue != null) {
      color = `hsl(${contact.avatar.hue}, 55%, 55%)`;
    }
    const size = selected ? 38 : 28;
    const border = selected ? 'border:3px solid white;box-shadow:0 0 0 2px ' + color + ';' : '';
    const initials = (contact.name || '?')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
    const isDefaultPhoto = contact.photoUrl && contact.photoUrl.includes('googleusercontent.com/cm/');
    const hasPhoto = contact.photoUrl && !isDefaultPhoto;
    const inner = hasPhoto
      ? `<img src="${contact.photoUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentNode.innerHTML='<span>${initials}</span>';this.parentNode.style.justifyContent='center';" />`
      : `<span>${initials}</span>`;
    const bgStyle = hasPhoto ? color : avatarBg;
    const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bgStyle};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:${selected ? 13 : 10}px;box-shadow:0 2px 8px rgba(0,0,0,.35);${border}transition:all .15s;overflow:hidden">${inner}</div>`;
    return L.divIcon({ html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: '' });
  };

  // Map init
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    const L = window.L;
    const hint = state.mapFocus || { lat: 20, lng: 10, zoom: 2 };
    const map = L.map(mapRef.current, { center: [hint.lat, hint.lng], zoom: hint.zoom, worldCopyJump: true });
    const initTile = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors © CARTO', subdomains: 'abcd', maxZoom: 19 });
    initTile.addTo(map);
    tileLayerRef.current = initTile;
    map.on('click', (e) => {
      setDroppedLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
      setSelectedId(null);
    });
    leafletRef.current = map;

    const fixSize = () => {
      if (leafletRef.current) {
        leafletRef.current.invalidateSize();
      }
    };

    const timer = setTimeout(fixSize, 100);

    const resizeObserver = new ResizeObserver(() => fixSize());
    resizeObserver.observe(mapRef.current);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      leafletRef.current = null;
    };
  }, [state.mapFocus]);

  // Swap tile layer when theme changes
  useEffect(() => {
    if (!leafletRef.current) return;
    const L = window.L;
    const map = leafletRef.current;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const isDark = state.theme === 'dark';
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
    const tile = L.tileLayer(tileUrl, { attribution: '© OpenStreetMap contributors © CARTO', subdomains: 'abcd', maxZoom: 19 });
    tile.addTo(map);
    tileLayerRef.current = tile;
  }, [state.theme]);

  // Rebuild pins when contacts / filter / selection change
  useEffect(() => {
    const L = window.L;
    const map = leafletRef.current;
    if (!map) return;
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};
    const filterCat = allLabels.find((c) => c.key === filterKey);
    state.contacts.forEach((c) => {
      if (c.isDeleted) return;
      if (!c.location || c.location.lat == null || c.location.lng == null) return;
      if (filterCat && !c.crmLabels.includes(filterCat.label) && !c.googleLabels.includes(filterCat.label)) return;
      const isSelected = c.id === selectedId;
      const icon = makePinIcon(L, c, isSelected);
      const marker = L.marker([c.location.lat, c.location.lng], { icon, zIndexOffset: isSelected ? 1000 : 0 })
        .on('click', (e) => { window.L.DomEvent.stopPropagation(e); setSelectedId(c.id); openDrawer(c.id); });
      marker.addTo(map);
      markersRef.current[c.id] = marker;
    });
  }, [state.contacts, allLabels, filterKey, selectedId]);

  // Pan to selected contact when selection changes
  useEffect(() => {
    if (!selectedId || !leafletRef.current) return;
    const c = state.contacts.find((x) => x.id === selectedId);
    if (c && c.location && c.location.lat != null) {
      const map = leafletRef.current;
      const drawerOpen = contactId !== null;
      const zoom = 11;
      const raw = map.project([c.location.lat, c.location.lng], zoom);
      const center = map.unproject(raw.add([drawerOpen ? 128 : 0, 0]), zoom);
      map.flyTo(center, zoom, { animate: true, duration: 0.5 });
      wasDrawerOpen.current = drawerOpen;
    }
  }, [selectedId]);

  // Readjust map center when profile drawer opens/minimizes
  useEffect(() => {
    if (!leafletRef.current || !selectedId) return;
    const isCurrentlyOpen = contactId !== null;
    if (isCurrentlyOpen !== wasDrawerOpen.current) {
      const offset = isCurrentlyOpen ? 128 : -128;
      leafletRef.current.panBy([offset, 0], { animate: true });
      wasDrawerOpen.current = isCurrentlyOpen;
    }
  }, [contactId, selectedId]);


  // Drop-pin marker
  useEffect(() => {
    const L = window.L;
    const map = leafletRef.current;
    if (!map) return;
    if (dropPinRef.current) { map.removeLayer(dropPinRef.current); dropPinRef.current = null; }
    if (droppedLatLng) {
      const icon = L.divIcon({
        html: `<div style="width:20px;height:20px;border-radius:50%;background:#63854e;border:3px solid #fbf8f4;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
        iconSize: [20, 20], iconAnchor: [10, 10], className: '',
      });
      dropPinRef.current = L.marker([droppedLatLng.lat, droppedLatLng.lng], { icon }).addTo(map);
    }
  }, [droppedLatLng]);

  // Radius circle — shown when a pin is dropped and sort is radius-based
  useEffect(() => {
    const L = window.L;
    const map = leafletRef.current;
    if (!map) return;
    if (circleRef.current) { map.removeLayer(circleRef.current); circleRef.current = null; }
    if (droppedLatLng && sort !== 'closest' && sort !== 'name') {
      circleRef.current = L.circle([droppedLatLng.lat, droppedLatLng.lng], {
        radius: radiusKm * 1000,
        color: '#7db88f',
        fillColor: '#5a7c65',
        fillOpacity: 0.10,
        weight: 2,
        dashArray: '8 5',
      }).addTo(map);
    }
  }, [droppedLatLng, sort, radiusKm]);

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

  const logScale = (val) => {
    if (val === 0) return 0;
    return Math.round(Math.pow(10, (val / 100) * Math.log10(5000)));
  };

  const invLogScale = (rad) => {
    if (rad <= 0) return 0;
    return (Math.log10(rad) / Math.log10(5000)) * 100;
  };

  const sidebarContacts = useMemo(() => {
    let r = state.contacts.filter((c) => c.location && c.location.lat != null && !c.isDeleted);
    if (filterKey) {
      const cat = allLabels.find((x) => x.key === filterKey);
      if (cat) r = r.filter((c) => labelsFor(c).some(l => l.label === cat.label));
    }
    if (droppedLatLng) {
      r = r.map((c) => ({ ...c, _dist: distKm(c.location, droppedLatLng) }));
      if (sort === 'recent' || sort === 'stale') r = r.filter((x) => x._dist <= radiusKm);
      if (sort === 'closest') r.sort((a, b) => a._dist - b._dist);
      else if (sort === 'recent') r.sort((a, b) => (a.lastContactedDaysAgo ?? 9999) - (b.lastContactedDaysAgo ?? 9999));
      else if (sort === 'stale') r.sort((a, b) => (b.lastContactedDaysAgo ?? 9999) - (a.lastContactedDaysAgo ?? 9999));
      else r.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      if (sort === 'recent') r = [...r].sort((a, b) => (a.lastContactedDaysAgo ?? 9999) - (b.lastContactedDaysAgo ?? 9999));
      else if (sort === 'stale') r = [...r].sort((a, b) => (b.lastContactedDaysAgo ?? 9999) - (a.lastContactedDaysAgo ?? 9999));
      else r = [...r].sort((a, b) => a.name.localeCompare(b.name));
    }
    return r.slice(0, droppedLatLng ? 20 : 30);
  }, [state.contacts, allLabels, droppedLatLng, sort, radiusKm, filterKey]);

  // Lines connecting dropped pin to closest contacts
  useEffect(() => {
    const L = window.L;
    const map = leafletRef.current;
    if (!map) return;
    linesRef.current.forEach(l => map.removeLayer(l));
    linesRef.current = [];
    if (sort === 'closest' && droppedLatLng) {
      sidebarContacts.forEach((c, index) => {
        if (!c.location || c.location.lat == null) return;

        const ratio = sidebarContacts.length > 1 ? 1 - (index / (sidebarContacts.length - 1)) : 1;
        const weight = 1 + (ratio * 3);
        const opacity = 0.1 + (ratio * 0.7);

        const line = L.polyline([
          [droppedLatLng.lat, droppedLatLng.lng],
          [c.location.lat, c.location.lng]
        ], {
          color: '#facc15',
          weight: weight,
          opacity: opacity
        });

        line.addTo(map);
        linesRef.current.push(line);
      });
    }
  }, [sidebarContacts, sort, droppedLatLng]);

  return (
    <div className="h-full flex" onClick={() => setSortOpen(false)}>
      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0" />
        {!hintDismissed && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-amber-950 text-white px-4 py-2 rounded-xl text-sm shadow-lg">
            Click the map to drop a reference pin · click a bubble to open a contact
            <button
              onClick={() => setHintDismissed(true)}
              className="ml-1 text-white/70 hover:text-white leading-none"
              aria-label="Dismiss"
            >✕</button>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <aside className="w-80 shrink-0 border-l border-warm-200 bg-warm-50 flex flex-col">

        {/* Settings panel */}
        <div className="p-4 border-b border-warm-200 space-y-3">
          <h2 className="font-serif text-xl text-warm-900">Map</h2>

          {/* Sort by dropdown */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSortOpen((o) => !o)}
              className="flex items-center gap-1.5 text-sm text-warm-700 hover:text-warm-900 transition"
            >
              <span className="text-warm-500">Sort by:</span>
              <span className="font-semibold text-warm-900">{sortOptions.find((o) => o.value === sort)?.label}</span>
              <span className="text-warm-400 text-[10px] ml-0.5">▼</span>
            </button>
            {sortOpen && (
              <div className="absolute top-full left-0 mt-1.5 z-50 bg-surface border border-warm-200 rounded-xl shadow-xl py-1.5 min-w-[220px]">
                {sortOptions.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => { setSort(o.value); setSortOpen(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-warm-50 text-warm-800 transition"
                  >
                    {o.label}
                    {sort === o.value && <span className="text-sage-600 font-bold">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Label filter pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterKey('')}
              className={`text-xs px-2.5 py-1 rounded-full transition ${!filterKey ? 'bg-sage-600 text-white' : 'bg-warm-100 text-warm-700 hover:bg-warm-200'}`}
            >All</button>
            {allLabels.map((l) => (
              <button
                key={l.key}
                onClick={() => setFilterKey(filterKey === l.key ? '' : l.key)}
                className={`text-xs px-2.5 py-1 rounded-full transition ${filterKey === l.key ? 'bg-sage-600 text-white' : 'bg-warm-100 text-warm-700 hover:bg-warm-200'}`}
              >
                {l.label.replace(/^CRM:\s*/, '')}
              </button>
            ))}
          </div>

          {/* Radius slider — only when pin is dropped and using a radius-based sort */}
          {droppedLatLng && sort !== 'closest' && sort !== 'name' && (
            <div>
              <label className="text-xs text-warm-700">Radius: {radiusKm} km</label>
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={invLogScale(radiusKm)}
                onChange={(e) => setRadiusKm(logScale(Number(e.target.value)))}
                className="w-full mt-1"
                style={{ accentColor: '#5a7c65' }}
              />
            </div>
          )}

          {/* Clear dropped pin */}
          {droppedLatLng && (
            <Button size="sm" variant="ghost" onClick={() => setDroppedLatLng(null)} className="w-full">
              Clear dropped pin
            </Button>
          )}

          {!droppedLatLng && (
            <Button size="sm" variant="ghost" disabled className="w-full opacity-50 cursor-not-allowed">
              Drop a pin on the map
            </Button>
          )}
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto divide-y divide-warm-100">
          {sidebarContacts.length === 0 && (
            <div className="p-4 text-sm text-warm-600 italic">
              {(() => {
                const totalWithLoc = state.contacts.filter(c => !c.isDeleted && c.location && c.location.lat != null).length;
                const totalMatchingFilter = state.contacts.filter(c => !c.isDeleted && c.location && c.location.lat != null && (!filterKey || labelsFor(c).some(l => l.key === filterKey))).length;
                if (totalWithLoc === 0) return 'No contacts with map locations yet.';
                if (totalMatchingFilter === 0) return 'No contacts matching this filter have map pins.';
                return 'No contacts in range. Increase the radius or clear the filter.';
              })()}
            </div>
          )}
          {sidebarContacts.map((c) => {
            const isSelected = c.id === selectedId;
            return (
              <button key={c.id}
                onClick={() => { setSelectedId(c.id); openDrawer(c.id); }}
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
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

window.TetherTabs = window.TetherTabs || {};
window.TetherTabs.MapTab = MapTab;
