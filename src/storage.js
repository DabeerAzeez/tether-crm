/* Tether — Storage helpers.
   Exposes window.TetherStorage for use by other modules. */

const STORAGE_KEY = 'tether-state-v1';

const defaultState = () => ({
  phase: 'signin', // signin | syncing | setup-mapping | setup-closefriends | walkthrough | dashboard
  googleSignedIn: false,
  googleProfile: null,
  contacts: [],
  events: [],
  customLabels: [], // user-added CRM: labels
  theme: 'light', // light | dark
  activeTab: 'contacts',
  llm: { provider: 'ollama', apiKey: '', endpoint: 'http://localhost:11434', model: '', connected: false },
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
  isImporting: false,
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

window.TetherStorage = {
  STORAGE_KEY,
  defaultState,
  loadState,
  saveState,
  geocodeMissingLocations,
};
