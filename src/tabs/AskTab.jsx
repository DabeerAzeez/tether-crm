/* Tether — Ask tab component with bot message rendering. */

const { useState, useEffect, useMemo, useRef } = React;
const { Icons } = window.TetherConstants;
const { Avatar, Button, Card } = window.TetherComponents;
const { useApp } = window.TetherContext;
const { useDrawer } = window.TetherDrawer;
const { callLLM } = window.TetherHelpers;

function makeContactCard(c) {
  const initials = c.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const subtitle = [c.location?.city, c.custom?.title].filter(Boolean).join(' · ');
  return `<button class="contact-card-btn" data-contact-id="${c.id}">` +
    `<span class="contact-card-avatar">${initials}</span>` +
    `<span class="contact-card-info"><span class="contact-card-name">${c.name}</span>` +
    (subtitle ? `<span class="contact-card-sub">${subtitle}</span>` : '') +
    `</span></button>`;
}

function buildBotHTML(text, allContacts) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byName = {};
  (allContacts || []).forEach((c) => { byName[c.name] = c; });

  const byFirst = {};
  (allContacts || []).forEach((c) => {
    const first = c.name.split(/\s+/)[0];
    byFirst[first] = byFirst[first] === undefined ? c : null;
  });

  const placeholders = {};
  let idx = 0;
  const nextKey = () => { const k = `TETHERCONTACT${idx++}X`; return k; };
  const captured = new Set();

  const pin = (c) => {
    if (captured.has(c.id)) return null;
    captured.add(c.id);
    const key = nextKey();
    placeholders[key] = c;
    return key;
  };

  // Pass 1 — explicit [[Name]] markers from the LLM
  let processed = text.replace(/\[\[([^\]]+)\]\]/g, (full, name) => {
    const c = byName[name];
    if (!c) return name;
    const key = nextKey();
    placeholders[key] = c;
    captured.add(c.id);
    return key;
  });

  // Pass 2 — exact full-name fallback for contacts the LLM forgot to bracket
  for (const c of (allContacts || [])) {
    if (captured.has(c.id)) continue;
    processed = processed.replace(new RegExp(`\\b${esc(c.name)}\\b`, 'g'), () => pin(c) || c.name);
  }

  // Pass 3 — unique first-name fallback
  for (const [first, c] of Object.entries(byFirst)) {
    if (!c || captured.has(c.id)) continue;
    processed = processed.replace(new RegExp(`\\b${esc(first)}\\b`, 'g'), () => pin(c) || first);
  }

  let html = window.marked.parse(processed);

  for (const [key, c] of Object.entries(placeholders)) {
    html = html.replace(key, makeContactCard(c));
  }

  return window.DOMPurify.sanitize(html, { ALLOW_DATA_ATTR: true });
}

function BotMessage({ text, contacts, allContacts, openDrawer }) {
  const ref = useRef(null);
  const html = useMemo(() => buildBotHTML(text, allContacts), [text, allContacts]);

  useEffect(() => {
    if (!ref.current) return;
    const btns = ref.current.querySelectorAll('.contact-card-btn');
    btns.forEach((btn) => { btn.onclick = () => openDrawer(btn.dataset.contactId); });
    return () => btns.forEach((btn) => { btn.onclick = null; });
  }, [html, openDrawer]);

  return <div ref={ref} className="chat-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

function AskTab() {
  const { state, setState, appendMessage, createThread } = useApp();
  const { open: openDrawer } = useDrawer();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const llm = state.llm;
  const endRef = useRef(null);

  const activeThread = useMemo(() => {
    const threads = state.chatThreads || [];
    if (state.activeThreadId) {
      const found = threads.find((t) => t.id === state.activeThreadId);
      if (found) return found;
    }
    return threads.length > 0 ? threads[threads.length - 1] : null;
  }, [state.chatThreads, state.activeThreadId]);

  const welcomeText = `Hi ${state.googleProfile?.name?.split(' ')[0] || 'there'} — ask me anything about your network. Try: "Who do I know in Berlin?" or "Which friends work in tech?"`;

  const displayMessages = useMemo(() => {
    const welcome = { role: 'bot', text: welcomeText };
    if (!activeThread || activeThread.messages.length === 0) return [welcome];
    return [welcome, ...activeThread.messages];
  }, [activeThread, welcomeText]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, loading]);

  const queryLLM = async (question, history) => {
    const contactsSummary = state.contacts.slice(0, 200).map((c) => {
      const parts = [`- ${c.name}`];
      if (c.location?.city) parts.push(`(${c.location.city}${c.location.country ? ', ' + c.location.country : ''})`);
      const labels = [...(c.googleLabels || []), ...(c.crmLabels || [])].map((l) => l.replace(/^CRM:\s*/i, '')).join(', ');
      if (labels) parts.push(`[${labels}]`);
      if ((c.skills || []).length) parts.push(`skills: ${c.skills.join(', ')}`);
      return parts.join(' ');
    }).join('\n');

    const systemPrompt = `You are a helpful personal CRM assistant. The user has ${state.contacts.length} contacts:\n\n${contactsSummary}\n\nAnswer questions about the user's network concisely. When referring to a specific contact, wrap their EXACT name (as listed above) in double square brackets, e.g. [[Jane Smith]]. Use this for every contact you mention so the app can render interactive contact cards. Do not use this syntax for anyone not in the list.`;

    const text = await callLLM(llm, [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: question },
    ]);
    return text || 'No response from model.';
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');

    let threadId = activeThread?.id;
    if (!threadId) {
      threadId = createThread();
    }
    if (!threadId) return;

    const threadMsgs = activeThread ? activeThread.messages : [];
    const history = threadMsgs.map((m) => ({
      role: m.role === 'bot' ? 'assistant' : 'user',
      content: m.text,
    }));

    appendMessage(threadId, { role: 'user', text: q });
    setLoading(true);
    try {
      const responseText = await queryLLM(q, history);
      const seen = new Set();
      const mentioned = [];
      for (const match of responseText.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const contact = state.contacts.find((c) => c.name === match[1]);
        if (contact && !seen.has(contact.id)) { seen.add(contact.id); mentioned.push(contact); }
      }
      appendMessage(threadId, { role: 'bot', text: responseText, contacts: mentioned });
    } catch (e) {
      const errMsg = e.name === 'AbortError'
        ? 'Request timed out. Check that your LLM is reachable and try again.'
        : e.message;
      appendMessage(threadId, { role: 'bot', text: `Error: ${errMsg}` });
    } finally {
      setLoading(false);
    }
  };

  const showSetup = !llm.connected;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-warm-900">Ask</h1>
        <p className="text-warm-600 mt-1">AI-powered chatbot to help you answer questions about your contacts.</p>
      </div>

      {state.contacts.length === 0 ? (
        <Card className="flex flex-col items-center justify-center min-h-[320px] text-center p-10 space-y-6">
          <div className="w-20 h-20 rounded-full bg-warm-100 flex items-center justify-center text-warm-400">
            <div className="scale-[2]">{Icons.ask}</div>
          </div>
          <div className="max-w-md">
            <h2 className="font-serif text-2xl text-warm-900 mb-2">No data to ask about</h2>
            <p className="text-warm-700">
              Tether's AI features work best when you have contacts to query. Add some in the <strong>All Contacts</strong> tab first.
            </p>
          </div>
        </Card>
      ) : showSetup ? (
        <Card className="flex flex-col items-center justify-center min-h-[288px] text-center p-8">
          <p className="text-warm-700 mb-6">Configure your LLM provider (Ollama, Gemini, etc.) in Settings to enable chat features.</p>
          <Button onClick={() => { setState((s) => ({ ...s, activeTab: 'settings' })); setTimeout(() => document.getElementById('llm-config')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>Open Settings</Button>
        </Card>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 bg-warm-50/50 rounded-2xl border border-warm-200 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {displayMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${m.role === 'user' ? 'bubble-user' : 'bubble-bot'} px-4 py-3 text-sm leading-relaxed`}>
                  {m.role === 'user'
                    ? <p>{m.text}</p>
                    : <BotMessage text={m.text} contacts={m.contacts} allContacts={state.contacts} openDrawer={openDrawer} />
                  }
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bubble-bot px-4 py-3 text-sm text-warm-500 flex items-center gap-1">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" style={{ animationDelay: '0.2s' }} />
                  <span className="thinking-dot" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="p-4 bg-surface border-t border-warm-200 flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="e.g. who do I know in Lisbon?"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl border border-warm-300 bg-warm-50 focus:bg-surface transition-colors disabled:opacity-50" />
            <Button onClick={send} icon={Icons.send} disabled={loading}>Send</Button>
          </div>
        </div>
      )}
    </div>
  );
}

window.TetherTabs = window.TetherTabs || {};
window.TetherTabs.AskTab = AskTab;
