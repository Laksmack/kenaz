import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseNaturalLanguage } from '../shared/parse-natural-language';

describe('parseNaturalLanguage', () => {
  beforeEach(() => {
    // Pin "now" to 2026-03-01T12:00:00 for stable chrono parsing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00'));
  });

  it('returns null for text without a date', () => {
    expect(parseNaturalLanguage('hello world')).toBeNull();
  });

  it('parses a simple event with date and time', () => {
    const result = parseNaturalLanguage('Lunch tomorrow at noon');
    expect(result).not.toBeNull();
    expect(result!.summary).toBeTruthy();
    // Should parse "tomorrow at noon" as start
    const start = new Date(result!.start);
    expect(start.getHours()).toBe(12);
  });

  it('defaults to 1-hour duration when no end time is given', () => {
    const result = parseNaturalLanguage('Meeting tomorrow at 2pm');
    expect(result).not.toBeNull();
    const start = new Date(result!.start);
    const end = new Date(result!.end);
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);
  });

  it('extracts a location from "at <place>" pattern', () => {
    // The regex requires the location to end at a time-word or end-of-string
    const result = parseNaturalLanguage('Lunch at Zocalo on March 5');
    expect(result).not.toBeNull();
    expect(result!.location).toBe('Zocalo');
  });

  it('extracts email attendees', () => {
    const result = parseNaturalLanguage('Sync with bob@example.com tomorrow at 3pm');
    expect(result).not.toBeNull();
    expect(result!.attendees).toContain('bob@example.com');
  });

  it('extracts multiple email attendees', () => {
    const result = parseNaturalLanguage('Planning with alice@co.com bob@co.com tomorrow at 10am');
    expect(result).not.toBeNull();
    expect(result!.attendees).toHaveLength(2);
  });

  it('removes date/time and emails from summary', () => {
    const result = parseNaturalLanguage('Sync with bob@example.com tomorrow at 3pm');
    expect(result).not.toBeNull();
    expect(result!.summary).not.toContain('bob@example.com');
    expect(result!.summary).not.toContain('tomorrow');
  });

  it('uses "New Event" as fallback summary', () => {
    const result = parseNaturalLanguage('tomorrow at 3pm');
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('New Event');
  });
});
