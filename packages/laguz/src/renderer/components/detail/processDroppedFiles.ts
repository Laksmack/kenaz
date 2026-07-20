// ── Attachment drop helper ──────────────────────────────────
// Copies dropped files into the vault's _attachments/ folder and
// returns markdown links (plus any inline text the user chose to embed).

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const INLINE_TEXT_EXTS = new Set(['txt', 'md', 'csv']);

export interface DropResult {
  links: string[];
  inlineContent?: string;
  /** Vault-relative paths of any PDFs that were attached */
  pdfPaths: string[];
  /** Vault-relative paths of all attached files */
  allPaths: string[];
}

export async function processDroppedFiles(files: FileList): Promise<DropResult> {
  const links: string[] = [];
  const pdfPaths: string[] = [];
  const allPaths: string[] = [];
  let inlineContent: string | undefined;

  for (const file of Array.from(files)) {
    const filePath = window.laguz.getPathForFile(file);
    if (!filePath) continue;

    const ext = filePath.split('.').pop()?.toLowerCase() || '';

    if (INLINE_TEXT_EXTS.has(ext)) {
      const shouldInline = confirm(
        `Insert content of "${file.name}" directly?\n\nOK = inline the text content\nCancel = insert as attachment link`
      );
      if (shouldInline) {
        const { content } = await window.laguz.readExternalFile(filePath);
        inlineContent = (inlineContent ? inlineContent + '\n\n' : '') + content;
        continue;
      }
    }

    const result = await window.laguz.copyAttachment(filePath);
    allPaths.push(result.path);

    if (ext === 'pdf') {
      pdfPaths.push(result.path);
      links.push(`[${result.filename}](${result.path})`);
    } else {
      const link = IMAGE_EXTS.has(ext)
        ? `![${result.filename}](${result.path})`
        : `[${result.filename}](${result.path})`;
      links.push(link);
    }
  }

  return { links, inlineContent, pdfPaths, allPaths };
}
