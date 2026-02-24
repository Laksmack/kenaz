export interface NoteSummary {
  id: string;
  path: string;
  title: string;
  type: string | null;
  subtype: string | null;
  company: string | null;
  date: string | null;
  created: string | null;
  modified: string | null;
  processed: number;
  word_count: number;
  tags: string[];
}

export interface NoteDetail extends NoteSummary {
  content: string;
  meta: Record<string, string>;
}

export type ViewType = 'scratch' | 'vault' | 'grouped' | 'flat' | 'context' | 'cabinet';

// ── Config Types ──────────────────────────────────────────────

interface SectionBase {
  id: string;
  label: string;
  enabled: boolean;
}

interface BuiltinSection extends SectionBase {
  type: 'scratch' | 'vault';
}

interface GroupedSection extends SectionBase {
  type: 'grouped';
  path: string;
  icon: string;
}

interface FlatSection extends SectionBase {
  type: 'flat';
  path: string;
  icon: string;
}

export type Section = BuiltinSection | GroupedSection | FlatSection;

export interface EditorConfig {
  lineNumbers: 'auto' | 'on' | 'off';
}

export interface LaguzConfig {
  vaultPath: string;
  sections: Section[];
  editor?: EditorConfig;
}

export interface SelectedItem {
  sectionId: string;
  value: string;
}

// ── PDF Types ─────────────────────────────────────────────────

export interface PdfInfo {
  pageCount: number;
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
  creationDate: string | null;
  modificationDate: string | null;
}

export interface PdfAnnotation {
  id: string;
  type: 'highlight' | 'underline' | 'text-note' | 'text-box' | 'signature';
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  text?: string;
  color: string;
  author: 'user' | 'claude';
}

export interface PdfField {
  id: string;
  label: string;
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  currentValue?: string;
}

export interface SignatureInfo {
  name: string;
  pngBase64: string;
}

export interface CompScienceProfile {
  company: string;
  address: string;
  signatory: string;
  title: string;
}

export interface CabinetDocument {
  id: string;
  path: string;
  filename: string;
  ext: string;
  folder: string;
  size: number;
  modified: string | null;
  created: string | null;
  ocr_status: string;
  page_count: number | null;
  tags: string[];
  extracted_text?: string | null;
}

export interface CabinetOcrStatus {
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

export interface VaultFolder {
  name: string;
  path: string;
}

export interface FolderContextData {
  folder: string;
  notes: NoteSummary[];
  emails: any[];
  tasks: any[];
  events: any[];
}

declare global {
  interface Window {
    laguz: {
      platform: string;
      getPathForFile: (file: File) => string;
      search: (params: { q?: string; type?: string; company?: string; since?: string; tags?: string }) => Promise<NoteSummary[]>;
      getNote: (path: string) => Promise<NoteDetail | null>;
      getMeetings: (company: string, since?: string) => Promise<NoteSummary[]>;
      getAccount: (path: string) => Promise<NoteSummary[]>;
      getSubfolders: (parentPath: string) => Promise<string[]>;
      getFolderNotes: (folderPath: string) => Promise<NoteSummary[]>;
      getUnprocessed: (since?: string) => Promise<NoteSummary[]>;
      writeNote: (path: string, content: string) => Promise<NoteDetail>;
      updateFrontmatter: (path: string, fields: Record<string, any>) => Promise<{ path: string; updated: string[] }>;
      getCompanies: () => Promise<string[]>;
      getRecent: (limit?: number) => Promise<NoteSummary[]>;
      readFile: (filePath: string) => Promise<{ path: string; content: string; modified: string } | null>;
      readFileBase64: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean }>;
      createFile: (filePath: string, content?: string) => Promise<any>;
      renameFile: (oldPath: string, newPath: string) => Promise<{ oldPath: string; newPath: string; success: boolean }>;
      deleteFile: (filePath: string) => Promise<{ path: string; success: boolean }>;
      getVaultFiles: (ext?: string) => Promise<Array<{ path: string; filename: string; ext: string; modified: string; size: number }>>;
      copyAttachment: (sourcePath: string) => Promise<{ path: string; filename: string }>;
      readExternalFile: (filePath: string) => Promise<{ content: string; filename: string }>;
      getConfig: () => Promise<LaguzConfig>;
      saveConfig: (config: LaguzConfig) => Promise<LaguzConfig>;

      // DOCX
      readDocxHtml: (filePath: string) => Promise<{ html: string; messages: any[] }>;
      convertDocxToPdf: (filePath: string, outputPath?: string) => Promise<{ pdfPath: string; absolutePath: string }>;

      // PDF
      readPdfBase64: (filePath: string) => Promise<string>;
      readPdfText: (filePath: string) => Promise<string>;
      getPdfInfo: (filePath: string) => Promise<PdfInfo>;
      addPdfAnnotation: (filePath: string, annotation: PdfAnnotation) => Promise<{ success: boolean }>;
      placePdfSignature: (filePath: string, page: number, rect: { x: number; y: number; width: number; height: number }, signatureName?: string) => Promise<{ success: boolean }>;
      placePdfSignatureRaw: (filePath: string, page: number, rect: { x: number; y: number; width: number; height: number }, pngBase64: string) => Promise<{ success: boolean }>;
      flattenPdf: (filePath: string, outputPath?: string) => Promise<{ outputPath: string }>;
      fillPdfField: (filePath: string, fieldRect: { page: number; x: number; y: number; width: number; height: number }, value: string) => Promise<{ success: boolean }>;
      readSidecar: (pdfPath: string) => Promise<string | null>;
      writeSidecar: (pdfPath: string, content: string) => Promise<{ success: boolean }>;

      // Signatures
      getSignatures: () => Promise<SignatureInfo[]>;
      saveSignature: (name: string, pngBase64: string) => Promise<{ success: boolean }>;
      deleteSignature: (name: string) => Promise<{ success: boolean }>;
      getProfile: () => Promise<CompScienceProfile | null>;
      saveProfile: (profile: CompScienceProfile) => Promise<{ success: boolean }>;

      // Folders
      getVaultFolders: () => Promise<Array<{ name: string; path: string }>>;
      getFolderContext: (folderName: string) => Promise<FolderContextData>;

      // Update
      onUpdateState: (callback: (state: { status: string; version?: string; percent?: number; message?: string }) => void) => () => void;
      checkForUpdates: () => Promise<any>;
      installUpdate: () => Promise<void>;

      // Cabinet
      getCabinetFolders: (parent?: string) => Promise<string[]>;
      getCabinetDocuments: (folder?: string, ext?: string) => Promise<CabinetDocument[]>;
      searchCabinet: (q: string, filters?: { folder?: string; ext?: string }) => Promise<CabinetDocument[]>;
      getCabinetDocument: (docPath: string) => Promise<CabinetDocument | null>;
      tagCabinetDocument: (docPath: string, tags: string[]) => Promise<{ success: boolean }>;
      createCabinetFolder: (folderPath: string) => Promise<{ success: boolean }>;
      moveCabinetDocument: (from: string, to: string) => Promise<{ newPath: string }>;
      getCabinetOcrStatus: () => Promise<CabinetOcrStatus>;
      copyCabinetFile: (sourcePath: string, targetFolder: string) => Promise<{ path: string; filename: string }>;

      crossAppFetch: (url: string, options?: any) => Promise<any>;
      onOpenFile: (cb: (path: string) => void) => () => void;
    };
  }
}
