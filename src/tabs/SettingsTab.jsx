/* Tether — Settings tab component. */

const { useState } = React;
const { Icons, RESERVED_LABELS, STORAGE_KEY } = window.TetherConstants;
const { Avatar, Button, Card, LabelPill, Modal } = window.TetherComponents;
const { useApp } = window.TetherContext;
const { defaultState } = window.TetherStorage;

function SettingsTab() {
  const { state, setState, setTheme } = useApp();
  const [showRawData, setShowRawData] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');

  const updateNudges = (patch) => setState((s) => ({ ...s, nudges: { ...s.nudges, ...patch } }));

  const updateBlacklist = (newList) => {
    setState((s) => {
      const next = { ...s, calendarKeywordBlacklist: newList };
      if (!s.demoMode && window.TetherGoogle?.hasToken()) {
        window.TetherGoogle.saveAppData({
          contacts: next.contacts,
          chatThreads: next.chatThreads || [],
          settings: {
            theme: next.theme,
            llm: next.llm,
            walkthroughDone: next.walkthroughDone,
            calendarKeywordBlacklist: next.calendarKeywordBlacklist || [],
            resolvedEventIds: next.resolvedEventIds || [],
            dismissedEventIds: next.dismissedEventIds || [],
          },
          nudges: next.nudges,
        }).catch((e) => console.error('[Tether] Blacklist save failed:', e));
      }
      return next;
    });
  };

  const [llmDraft, setLlmDraft] = useState({
    provider: state.llm?.provider || 'ollama',
    endpoint: state.llm?.endpoint || 'http://localhost:11434',
    model: state.llm?.model || '',
    apiKey: state.llm?.apiKey || '',
    connected: state.llm?.connected || false,
  });
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState(
    state.llm?.connected ? { ok: true, message: 'Previously verified.' } : null
  );
  const [llmModels, setLlmModels] = useState(state.llm?.availableModels || []);
  const [showApiKey, setShowApiKey] = useState(false);

  const testAndSaveLlm = async () => {
    setLlmTesting(true);
    setLlmTestResult(null);
    try {
      const timed = async (url, opts) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
        finally { clearTimeout(t); }
      };

      if (llmDraft.provider === 'ollama' || llmDraft.provider === 'other') {
        const endpoint = (llmDraft.endpoint || 'http://localhost:11434').replace(/\/$/, '');
        const res = await timed(`${endpoint}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const modelNames = (data.models || []).map((m) => m.name);
        setLlmModels(modelNames);
        if (!modelNames.length) {
          setState((s) => ({ ...s, llm: { ...llmDraft, endpoint, connected: false } }));
          setLlmTestResult({ ok: false, message: 'Ollama reachable but no models found — run: ollama pull <model>' });
          return;
        }
        const selectedModel = llmDraft.model || modelNames[0];
        if (!modelNames.includes(selectedModel)) {
          setLlmTestResult({ ok: false, message: `Model "${selectedModel}" not found. Available: ${modelNames.slice(0, 3).join(', ')}${modelNames.length > 3 ? '…' : ''}` });
          return;
        }
        const chatCtrl = new AbortController();
        const chatTimer = setTimeout(() => chatCtrl.abort(), 90000);
        try {
          const chatRes = await fetch(`${endpoint}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: chatCtrl.signal,
            body: JSON.stringify({ model: selectedModel, messages: [{ role: 'user', content: 'hi' }], stream: false, think: false, options: { num_predict: 5 } }),
          });
          if (!chatRes.ok) {
            const errText = await chatRes.text().catch(() => '');
            throw new Error(`Model test failed: HTTP ${chatRes.status}${errText ? ' — ' + errText.slice(0, 100) : ''}`);
          }
        } finally {
          clearTimeout(chatTimer);
        }
        const saved = { ...llmDraft, endpoint, model: selectedModel, availableModels: modelNames, connected: true };
        setState((s) => ({ ...s, llm: saved }));
        setLlmDraft(saved);
        setLlmTestResult({ ok: true, message: `Connected. Using: ${selectedModel}${modelNames.length > 1 ? ` (${modelNames.length} models available)` : ''}` });
      } else if (llmDraft.provider === 'gemini') {
        if (!llmDraft.apiKey.trim()) throw new Error('API key is required.');
        const res = await timed(`https://generativelanguage.googleapis.com/v1beta/models?key=${llmDraft.apiKey}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const modelNames = (data.models || [])
          .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m) => m.name.replace('models/', ''));
        const preferred = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        const detectedModel = (llmDraft.model && modelNames.includes(llmDraft.model))
          ? llmDraft.model
          : preferred.find((p) => modelNames.includes(p)) || modelNames[0] || '';
        const saved = { ...llmDraft, model: detectedModel, availableModels: modelNames, connected: true };
        setState((s) => ({ ...s, llm: saved }));
        setLlmDraft(saved);
        setLlmModels(modelNames);
        setLlmTestResult({ ok: true, message: `Connected. ${modelNames.length} model${modelNames.length !== 1 ? 's' : ''} available.` });
      } else {
        const saved = { ...llmDraft, connected: false };
        setState((s) => ({ ...s, llm: saved }));
        setLlmDraft(saved);
        setLlmTestResult({ ok: true, message: 'Saved. Connection testing not yet supported for this provider.' });
      }
    } catch (e) {
      const errMsg = e.name === 'AbortError' ? 'Connection timed out.' : e.message;
      setState((s) => ({ ...s, llm: { ...llmDraft, connected: false } }));
      setLlmTestResult({ ok: false, message: `Could not connect — ${errMsg}` });
    } finally {
      setLlmTesting(false);
    }
  };

  const unlink = async () => {
    try {
      if (window.TetherGoogle) await window.TetherGoogle.revoke();
    } catch (e) { console.error('Revoke failed:', e); }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('tether-cal-asked');
    window.location.reload();
  };

  const deleteAllData = async () => {
    setDeleting(true);
    setDeleteMsg('');
    try {
      if (window.TetherGoogle) {
        await window.TetherGoogle.writeAppData({ contacts: [], version: 1, deletedAt: new Date().toISOString() });
      }

      setState((s) => ({
        ...defaultState(),
        googleSignedIn: s.googleSignedIn,
        googleProfile: s.googleProfile,
        demoMode: s.demoMode,
        theme: s.theme,
        llm: s.llm,
        phase: 'dashboard',
        activeTab: 'contacts',
      }));

      localStorage.removeItem(STORAGE_KEY);
      setDeleteConfirm(false);
      setDeleteMsg('✓ All contact data wiped from Drive and browser.');
      setTimeout(() => setDeleteMsg(''), 5000);
    } catch (e) {
      console.error('Delete failed:', e);
      setDeleteMsg(`Delete failed: ${e.message || 'unknown error'}`);
    } finally {
      setDeleting(false);
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {state.googleProfile && <Avatar contact={{ name: state.googleProfile.name, photoUrl: state.googleProfile.picture }} size={40} />}
            <div>
              <div className="font-medium">{state.googleProfile?.name}</div>
              <div className="text-xs text-warm-600">{state.googleProfile?.email}</div>
            </div>
          </div>
          <Button variant="outline" onClick={unlink}>Sign Out</Button>
        </div>
      </Card>

      {/* Appearance */}
      <Card className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">Appearance</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-warm-700">Theme</span>
          <div className="flex rounded-lg bg-warm-200 dark:bg-warm-300 p-1">
            {['light', 'dark'].map((t) => (
              <button key={t} onClick={() => setTheme(t)}
                className={`px-4 py-1.5 rounded-md text-sm capitalize transition-colors ${state.theme === t ? 'bg-white dark:bg-warm-500 shadow-sm text-warm-900 dark:text-warm-50' : 'text-warm-600 dark:text-warm-700 hover:text-warm-900 dark:hover:text-warm-900'}`}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {RESERVED_LABELS.map((c) => (
              <div key={c.key} className="flex items-center gap-2 p-2 rounded-lg border border-warm-200 bg-surface text-sm">
                <span className="w-4 h-4 rounded-full" style={{ background: c.color }} />
                <span className="truncate">{c.label.replace(/^CRM:\s*/, '')}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* LLM */}
      <Card id="llm-config" className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">LLM config</h3>
        <div>
          <span className="text-xs text-warm-600">Provider</span>
          <select value={llmDraft.provider}
            onChange={(e) => { setLlmDraft((d) => ({ ...d, provider: e.target.value, model: '' })); setLlmTestResult(null); setLlmModels([]); }}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface">
            <option value="ollama">Local Ollama</option>
            <option value="gemini">Google Gemini</option>
            <option value="openai" disabled>OpenAI (coming soon)</option>
            <option value="anthropic" disabled>Anthropic (coming soon)</option>
          </select>
        </div>
        {(llmDraft.provider === 'ollama' || llmDraft.provider === 'other') && (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p><strong>Model quality matters for local Ollama.</strong> Small models (under ~13B parameters) often give slow or inaccurate results on CRM tasks.</p>
              <p>If AI search or chat isn't working well, try switching to a more powerful model.</p>
            </div>
            <div>
              <span className="text-xs text-warm-600">Endpoint URL</span>
              <input value={llmDraft.endpoint}
                onChange={(e) => { setLlmDraft((d) => ({ ...d, endpoint: e.target.value })); setLlmTestResult(null); }}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface"
                placeholder="http://localhost:11434" />
            </div>
          </>
        )}
        {(llmDraft.provider === 'gemini' || llmDraft.provider === 'openai' || llmDraft.provider === 'anthropic') && (
          <div>
            <span className="text-xs text-warm-600">API Key</span>
            <div className="relative mt-1">
              <input type={showApiKey ? 'text' : 'password'} value={llmDraft.apiKey}
                onChange={(e) => { setLlmDraft((d) => ({ ...d, apiKey: e.target.value })); setLlmTestResult(null); setLlmModels([]); }}
                className="w-full px-3 py-2 pr-10 rounded-lg border border-warm-300 bg-surface"
                placeholder={llmDraft.provider === 'gemini' ? 'AIza…' : 'sk-…'} />
              <button type="button" onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-700 p-1">
                {showApiKey
                  ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                }
              </button>
            </div>
          </div>
        )}
        <div>
          <span className="text-xs text-warm-600">
            Model
            {llmModels.length > 0 && <span className="text-warm-400"> (populated from {llmDraft.provider === 'ollama' ? 'Ollama' : 'API key'})</span>}
          </span>
          {llmModels.length > 0 ? (
            <select value={llmDraft.model}
              onChange={(e) => { setLlmDraft((d) => ({ ...d, model: e.target.value })); setLlmTestResult(null); }}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface">
              {llmModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input value={llmDraft.model}
              onChange={(e) => { setLlmDraft((d) => ({ ...d, model: e.target.value })); setLlmTestResult(null); }}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface"
              placeholder="Click Test & Save to see available models" />
          )}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={testAndSaveLlm} disabled={llmTesting}>
            {llmTesting ? 'Testing…' : 'Test & Save'}
          </Button>
          {llmTestResult && (
            <span className={`text-sm ${llmTestResult.ok ? 'text-sage-700' : 'text-red-600'}`}>
              {llmTestResult.ok ? '✓ ' : '✗ '}{llmTestResult.message}
            </span>
          )}
        </div>
        {llmTestResult?.ok && llmDraft.provider === 'ollama' && (
          <p className="text-xs text-amber-700 dark:text-amber-400">If search results seem wrong or chat responses are poor, your model may not be powerful enough — try a larger or more capable model.</p>
        )}
        <p className="text-xs text-warm-500">Settings are stored locally in your browser and sent only to the provider you configure.</p>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">Calendar Keyword Blacklist</h3>
        <p className="text-sm text-warm-700">
          Events with these key words in the title won't be pulled in from your calendars when you sync them to Tether — use this to stop pulling in irrelevant events like work or school so you can focus on intentional meetups.
        </p>
        <div className="flex flex-wrap gap-2">
          {(state.calendarKeywordBlacklist || []).map((kw, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1 bg-warm-100 text-warm-900 text-sm rounded-full border border-warm-200">
              <span>{kw}</span>
              <button onClick={() => updateBlacklist(state.calendarKeywordBlacklist.filter((_, idx) => idx !== i))} className="text-warm-500 hover:text-warm-900 ml-1 leading-none">&times;</button>
            </div>
          ))}
          {(state.calendarKeywordBlacklist || []).length === 0 && <span className="text-sm text-warm-500 italic">No keywords blacklisted.</span>}
        </div>
        <div className="flex gap-2">
          <input
            id="newKeywordInput"
            className="flex-1 px-3 py-2 rounded-lg border border-warm-300 bg-surface text-sm"
            placeholder="Add keyword..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                const val = e.target.value.trim();
                updateBlacklist([...(state.calendarKeywordBlacklist || []), val]);
                e.target.value = '';
              }
            }}
          />
          <Button size="sm" onClick={() => {
            const input = document.getElementById('newKeywordInput');
            if (input && input.value.trim()) {
              updateBlacklist([...(state.calendarKeywordBlacklist || []), input.value.trim()]);
              input.value = '';
            }
          }}>Add</Button>
        </div>
      </Card>

      {/* Transparency Portal */}
      <Card className="p-6 space-y-4">
        <h3 className="font-serif text-lg text-warm-900">Transparency Portal</h3>
        <p className="text-sm text-warm-700">
          All your Tether data lives in a single hidden file (<code className="font-mono text-xs">tether_data_v2.json</code>) in your Google Drive's private <strong>appData</strong> folder — invisible in Drive UI, safe from accidental deletion.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => {
            const data = {
              contacts: state.contacts,
              chatThreads: state.chatThreads || [],
              settings: {
                theme: state.theme,
                llm: state.llm,
                walkthroughDone: state.walkthroughDone,
                calendarKeywordBlacklist: state.calendarKeywordBlacklist || [],
              },
              nudges: state.nudges,
              exportedAt: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'tether_data.json';
            a.click();
            URL.revokeObjectURL(url);
          }}>Export all data</Button>
        </div>
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
          <div className="space-y-2">
            {RESERVED_LABELS.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <span className="flex-1"><LabelPill label={c} /></span>
                <span className="text-xs text-warm-600">every</span>
                <input type="number" min="0" value={state.nudges.groupCadence[c.key] || ''}
                  onChange={(e) => updateNudges({ groupCadence: { ...state.nudges.groupCadence, [c.key]: e.target.value ? Number(e.target.value) : 0 } })}
                  className="w-20 px-2 py-1 rounded-lg border border-warm-300 bg-surface text-sm" placeholder="off" />
                <span className="text-xs text-warm-600">days</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Data Management */}
      <Card className="p-6 space-y-4 border-red-200 dark:border-red-900/40">
        <h3 className="font-serif text-lg text-red-700 dark:text-red-400">Danger Zone</h3>
        <p className="text-sm text-warm-700">
          Wipe all contact data, interactions, and notes. This affects both your private Google Drive file and your local browser storage.
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {deleteConfirm ? (
              <div className="flex gap-2 items-center">
                <Button variant="danger" onClick={deleteAllData} disabled={deleting}>
                  {deleting ? 'Wiping...' : 'Yes, delete everything'}
                </Button>
                <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeleteConfirm(true)}>
                Delete all contact data
              </Button>
            )}
          </div>
          {deleteMsg && <div className="text-xs text-sage-700 font-medium">{deleteMsg}</div>}
        </div>
      </Card>

      <Modal open={clearDataConfirm} onClose={() => setClearDataConfirm(false)} title="Clear app-only data?" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-warm-700">
            This will clear your LLM keys, nudges, custom fields, and notes from your browser. Your Google Contacts and Calendar will remain untouched.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setClearDataConfirm(false)}>Cancel</Button>
            <Button size="sm" onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }} className="bg-red-600 hover:bg-red-700 text-white border-transparent">
              Clear data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

window.TetherTabs = window.TetherTabs || {};
window.TetherTabs.SettingsTab = SettingsTab;
