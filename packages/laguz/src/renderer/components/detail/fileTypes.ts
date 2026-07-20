// ── File-type detection helpers ─────────────────────────────
// Shared by the NoteDetail router and the individual viewers.

export function isMarkdown(filePath: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(filePath);
}

export function isPdf(filePath: string): boolean {
  return /\.pdf$/i.test(filePath);
}

export function isDocx(filePath: string): boolean {
  return /\.docx?$/i.test(filePath);
}

export function isHtml(filePath: string): boolean {
  return /\.html?$/i.test(filePath);
}

const IMAGE_VIEWER_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif']);

export function isImage(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return IMAGE_VIEWER_EXTS.has(ext);
}

export function extFromPath(filePath: string): string {
  const m = filePath.match(/\.([^./]+)$/);
  return m ? m[1].toLowerCase() : '';
}

export const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  tiff: 'image/tiff', tif: 'image/tiff',
};
