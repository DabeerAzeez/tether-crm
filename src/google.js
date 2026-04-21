/* Tether — Google integration (OAuth, People API, Calendar API).
   Exposes window.TetherGoogle. No backend. Uses Google Identity Services (token flow)
   plus gapi.client for API calls. Requires a Google OAuth 2.0 Web Client ID with:
     • People API + Calendar API enabled
     • The current origin added to "Authorized JavaScript origins"
*/

(function () {
  const DISCOVERY_DOCS = [
    'https://people.googleapis.com/$discovery/rest?version=v1',
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
  ];
  const SCOPES = [
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/calendar.readonly',
    'openid', 'profile', 'email',
  ].join(' ');

  let tokenClient = null;
  let gapiReady = false;
  let currentClientId = null;
  let currentToken = null;

  const waitFor = (test, timeout = 15000) => new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        const v = test();
        if (v) return resolve(v);
      } catch (e) {}
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
        resolve(resp);
      };
      try {
        tokenClient.requestAccessToken({ prompt });
      } catch (e) { reject(e); }
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

  async function listContactGroups() {
    const map = {};
    let pageToken;
    do {
      const r = await window.gapi.client.people.contactGroups.list({
        pageSize: 200, pageToken, groupFields: 'name,groupType,memberCount',
      });
      (r.result.contactGroups || []).forEach((g) => {
        map[g.resourceName] = {
          name: g.formattedName || g.name,
          type: g.groupType, // SYSTEM_CONTACT_GROUP | USER_CONTACT_GROUP
        };
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
    const findUrl = (re) => {
      const hit = urls.find((u) => u.value && re.test(u.value));
      return hit ? hit.value : '';
    };

    const labels = [];
    (p.memberships || []).forEach((m) => {
      const ref = m.contactGroupMembership && m.contactGroupMembership.contactGroupResourceName;
      if (!ref) return;
      const g = groupsMap[ref];
      if (!g) return;
      if (g.type === 'SYSTEM_CONTACT_GROUP') return;
      if (g.name) labels.push(g.name);
    });

    const crmLabels = labels.filter((l) => /^CRM:/i.test(l));
    const googleLabels = labels.filter((l) => !/^CRM:/i.test(l));

    const initials = (name || '?').split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
    const hue = hashHue(p.resourceName || name);

    return {
      id: p.resourceName,
      name,
      email,
      phone,
      googleLabels,
      crmLabels,
      location,
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
      etag: p.etag,
    };
  }

  async function listEvents({ pastDays = 90, futureDays = 30 } = {}) {
    const timeMin = new Date(Date.now() - pastDays * 86400000).toISOString();
    const timeMax = new Date(Date.now() + futureDays * 86400000).toISOString();
    const all = [];
    let pageToken;
    do {
      const r = await window.gapi.client.calendar.events.list({
        calendarId: 'primary',
        timeMin, timeMax,
        showDeleted: false,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        pageToken,
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
      id: e.id,
      title: e.summary || '(no title)',
      start,
      end,
      location: e.location || '',
      description: e.description || '',
      guestEmails: (e.attendees || []).map((a) => a.email).filter(Boolean),
      organizerEmail: (e.organizer && e.organizer.email) || '',
      synthetic: false,
    };
  }

  function computeLastContacted(contacts, events) {
    const byEmail = {};
    contacts.forEach((c) => { if (c.email) byEmail[c.email.toLowerCase()] = c.id; });
    const latest = {}; // id -> iso
    events.forEach((e) => {
      if (!e.start) return;
      const ts = e.start;
      (e.guestEmails || []).forEach((em) => {
        const id = byEmail[em.toLowerCase()];
        if (!id) return;
        if (!latest[id] || ts > latest[id]) latest[id] = ts;
      });
    });
    const now = Date.now();
    return contacts.map((c) => {
      const iso = latest[c.id];
      if (!iso) return c;
      const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
      return { ...c, lastContactedAt: iso, lastContactedDaysAgo: Math.max(0, days) };
    });
  }

  async function syncAll(onProgress) {
    const report = (label, pct) => { if (onProgress) onProgress({ label, pct }); };
    report('Loading contact labels…', 15);
    const groupsMap = await listContactGroups();
    report('Fetching contacts…', 25);
    const persons = await listConnections((loaded, total) => {
      const pct = total ? 25 + Math.min(45, Math.round((loaded / total) * 45)) : 45;
      report(`Fetched ${loaded}${total ? ` of ${total}` : ''} contacts`, pct);
    });
    report('Mapping contacts…', 72);
    let contacts = persons.map((p) => personToContact(p, groupsMap));
    report('Fetching calendar (last 3 months + upcoming)…', 80);
    const rawEvents = await listEvents({ pastDays: 90, futureDays: 30 });
    const events = rawEvents.map(eventToSimple);
    report('Cross-referencing attendees…', 92);
    contacts = computeLastContacted(contacts, events);
    report('Done', 100);
    return { contacts, events };
  }

  function hasToken() { return !!(currentToken && currentToken.access_token); }

  function revoke() {
    return new Promise((resolve) => {
      if (currentToken && currentToken.access_token && window.google && window.google.accounts && window.google.accounts.oauth2) {
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
    hasToken,
    revoke,
    get scopes() { return SCOPES; },
  };
})();
