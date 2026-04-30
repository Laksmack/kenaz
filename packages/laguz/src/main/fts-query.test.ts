import { describe, it, expect } from 'vitest';
import { buildFtsMatchQuery } from './fts-query';

describe('buildFtsMatchQuery', () => {
  it('returns null for empty', () => {
    expect(buildFtsMatchQuery('')).toBeNull();
    expect(buildFtsMatchQuery('   ')).toBeNull();
  });

  it('quotes tokens', () => {
    expect(buildFtsMatchQuery('hello world')).toBe('"hello" "world"');
  });

  it('returns null when tokens sanitize to empty', () => {
    expect(buildFtsMatchQuery("*** '''")).toBeNull();
  });
});
