/* Tether — Google integration (OAuth, People API read-only seed, Drive appData storage).
   Exposes window.TetherGoogle. No backend. Uses Google Identity Services (token flow)
   plus gapi.client for API calls. Requires a Google OAuth 2.0 Web Client ID with:
     • People API + Google Calendar API + Google Drive API enabled
     • The current origin added to "Authorized JavaScript origins"

   Storage model (v2):
     App data is persisted in a structured JSON file in the user's hidden
     Google Drive appDataFolder (invisible to the user, not deletable from Drive UI):
       tether_data_v2.json   — { version:2, contacts, chatThreads, settings, nudges }
     Legacy v1 file (tether_contacts_v1.json) is read on first load for migration.
     On first sign-in, contacts are seeded from Google People API (read-only).
     All subsequent saves go only to the v2 Drive file — People API is never written to.
*/

(function () {
  const DISCOVERY_DOCS = [
    'https://people.googleapis.com/$discovery/rest?version=v1',
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
  ];
  const SCOPES = [
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/drive.appdata',
    'openid', 'profile', 'email',
  ].join(' ');
  const TOKEN_STORAGE_KEY = 'tether-google-token';
  const DRIVE_FILE_NAME_V1 = 'tether_contacts_v1.json';
  const DRIVE_FILE_NAME = 'tether_data_v2.json';

  let tokenClient = null;
  let gapiReady = false;
  let currentClientId = null;
  let currentToken = null;

  // Cache the Drive file IDs so we don't re-query on every save
  let _driveFileId = null;   // v2 file
  let _driveFileIdV1 = null; // v1 legacy (for migration)

  const waitFor = (test, timeout = 15000) => new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try { const v = test(); if (v) return resolve(v); } catch (e) {}
      if (Date.now() - start > timeout) return reject(new Error('Timed out waiting for Google scripts to load'));
      setTimeout(tick, 60);
    };
    tick();
  });

  async function ensureGapi() {
    if (gapiReady) return;
    await waitFor(() => window.gapi);
    await new Promise((resolve) => window.gapi.load('client', resolve));
    await window.gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
    gapiReady = true;
  }

  async function init(clientId) {
    if (!clientId) throw new Error('Missing OAuth Client ID');
    await Promise.all([
      waitFor(() => window.google && window.google.accounts && window.google.accounts.oauth2),
      ensureGapi(),
    ]);
    if (currentClientId !== clientId || !tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: () => {},
      });
      currentClientId = clientId;
    }
  }

  function signIn({ prompt = 'consent' } = {}) {
    return new Promise((resolve, reject) => {
      if (!tokenClient) return reject(new Error('Google API not initialized'));
      tokenClient.callback = (resp) => {
        if (resp && resp.error) return reject(new Error(resp.error_description || resp.error));
        if (!resp || !resp.access_token) return reject(new Error('No access token returned'));
        currentToken = resp;
        window.gapi.client.setToken({ access_token: resp.access_token });
        try {
          const expiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
          localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ access_token: resp.access_token, expires_at: expiresAt }));
        } catch (e) {}
        resolve(resp);
      };
      try { tokenClient.requestAccessToken({ prompt }); } catch (e) { reject(e); }
    });
  }

  async function fetchProfile() {
    if (!currentToken) throw new Error('Not signed in');
    const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${currentToken.access_token}` },
    });
    if (!r.ok) throw new Error(`Profile fetch failed (${r.status})`);
    return r.json();
  }

  // ─── Drive appDataFolder helpers ─────────────────────────────────
  // Uses gapi.client.request() for metadata operations (correct CORS handling)
  // Uses fetch() with correct upload URLs for media operations

  function authHeaders() {
    if (!currentToken || !currentToken.access_token) throw new Error('Not signed in');
    return { Authorization: `Bearer ${currentToken.access_token}` };
  }

  /** Find a named file in appDataFolder. Returns file id or null. */
  async function findAppDataFileByName(fileName) {
    const r = await gapi.client.request({
      path: 'https://www.googleapis.com/drive/v3/files',
      method: 'GET',
      params: {
        q: `name='${fileName}' and 'appDataFolder' in parents`,
        spaces: 'appDataFolder',
        fields: 'files(id,name)',
        pageSize: 1,
      },
    });
    const files = r.result.files || [];
    return files.length > 0 ? files[0].id : null;
  }

  /** Find the v2 data file in appDataFolder (cached). */
  async function findAppDataFile() {
    if (_driveFileId) return _driveFileId;
    _driveFileId = await findAppDataFileByName(DRIVE_FILE_NAME);
    return _driveFileId;
  }

  /** Find the legacy v1 file (cached). */
  async function findAppDataFileV1() {
    if (_driveFileIdV1) return _driveFileIdV1;
    _driveFileIdV1 = await findAppDataFileByName(DRIVE_FILE_NAME_V1);
    return _driveFileIdV1;
  }

  /** Download a Drive file by ID. Returns parsed JSON or null. */
  async function downloadFile(fileId) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      console.error(`[Tether] Drive read failed: ${res.status}`);
      return null;
    }
    return await res.json();
  }

  /**
   * Read app data from Drive appDataFolder.
   * Tries v2 first; falls back to v1 for migration. Returns parsed object or null.
   * The returned object always has a `version` field.
   */
  async function readAppData() {
    try {
      // Try v2 file first
      const v2Id = await findAppDataFile();
      if (v2Id) {
        const data = await downloadFile(v2Id);
        if (data) return data;
      }
      // Fall back to legacy v1
      const v1Id = await findAppDataFileV1();
      if (v1Id) {
        const data = await downloadFile(v1Id);
        if (data) {
          console.log('[Tether] Found v1 data — will migrate to v2 on next save.');
          return { ...data, version: 1 };
        }
      }
      return null;
    } catch (e) {
      console.error('[Tether] readAppData error:', e);
      return null;
    }
  }

  /** Write contacts payload to tether_contacts_v1.json in appDataFolder. */
  async function writeAppData(payload) {
    const content = JSON.stringify(payload);
    const token = (currentToken || {}).access_token;
    if (!token) throw new Error('Not signed in');

    const fileId = await findAppDataFile();

    if (fileId) {
      // ── Update existing file ───────────────────────────────────
      // PATCH /upload/drive/v3/files/{id}?uploadType=media
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: content,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Drive update failed (${res.status})`);
      }
      return await res.json();
    } else {
      // ── Create new file via multipart upload ───────────────────
      // POST /upload/drive/v3/files?uploadType=multipart
      const boundary = 'tether_mp_boundary_' + Math.random().toString(36).slice(2);
      const metadata = JSON.stringify({
        name: DRIVE_FILE_NAME,
        parents: ['appDataFolder'],
        mimeType: 'application/json',
      });
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        metadata,
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        content,
        `--${boundary}--`,
      ].join('\r\n');

      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Drive create failed (${res.status})`);
      }
      const result = await res.json();
      _driveFileId = result.id; // cache it
      return result;
    }
  }

  // ─── Google Contacts seed (read-only) ────────────────────────────

  async function listContactGroups() {
    const map = {};
    let pageToken;
    do {
      const r = await window.gapi.client.people.contactGroups.list({
        pageSize: 200, pageToken, groupFields: 'name,groupType,memberCount',
      });
      (r.result.contactGroups || []).forEach((g) => {
        map[g.resourceName] = { name: g.formattedName || g.name, type: g.groupType };
      });
      pageToken = r.result.nextPageToken;
    } while (pageToken);
    return map;
  }

  async function listConnections(onPage) {
    const PERSON_FIELDS = [
      'names', 'emailAddresses', 'phoneNumbers', 'memberships',
      'addresses', 'photos', 'biographies', 'organizations',
      'urls', 'userDefined', 'birthdays', 'nicknames', 'metadata',
    ].join(',');
    const all = [];
    let pageToken;
    let totalItems = null;
    do {
      const r = await window.gapi.client.people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 500,
        pageToken,
        personFields: PERSON_FIELDS,
        sortOrder: 'LAST_MODIFIED_DESCENDING',
      });
      (r.result.connections || []).forEach((p) => all.push(p));
      pageToken = r.result.nextPageToken;
      totalItems = r.result.totalItems || totalItems;
      if (onPage) onPage(all.length, totalItems);
    } while (pageToken);
    return all;
  }

  function hashHue(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
  }

  function firstVal(arr, key = 'value') {
    if (!arr || !arr.length) return '';
    const hit = arr.find((x) => x && x.metadata && x.metadata.primary) || arr[0];
    return hit[key] || '';
  }

  function personToContact(p, groupsMap) {
    const name = firstVal(p.names, 'displayName') || firstVal(p.nicknames, 'value') || '(no name)';
    const email = firstVal(p.emailAddresses);
    const phone = firstVal(p.phoneNumbers);
    const photo = firstVal(p.photos, 'url');
    const bio = firstVal(p.biographies);

    const addrObj = (p.addresses && (p.addresses.find((a) => a.metadata && a.metadata.primary) || p.addresses[0])) || null;
    let location = null;
    if (addrObj) {
      const city = addrObj.city || addrObj.region || '';
      const country = addrObj.country || '';
      if (city || country) {
        location = { city, country, lat: null, lng: null, raw: addrObj.formattedValue || `${city}${country ? ', ' + country : ''}` };
      }
    }

    const orgObj = (p.organizations && (p.organizations.find((o) => o.metadata && o.metadata.primary) || p.organizations[0])) || null;
    const urls = p.urls || [];
    const findUrl = (re) => { const hit = urls.find((u) => u.value && re.test(u.value)); return hit ? hit.value : ''; };

    const labels = [];
    (p.memberships || []).forEach((m) => {
      const ref = m.contactGroupMembership && m.contactGroupMembership.contactGroupResourceName;
      if (!ref) return;
      const g = groupsMap[ref];
      if (!g || g.type === 'SYSTEM_CONTACT_GROUP' || !g.name) return;
      labels.push(g.name);
    });

    const crmLabels = labels.filter((l) => /^CRM:/i.test(l));
    const googleLabels = labels.filter((l) => !/^CRM:/i.test(l));
    const initials = (name || '?').split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
    const hue = hashHue(p.resourceName || name);

    return {
      id: p.resourceName,
      name, email, phone,
      googleLabels, crmLabels, location,
      linkedin: findUrl(/linkedin\.com/i),
      instagram: findUrl(/instagram\.com/i),
      facebook: findUrl(/facebook\.com/i),
      website: findUrl(/^https?:\/\/(?!.*(linkedin|instagram|facebook)\.com)/i),
      notes: bio || '',
      custom: {
        company: (orgObj && orgObj.name) || '',
        title: (orgObj && orgObj.title) || '',
        howWeMet: '',
      },
      skills: [],
      interactions: [],
      lastContactedAt: null,
      lastContactedDaysAgo: Infinity,
      nudgeFrequencyDays: null,
      avatar: { initials, hue },
      photoUrl: photo,
    };
  }

  // ─── Calendar ────────────────────────────────────────────────────

  async function listEvents({ pastDays = 90, futureDays = 30 } = {}) {
    const timeMin = new Date(Date.now() - pastDays * 86400000).toISOString();
    const timeMax = new Date(Date.now() + futureDays * 86400000).toISOString();
    const all = [];
    let pageToken;
    do {
      const r = await window.gapi.client.calendar.events.list({
        calendarId: 'primary',
        timeMin, timeMax,
        showDeleted: false, singleEvents: true, orderBy: 'startTime', maxResults: 250, pageToken,
      });
      (r.result.items || []).forEach((e) => all.push(e));
      pageToken = r.result.nextPageToken;
    } while (pageToken);
    return all;
  }

  function eventToSimple(e) {
    const start = (e.start && (e.start.dateTime || e.start.date)) || '';
    const end = (e.end && (e.end.dateTime || e.end.date)) || '';
    return {
      id: e.id, title: e.summary || '(no title)', start, end,
      location: e.location || '', description: e.description || '',
      guestEmails: (e.attendees || []).map((a) => a.email).filter(Boolean),
      organizerEmail: (e.organizer && e.organizer.email) || '',
      htmlLink: e.htmlLink || '', synthetic: false,
    };
  }

  function computeLastContacted(contacts, events) {
    const byEmail = {};
    contacts.forEach((c) => { if (c.email) byEmail[c.email.toLowerCase()] = c.id; });
    const latest = {};
    events.forEach((e) => {
      if (!e.start) return;
      (e.guestEmails || []).forEach((em) => {
        const id = byEmail[em.toLowerCase()];
        if (!id) return;
        if (!latest[id] || e.start > latest[id]) latest[id] = e.start;
      });
    });
    const now = Date.now();
    return contacts.map((c) => {
      const iso = latest[c.id];
      if (!iso) return c;
      // Only update if calendar event is more recent than logged interactions
      if (c.lastContactedAt && c.lastContactedAt >= iso) return c;
      const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
      return { ...c, lastContactedAt: iso, lastContactedDaysAgo: Math.max(0, days) };
    });
  }

  function resolveBirthdayAttendees(contacts, events) {
    const byNameLower = {};
    contacts.forEach((c) => {
      const key = c.name.toLowerCase();
      if (!byNameLower[key]) byNameLower[key] = [];
      byNameLower[key].push(c);
    });
    return events.map((e) => {
      const m = e.title.match(/^(.+?)'s\s+birthday$/i);
      if (!m) return e;
      const matches = byNameLower[m[1].trim().toLowerCase()] || [];
      if (matches.length !== 1) return e;
      const ref = matches[0].email || `${matches[0].id}@contact.local`;
      if (e.guestEmails.includes(ref)) return e;
      return { ...e, guestEmails: [...e.guestEmails, ref] };
    });
  }

  // ─── Main sync ───────────────────────────────────────────────────

  /**
   * loadFromDrive: loads app state from Drive appDataFolder + Google Calendar.
   *
   * Strategy:
   *   1. Try to read tether_data_v2.json, falling back to tether_contacts_v1.json.
   *   2. If found → use stored contacts (and chatThreads if v2) as source of truth.
   *   3. If NOT found → return empty. Do NOT auto-import Google Contacts.
   *   4. Always fetch Calendar fresh for event cross-referencing.
   */
  async function loadFromDrive(onProgress) {
    const report = (label, pct) => { if (onProgress) onProgress({ label, pct }); };

    report('Checking Drive for saved data…', 20);
    const driveData = await readAppData();

    let contacts = [];
    let chatThreads = [];
    if (driveData && Array.isArray(driveData.contacts) && driveData.contacts.length > 0) {
      report('Loading contacts from Drive…', 60);
      contacts = driveData.contacts;
      chatThreads = Array.isArray(driveData.chatThreads) ? driveData.chatThreads : [];
    } else {
      report('No existing data found — starting fresh…', 60);
    }

    // Calendar is always fetched fresh
    report('Fetching calendar…', 75);
    let events = [];
    try {
      const rawEvents = await listEvents({ pastDays: 90, futureDays: 30 });
      events = rawEvents.map(eventToSimple);
    } catch (e) {
      console.warn('[Tether] Calendar fetch failed (non-fatal):', e);
    }

    if (contacts.length > 0) {
      report('Cross-referencing attendees…', 90);
      contacts = computeLastContacted(contacts, events);
      events = resolveBirthdayAttendees(contacts, events);
    }

    report('Done', 100);
    return {
      contacts, events, chatThreads,
      hasExistingData: !!(driveData && Array.isArray(driveData.contacts) && driveData.contacts.length > 0),
    };
  }

  /**
   * importContactsFromGoogle: user-triggered import from Google People API.
   * Fetches contacts, geocodes, saves to Drive, and returns the result.
   */
  async function importContactsFromGoogle(onProgress) {
    const report = (label, pct) => { if (onProgress) onProgress({ label, pct }); };

    report('Reading Google Contacts…', 10);
    const groupsMap = await listContactGroups();
    report('Fetching contacts…', 20);
    const persons = await listConnections((loaded, total) => {
      const pct = total ? 20 + Math.min(40, Math.round((loaded / total) * 40)) : 55;
      report(`Fetched ${loaded}${total ? ` of ${total}` : ''} contacts`, pct);
    });
    report('Mapping contacts…', 65);
    const contacts = persons.map((p) => personToContact(p, groupsMap));

    report('Saving to Drive…', 85);
    try {
      await saveAppData({ contacts });
    } catch (e) {
      console.error('[Tether] Failed to write Drive file after import:', e);
    }

    report('Done', 100);
    return contacts;
  }

  // Keep syncAll as an alias for backward-compat (calls loadFromDrive)
  async function syncAll(onProgress) {
    return loadFromDrive(onProgress);
  }

  /**
   * saveAppData: persist the full structured payload to Drive appDataFolder (v2 format).
   * This is the primary write path — replaces all People API writes.
   */
  async function saveAppData(payload) {
    const data = {
      version: 2,
      savedAt: new Date().toISOString(),
      contacts: payload.contacts || [],
      chatThreads: payload.chatThreads || [],
      settings: payload.settings || {},
      nudges: payload.nudges || {},
    };
    await writeAppData(data);
  }

  /**
   * saveContacts: convenience wrapper — reads current Drive data, merges contacts, writes back.
   * Kept for backward compatibility.
   */
  async function saveContacts(contacts) {
    // Read existing data to preserve chatThreads / settings / nudges
    let existing = null;
    try { existing = await readAppData(); } catch (e) { /* proceed with contacts only */ }
    await saveAppData({
      contacts,
      chatThreads: (existing && existing.chatThreads) || [],
      settings: (existing && existing.settings) || {},
      nudges: (existing && existing.nudges) || {},
    });
  }

  // ─── Token management ─────────────────────────────────────────────

  async function tryRestoreToken() {
    try {
      const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!raw) return false;
      const { access_token, expires_at } = JSON.parse(raw);
      if (!access_token || Date.now() > expires_at - 60000) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return false;
      }
      await ensureGapi();
      currentToken = { access_token };
      window.gapi.client.setToken({ access_token });
      return true;
    } catch (e) { return false; }
  }

  function hasToken() { return !!(currentToken && currentToken.access_token); }

  function revoke() {
    return new Promise((resolve) => {
      _driveFileId = null;
      _driveFileIdV1 = null;
      try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch (e) {}
      if (currentToken && currentToken.access_token && window.google?.accounts?.oauth2) {
        try {
          window.google.accounts.oauth2.revoke(currentToken.access_token, () => {
            currentToken = null;
            try { window.gapi.client.setToken(null); } catch (e) {}
            resolve();
          });
          return;
        } catch (e) {}
      }
      currentToken = null;
      resolve();
    });
  }

  window.TetherGoogle = {
    init,
    signIn,
    fetchProfile,
    syncAll,
    loadFromDrive,
    importContactsFromGoogle,
    saveContacts,
    saveAppData,
    readAppData,
    writeAppData,
    tryRestoreToken,
    hasToken,
    revoke,
    get scopes() { return SCOPES; },
  };
})();
