import path from 'path';
import { describe, it, expect } from 'vitest';
import { isPathInsideVault, resolveVaultAbsolute } from './vault-path';

const vault = path.resolve('/Users/me/vault');

describe('isPathInsideVault', () => {
  it('allows file inside vault', () => {
    expect(isPathInsideVault(path.join(vault, 'a/b.md'), vault)).toBe(true);
  });

  it('rejects parent escape', () => {
    expect(isPathInsideVault(path.join(vault, '..', 'etc', 'passwd'), vault)).toBe(false);
  });
});

describe('resolveVaultAbsolute', () => {
  it('resolves relative path under vault', () => {
    expect(resolveVaultAbsolute('notes/x.md', vault)).toBe(path.join(vault, 'notes/x.md'));
  });

  it('throws when path escapes vault', () => {
    expect(() => resolveVaultAbsolute('../../outside', vault)).toThrow(/outside vault/);
  });
});
