// Runtime-supplied paths so service code doesn't import from 'electron'.
//
// Under Electron, main.ts calls configurePaths({ userData: app.getPath('userData') })
// before any service is constructed. Under the sidecar, sidecar/src/laguz.ts
// supplies its own location (~/.futhark/laguz by default).
//
// Services that need a writable per-app directory call userDataDir().

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
      '[Laguz] paths not configured — call configurePaths() before constructing services',
    );
  }
  return _paths.userData;
}
