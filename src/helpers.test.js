import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import helpers from './helpers.js';

describe('TetherHelpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-24T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('daysSince', () => {
    it('returns Infinity if no iso string is provided', () => {
      expect(helpers.daysSince(null)).toBe(Infinity);
      expect(helpers.daysSince(undefined)).toBe(Infinity);
      expect(helpers.daysSince('')).toBe(Infinity);
    });

    it('calculates days since given ISO string', () => {
      // 1 day ago
      expect(helpers.daysSince('2026-04-23T12:00:00Z')).toBe(1);
      // 5 days ago
      expect(helpers.daysSince('2026-04-19T12:00:00Z')).toBe(5);
    });
  });

  describe('relativeDate', () => {
    it('returns Unknown for invalid date', () => {
      expect(helpers.relativeDate(null)).toBe('Unknown');
    });

    it('returns Today for 0 days', () => {
      expect(helpers.relativeDate('2026-04-24T00:00:00Z')).toBe('Today');
    });

    it('returns Yesterday for 1 day', () => {
      expect(helpers.relativeDate('2026-04-23T00:00:00Z')).toBe('Yesterday');
    });

    it('returns days ago for < 7 days', () => {
      expect(helpers.relativeDate('2026-04-20T00:00:00Z')).toBe('4 days ago');
    });

    it('returns weeks ago for < 30 days', () => {
      expect(helpers.relativeDate('2026-04-10T00:00:00Z')).toBe('2 weeks ago');
    });

    it('returns months ago for < 365 days', () => {
      expect(helpers.relativeDate('2026-02-24T00:00:00Z')).toBe('1 month ago');
      expect(helpers.relativeDate('2025-12-24T00:00:00Z')).toBe('4 months ago');
    });

    it('returns years ago for >= 365 days', () => {
      expect(helpers.relativeDate('2025-04-24T00:00:00Z')).toBe('1 year ago');
      expect(helpers.relativeDate('2024-04-24T00:00:00Z')).toBe('2 years ago');
    });
  });

  describe('formatDate', () => {
    it('formats date correctly', () => {
      // Note: toLocaleDateString might be timezone dependent in some environments, but with UTC it should be fine.
      // We'll test a basic format.
      const formatted = helpers.formatDate('2026-04-24T12:00:00Z');
      expect(formatted).toMatch(/Apr 24, 2026/);
    });
  });

  describe('formatShort', () => {
    it('formats short date correctly', () => {
      const formatted = helpers.formatShort('2026-04-24T12:00:00Z');
      expect(formatted).toMatch(/Apr 24/);
    });
  });

  describe('uid', () => {
    it('generates a string of length 8', () => {
      expect(helpers.uid()).toHaveLength(8);
    });
    
    it('generates unique values', () => {
      expect(helpers.uid()).not.toBe(helpers.uid());
    });
  });

  describe('labelsFor', () => {
    it('deduplicates labels and matches custom labels', () => {
      const contact = {
        crmLabels: ['CRM: Friend', 'Colleague'],
        googleLabels: ['Friend', 'Family']
      };
      
      const customLabels = [
        { label: 'Friend', color: '#ff0000', key: 'lbl-friend' },
        { label: 'Colleague', color: '#00ff00', key: 'lbl-colleague' }
      ];

      const result = helpers.labelsFor(contact, customLabels);
      
      expect(result).toHaveLength(3);
      
      // Should find the custom 'Friend' label
      const friendLabel = result.find(l => l.label === 'Friend');
      expect(friendLabel.color).toBe('#ff0000');
      
      // Should find the custom 'Colleague' label
      const colleagueLabel = result.find(l => l.label === 'Colleague');
      expect(colleagueLabel.color).toBe('#00ff00');
      
      // Should create a default label for 'Family'
      const familyLabel = result.find(l => l.label === 'Family');
      expect(familyLabel.color).toBe(helpers.DEFAULT_LABEL_COLOR);
    });
  });

  describe('colorFor', () => {
    it('returns MULTI_COLOR for multiple labels', () => {
      const contact = { crmLabels: ['A', 'B'], googleLabels: [] };
      expect(helpers.colorFor(contact, [])).toBe(helpers.MULTI_COLOR);
    });

    it('returns custom color for single matching label', () => {
      const contact = { crmLabels: ['Friend'], googleLabels: [] };
      const customLabels = [{ label: 'Friend', color: '#ff0000', key: 'lbl-friend' }];
      expect(helpers.colorFor(contact, customLabels)).toBe('#ff0000');
    });

    it('returns DEFAULT_LABEL_COLOR for single non-matching label', () => {
      const contact = { crmLabels: ['Unknown'], googleLabels: [] };
      expect(helpers.colorFor(contact, [])).toBe(helpers.DEFAULT_LABEL_COLOR);
    });

    it('returns DEFAULT_LABEL_COLOR for zero labels', () => {
      const contact = { crmLabels: [], googleLabels: [] };
      expect(helpers.colorFor(contact, [])).toBe(helpers.DEFAULT_LABEL_COLOR);
    });
  });

  describe('importanceScore', () => {
    it('calculates score based on multiple factors', () => {
      const contact = {
        googleLabels: ['Contact'], // +2
        crmLabels: ['VIP'], // +5
        nudgeFrequencyDays: 7, // +10
        lastContactedAt: '2026-04-14T12:00:00Z', // 10 days ago (<30) = +5
        name: 'John', phone: '123', email: 'a@b.com', // +3
        location: 'NY' // +1
      };
      // Total: 2 + 5 + 10 + 5 + 3 + 1 = 26
      expect(helpers.importanceScore(contact)).toBe(26);
    });
  });
});
