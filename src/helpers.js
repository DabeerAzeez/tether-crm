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
  };
}));
