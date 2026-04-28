/* Tether — App Context (state management).
   Exposes window.TetherContext for use by other modules. */

const { useState, useEffect, useMemo, useCallback, createContext, useContext } = React;

const { STORAGE_KEY, RESERVED_LABELS } = window.TetherConstants;
const { loadState, saveState, defaultState } = window.TetherStorage;
const { loadClientId } = window.TetherConstants;

// Helper re-imports from TetherHelpers (loaded via helpers.js)
const { daysSince, uid, labelsFor, generateThreadName, trimMessages } = window.TetherHelpers;

const MAX_THREADS = 3;
const MAX_PERSISTED_MESSAGES = 15;

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

  // Persist the full app data to Drive appDataFolder (fire-and-forget, non-blocking)
  const saveToDrive = useCallback((state) => {
    if (state.demoMode) return;
    if (!window.TetherGoogle || !window.TetherGoogle.hasToken()) return;
    // Trim chat threads for persistence (max 15 messages each)
    const chatThreads = (state.chatThreads || []).map((t) => ({
      ...t,
      messages: trimMessages(t.messages, MAX_PERSISTED_MESSAGES),
    }));
    window.TetherGoogle.saveAppData({
      contacts: state.contacts,
      chatThreads,
      settings: {
        theme: state.theme,
        llm: state.llm,
        calendarWriteEnabled: state.calendarWriteEnabled,
        walkthroughDone: state.walkthroughDone,
      },
      nudges: state.nudges,
    }).catch((e) => {
      console.error('[Tether] Drive save failed:', e);
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
    setState((s) => {
      const contacts = s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c));
      if (!s.demoMode) setTimeout(() => saveToDrive({ ...s, contacts }), 0);
      return { ...s, contacts };
    });
  }, [setState, saveToDrive]);

  const deleteContactPermanently = useCallback((id) => {
    setState((s) => {
      const contacts = s.contacts.filter((c) => c.id !== id);
      if (!s.demoMode) setTimeout(() => saveToDrive({ ...s, contacts }), 0);
      return { ...s, contacts };
    });
  }, [setState, saveToDrive]);

  const addCrmLabelToContact = useCallback((id, label) => {
    setState((s) => {
      const contacts = s.contacts.map((c) => c.id === id
        ? { ...c, crmLabels: c.crmLabels.includes(label) ? c.crmLabels : [...c.crmLabels, label] }
        : c);
      if (!s.demoMode) setTimeout(() => saveToDrive({ ...s, contacts }), 0);
      return { ...s, contacts };
    });
  }, [setState, saveToDrive]);

  const removeCrmLabelFromContact = useCallback((id, label) => {
    setState((s) => {
      const contacts = s.contacts.map((c) => c.id === id
        ? { ...c, crmLabels: c.crmLabels.filter((l) => l !== label) }
        : c);
      if (!s.demoMode) setTimeout(() => saveToDrive({ ...s, contacts }), 0);
      return { ...s, contacts };
    });
  }, [setState, saveToDrive]);

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
      if (!s.demoMode) setTimeout(() => saveToDrive({ ...s, contacts }), 0);
      return { ...s, contacts, events: [syntheticEvent, ...s.events] };
    });
  }, [setState, saveToDrive]);

  const logInteractionMany = useCallback((contactIds, data) => {
    contactIds.forEach((id) => logInteraction(id, data));
  }, [logInteraction]);

  // ── Label ops
  const allLabels = useMemo(() => {
    const custom = state.customLabels || [];
    const seen = new Set();
    const norm = (l) => l.replace(/^CRM:\s*/i, '').trim().toLowerCase();

    const res = [];
    custom.forEach((c) => {
      const n = norm(c.label);
      if (!seen.has(n)) {
        res.push(c);
        seen.add(n);
      }
    });

    state.contacts.forEach((c) => {
      [...c.googleLabels, ...c.crmLabels].forEach((l) => {
        const n = norm(l);
        if (!seen.has(n)) {
          res.push({ key: `imported-${l}`, label: l, color: '#a98458' });
          seen.add(n);
        }
      });
    });
    return res;
  }, [state.customLabels, state.contacts]);

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
      if (!s.demoMode) setTimeout(() => saveToDrive({ ...s, events, contacts, dismissedAttendeeIds }), 0);
      return { ...s, events, contacts, dismissedAttendeeIds };
    });
  }, [setState, saveToDrive]);

  const dismissAttendee = useCallback((eventId, name) => {
    setState((s) => ({
      ...s,
      dismissedAttendeeIds: [...s.dismissedAttendeeIds, `${eventId}:${name.toLowerCase()}`],
    }));
  }, [setState]);

  const addCustomLabel = useCallback((label, color) => {
    const key = label.replace(/^CRM:\s*/, '').toLowerCase().replace(/\s+/g, '-');
    const full = label.startsWith('CRM:') ? label : `CRM: ${label}`;
    setState((s) => ({
      ...s,
      customLabels: [...(s.customLabels || []), { key, label: full, color }],
    }));
  }, [setState]);

  const renameLabel = useCallback((oldLabel, newLabel) => {
    setState((s) => {
      const norm = (l) => l.replace(/^CRM:\s*/i, '').trim().toLowerCase();
      const oldNorm = norm(oldLabel);
      const isCrm = newLabel.startsWith('CRM:');
      const newFull = isCrm ? newLabel : `CRM: ${newLabel}`;
      const newKey = newFull.replace(/^CRM:\s*/, '').toLowerCase().replace(/\s+/g, '-');

      const contacts = s.contacts.map((c) => {
        const hasCrm = c.crmLabels.some((l) => norm(l) === oldNorm);
        const hasGoogle = c.googleLabels.some((l) => norm(l) === oldNorm);
        if (!hasCrm && !hasGoogle) return c;

        const crmLabels = c.crmLabels.filter((l) => norm(l) !== oldNorm);
        const googleLabels = c.googleLabels.filter((l) => norm(l) !== oldNorm);
        crmLabels.push(newFull);
        return { ...c, crmLabels, googleLabels };
      });

      let customLabels = (s.customLabels || []).map((c) => {
        if (norm(c.label) === oldNorm) {
          return { ...c, key: newKey, label: newFull };
        }
        return c;
      });

      if (!customLabels.some(c => norm(c.label) === norm(newFull))) {
        customLabels.push({ key: newKey, label: newFull, color: '#a98458' });
      }

      if (!s.demoMode) setTimeout(() => saveToDrive({ ...s, contacts, customLabels }), 0);
      return { ...s, contacts, customLabels };
    });
  }, [setState, saveToDrive]);

  const deleteLabel = useCallback((label, deleteContactsToo) => {
    setState((s) => {
      const norm = (l) => l.replace(/^CRM:\s*/i, '').trim().toLowerCase();
      const targetNorm = norm(label);

      let contacts = s.contacts;
      if (deleteContactsToo) {
        contacts = contacts.filter((c) => {
          const has = c.crmLabels.some((l) => norm(l) === targetNorm) || c.googleLabels.some((l) => norm(l) === targetNorm);
          return !has;
        });
      } else {
        contacts = contacts.map((c) => {
          const has = c.crmLabels.some((l) => norm(l) === targetNorm) || c.googleLabels.some((l) => norm(l) === targetNorm);
          if (!has) return c;
          return {
            ...c,
            crmLabels: c.crmLabels.filter((l) => norm(l) !== targetNorm),
            googleLabels: c.googleLabels.filter((l) => norm(l) !== targetNorm),
          };
        });
      }

      const customLabels = (s.customLabels || []).filter((c) => norm(c.label) !== targetNorm);

      if (!s.demoMode) setTimeout(() => saveToDrive({ ...s, contacts, customLabels }), 0);
      return { ...s, contacts, customLabels };
    });
  }, [setState, saveToDrive]);

  const setTheme = useCallback((theme) => {
    setState((s) => ({ ...s, theme }));
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [setState]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
  }, [state.theme]);

  // ── Chat thread ops
  const createThread = useCallback((name) => {
    let newId = null;
    setState((s) => {
      const threads = s.chatThreads || [];
      if (threads.length >= MAX_THREADS) return s;
      const now = new Date().toISOString();
      newId = 't_' + uid();
      const thread = { id: newId, name: name || 'New chat', createdAt: now, updatedAt: now, messages: [] };
      const updated = { ...s, chatThreads: [...threads, thread], activeThreadId: newId };
      if (!s.demoMode) setTimeout(() => saveToDrive(updated), 0);
      return updated;
    });
    return newId;
  }, [setState, saveToDrive]);

  const deleteThread = useCallback((threadId) => {
    setState((s) => {
      const threads = (s.chatThreads || []).filter((t) => t.id !== threadId);
      const activeThreadId = s.activeThreadId === threadId
        ? (threads.length > 0 ? threads[threads.length - 1].id : null)
        : s.activeThreadId;
      const updated = { ...s, chatThreads: threads, activeThreadId };
      if (!s.demoMode) setTimeout(() => saveToDrive(updated), 0);
      return updated;
    });
  }, [setState, saveToDrive]);

  const renameThread = useCallback((threadId, name) => {
    setState((s) => {
      const threads = (s.chatThreads || []).map((t) =>
        t.id === threadId ? { ...t, name, updatedAt: new Date().toISOString() } : t
      );
      const updated = { ...s, chatThreads: threads };
      if (!s.demoMode) setTimeout(() => saveToDrive(updated), 0);
      return updated;
    });
  }, [setState, saveToDrive]);

  const appendMessage = useCallback((threadId, message) => {
    setState((s) => {
      const threads = (s.chatThreads || []).map((t) => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages, message];
        // Auto-name thread from first user message
        const name = t.messages.length === 0 && message.role === 'user'
          ? generateThreadName(message.text)
          : t.name;
        return { ...t, messages: msgs, name, updatedAt: new Date().toISOString() };
      });
      const updated = { ...s, chatThreads: threads };
      if (!s.demoMode) setTimeout(() => saveToDrive(updated), 0);
      return updated;
    });
  }, [setState, saveToDrive]);

  const setActiveThread = useCallback((threadId) => {
    setState((s) => ({ ...s, activeThreadId: threadId }));
  }, [setState]);

  const value = {
    state, setState,
    updateContact, deleteContactPermanently, addCrmLabelToContact, removeCrmLabelFromContact,
    logInteraction, logInteractionMany,
    resolveEventAttendee, dismissAttendee,
    addGuestToEvent, removeGuestFromEvent,
    addCustomLabel, renameLabel, deleteLabel, setTheme,
    allLabels,
    createThread, deleteThread, renameThread, appendMessage, setActiveThread,
    MAX_THREADS,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

// ───────────────────────────────────────────────────────────────────
// Expose on window
// ───────────────────────────────────────────────────────────────────

window.TetherContext = {
  AppCtx,
  useApp,
  AppProvider,
};
