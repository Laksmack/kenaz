// Runtime-supplied paths so service code doesn't import from 'electron'.
//
// Under Electron, main.ts calls configurePaths({ userData: app.getPath('userData') })
// before any service is constructed. Under the sidecar, sidecar/src/raido.ts
// supplies its own location (~/.futhark/raido by default).

interface Paths {
  userData: string;
}

let _paths: Paths | null = null;

export function configurePaths(p: Paths): void {
  _paths = p;
}

export function userDataDir(): string {
  if (!_paths) {
    throw new Error(
      '[Raidō] paths not configured — call configurePaths() before constructing services',
    );
  }
  return _paths.userData;
}
