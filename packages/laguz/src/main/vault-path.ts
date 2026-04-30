import path from 'path';

/** True if `resolvedAbs` lies inside `vaultRootResolved` (same device, no `..` escape). */
export function isPathInsideVault(resolvedAbs: string, vaultRootResolved: string): boolean {
  const root = path.resolve(vaultRootResolved);
  const abs = path.resolve(resolvedAbs);
  const rel = path.relative(root, abs);
  if (rel === '..') return false;
  if (rel.startsWith(`..${path.sep}`)) return false;
  if (path.isAbsolute(rel)) return false;
  return true;
}

/**
 * Resolve a vault-relative or absolute path under the vault root.
 * @throws If the path escapes the vault.
 */
export function resolveVaultAbsolute(userPath: string, vaultRootResolved: string): string {
  const root = path.resolve(vaultRootResolved);
  const abs = path.isAbsolute(userPath) ? path.resolve(userPath) : path.resolve(root, userPath);
  if (!isPathInsideVault(abs, root)) {
    throw new Error('Access denied: path outside vault');
  }
  return abs;
}
