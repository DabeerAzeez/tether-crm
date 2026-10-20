/* Pure helper functions shared between app.jsx (browser) and tests (Node).
   Assigned to window.TetherHelpers in browser; exported via module.exports in Node. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  }
  if (typeof window !== 'undefined') {
    window.TetherHelpers = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MULTI_COLOR = 'var(--cat-multi)';
  const DEFAULT_LABEL_COLOR = '#a98458';

  function daysSince(iso) {
    if (!iso) return Infinity;
    return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  }

  function relativeDate(iso) {
    const d = daysSince(iso);
    if (d === Infinity) return 'Unknown';
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d < 7) return `${d} days ago`;
    if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) === 1 ? '' : 's'} ago`;
    if (d < 365) return `${Math.floor(d / 30)} month${Math.floor(d / 30) === 1 ? '' : 's'} ago`;
    return `${Math.floor(d / 365)} year${Math.floor(d / 365) === 1 ? '' : 's'} ago`;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatShort(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  // Returns all label objects for a contact, deduplicating by normalized name.
  function labelsFor(contact, customLabels) {
    customLabels = customLabels || [];
    const seen = new Set();
    const res = [];
    const norm = (l) => l.replace(/^CRM:\s*/i, '').trim().toLowerCase();

    [...contact.crmLabels, ...contact.googleLabels].forEach(function (lbl) {
      const n = norm(lbl);
      if (seen.has(n)) return;
      seen.add(n);
      const match = customLabels.find((c) => norm(c.label) === n);
      if (match) res.push(match);
      else res.push({ label: lbl, color: DEFAULT_LABEL_COLOR, key: 'lbl-' + lbl });
    });
    return res;
  }

  function colorFor(contact, customLabels) {
    const lbls = labelsFor(contact, customLabels);
    if (lbls.length > 1) return MULTI_COLOR;
    if (lbls.length === 1) return lbls[0].color;
    return DEFAULT_LABEL_COLOR;
  }

  // Importance ranking — see PRD §5.3
  function importanceScore(c) {
    let s = 0;
    if (c.googleLabels.length > 0) s += 2;
    if (c.crmLabels.length > 0) s += 5;
    if (c.nudgeFrequencyDays != null) s += 10;
    const d = daysSince(c.lastContactedAt);
    if (d < 30) s += 5;
    else if (d < 90) s += 2;
    if (c.name && c.phone && c.email) s += 3;
    else if (c.email || c.phone) s += 1;
    if (c.location) s += 1;
    return s;
  }

  // Auto-generate a thread name from the first user message.
  function generateThreadName(firstMessage) {
    if (!firstMessage) return 'New chat';
    var cleaned = firstMessage.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 30) return cleaned;
    // Try to break at word boundary
    var truncated = cleaned.slice(0, 30);
    var lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 15) truncated = truncated.slice(0, lastSpace);
    return truncated + '…';
  }

  // Keep only the last `max` messages for Drive persistence.
  function trimMessages(messages, max) {
    if (!Array.isArray(messages)) return [];
    if (max == null || max < 1) return messages;
    if (messages.length <= max) return messages;
    return messages.slice(messages.length - max);
  }

  async function callLLM(llm, messages, ollamaOpts = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      if (llm.provider === 'ollama' || llm.provider === 'other') {
        const endpoint = (llm.endpoint || 'http://localhost:11434').replace(/\/$/, '');
        const model = llm.model || 'llama3.2';
        const res = await fetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ model, messages, stream: false, think: false, ...ollamaOpts }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Ollama error ${res.status}${errText ? ': ' + errText.slice(0, 120) : ''}`);
        }
        const data = await res.json();
        return data.message?.content || '';
      }
      if (llm.provider === 'gemini') {
        const model = llm.model || 'gemini-2.0-flash';
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llm.apiKey}` },
          signal: controller.signal,
          body: JSON.stringify({ model, messages }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          let detail = body;
          try { detail = JSON.parse(body)?.error?.message || body; } catch { }
          const friendly = res.status === 429
            ? 'Rate limit hit — wait a moment and try again'
            : res.status === 403
              ? 'API key rejected — check it in Settings'
              : detail.slice(0, 150) || `HTTP ${res.status}`;
          throw new Error(`Gemini: ${friendly}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }
      throw new Error(`Provider "${llm.provider}" is not yet supported for chat.`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    MULTI_COLOR,
    DEFAULT_LABEL_COLOR,
    daysSince,
    relativeDate,
    formatDate,
    formatShort,
    uid,
    labelsFor,
    colorFor,
    importanceScore,
    generateThreadName,
    trimMessages,
    callLLM,
  };
}));
