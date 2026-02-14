import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { BrowserWindow } from 'electron';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ConfigStore } from './config';
import { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI } from './oauth-config';
import type { Email, EmailThread, EmailAddress, Attachment, SendEmailPayload } from '../shared/types';

// RFC 2047 encode a header value if it contains non-ASCII characters
function mimeEncodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value; // pure ASCII, no encoding needed
  const encoded = Buffer.from(value, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

// Optional: users can override bundled credentials with a local file
function getCredentialsPath(): string {
  return path.join(app.getPath('userData'), 'credentials.json');
}

function getTokenPath(): string {
  return path.join(app.getPath('userData'), 'token.json');
}

/**
 * Returns OAuth client_id and client_secret.
 * Uses bundled credentials by default; falls back to credentials.json if bundled ones are empty.
 */
function getOAuthCredentials(): { client_id: string; client_secret: string } | null {
  // 1. Use bundled credentials if configured
  if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
    return { client_id: OAUTH_CLIENT_ID, client_secret: OAUTH_CLIENT_SECRET };
  }

  // 2. Fall back to local credentials.json
  const credPath = getCredentialsPath();
  if (fs.existsSync(credPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      const { client_id, client_secret } = creds.installed || creds.web || {};
      if (client_id && client_secret) {
        return { client_id, client_secret };
      }
    } catch (e) {
      console.error('Failed to parse credentials.json:', e);
    }
  }

  return null;
}

export class GmailService {
  private oauth2Client: OAuth2Client | null = null;
  private gmail: gmail_v1.Gmail | null = null;
  private config: ConfigStore;
  private labelCache: Map<string, string> = new Map(); // name → id
  private userEmail: string = '';

  getOAuth2Client(): OAuth2Client | null {
    return this.oauth2Client;
  }

  getUserEmail(): string {
    return this.userEmail;
  }

  constructor(config: ConfigStore) {
    this.config = config;
    this.tryLoadExistingToken();
  }

  private tryLoadExistingToken() {
    try {
      const oauthCreds = getOAuthCredentials();
      if (!oauthCreds) return;

      this.oauth2Client = new OAuth2Client(oauthCreds.client_id, oauthCreds.client_secret, OAUTH_REDIRECT_URI);

      const tokenPath = getTokenPath();
      if (fs.existsSync(tokenPath)) {
        const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
        this.oauth2Client.setCredentials(token);
        this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
        this.cacheLabelIds();
      }
    } catch (e) {
      console.error('Failed to load existing token:', e);
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.oauth2Client || !this.gmail) {
      console.log('[Gmail] Not authenticated: oauth2Client or gmail client missing');
      return false;
    }
    try {
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      this.userEmail = profile.data.emailAddress || '';
      console.log('[Gmail] Authenticated as:', this.userEmail);
      return true;
    } catch (e: any) {
      console.error('[Gmail] Auth check failed:', e.message);
      return false;
    }
  }

  /**
   * Lightweight profile fetch — used by connectivity monitor to probe API access.
   */
  async getProfile(): Promise<{ email: string; historyId: string }> {
    if (!this.gmail) throw new Error('Not authenticated');
    const profile = await this.gmail.users.getProfile({ userId: 'me' });
    return {
      email: profile.data.emailAddress || '',
      historyId: profile.data.historyId || '',
    };
  }

  /**
   * Fetch history records since a given historyId.
   * Used by the sync engine for incremental sync.
   */
  async getHistory(startHistoryId: string): Promise<{ history: any[]; historyId: string }> {
    if (!this.gmail) throw new Error('Not authenticated');
    const allHistory: any[] = [];
    let pageToken: string | undefined;
    let latestHistoryId = startHistoryId;

    do {
      const res = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
        pageToken,
      });

      if (res.data.history) {
        allHistory.push(...res.data.history);
      }
      latestHistoryId = res.data.historyId || latestHistoryId;
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    return { history: allHistory, historyId: latestHistoryId };
  }

  async authenticate(): Promise<{ success: boolean; error?: string }> {
    try {
      const oauthCreds = getOAuthCredentials();
      if (!oauthCreds) {
        return {
          success: false,
          error: 'OAuth credentials are not configured. Please contact the app developer.',
        };
      }

      this.oauth2Client = new OAuth2Client(oauthCreds.client_id, oauthCreds.client_secret, OAUTH_REDIRECT_URI);

      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
      });

      // Open auth URL in browser and listen for callback
      const code = await this.listenForAuthCode(authUrl);
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Save token
      fs.writeFileSync(getTokenPath(), JSON.stringify(tokens, null, 2));

      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      await this.cacheLabelIds();

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  private listenForAuthCode(authUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const parsed = url.parse(req.url || '', true);
          if (parsed.pathname === '/') {
            const code = parsed.query.code as string;
            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<html><head><meta charset="utf-8"></head><body style="background:#0a0a0a;color:#f0e6da;font-family:Outfit,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-size:24px">Kenaz <span style="color:#F7A94B">ᚲ</span> authenticated!</h2><p style="color:#999;margin-top:8px">You can close this tab.</p></div></body></html>');
              server.close();
              resolve(code);
            }
          }
        } catch (e) {
          reject(e);
        }
      });
      server.listen(8234);

      // Open browser
      const { shell } = require('electron');
      shell.openExternal(authUrl);
    });
  }

  private async cacheLabelIds() {
    if (!this.gmail) return;
    try {
      const res = await this.gmail.users.labels.list({ userId: 'me' });
      for (const label of res.data.labels || []) {
        if (label.name && label.id) {
          this.labelCache.set(label.name, label.id);
        }
      }
      // Ensure PENDING and TODO labels exist
      await this.ensureLabel('PENDING');
      await this.ensureLabel('TODO');
    } catch (e) {
      console.error('Failed to cache labels:', e);
    }
  }

  private async ensureLabel(name: string): Promise<string> {
    if (this.labelCache.has(name)) return this.labelCache.get(name)!;
    if (!this.gmail) throw new Error('Not authenticated');

    const res = await this.gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    if (res.data.id) {
      this.labelCache.set(name, res.data.id);
      return res.data.id;
    }
    throw new Error(`Failed to create label: ${name}`);
  }

  private getLabelId(name: string): string | undefined {
    return this.labelCache.get(name);
  }

  // ── Fetch Threads ──────────────────────────────────────────

  async fetchThreads(query: string, maxResults: number = 50, pageToken?: string): Promise<{ threads: EmailThread[]; nextPageToken?: string }> {
    if (!this.gmail) throw new Error('Not authenticated');

    const res = await this.gmail.users.threads.list({
      userId: 'me',
      q: query || undefined,
      maxResults,
      pageToken: pageToken || undefined,
    });

    const threads = res.data.threads || [];
    const results: EmailThread[] = [];

    // Fetch thread details in parallel (batches of 20) using metadata format for speed
    for (let i = 0; i < threads.length; i += 20) {
      const batch = threads.slice(i, i + 20);
      const details = await Promise.all(
        batch.map((t) => this.fetchThreadMetadata(t.id!))
      );
      results.push(...details.filter((d): d is EmailThread => d !== null));
    }

    return { threads: results, nextPageToken: res.data.nextPageToken || undefined };
  }

  /**
   * Lightweight thread fetch using 'metadata' format — much faster than 'full'.
   * Only returns headers, labels, and snippet (no body content).
   * Used for list views where we don't need message bodies.
   */
  private async fetchThreadMetadata(threadId: string): Promise<EmailThread | null> {
    if (!this.gmail) throw new Error('Not authenticated');

    try {
      const res = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date'],
      });

      const rawMessages = res.data.messages || [];
      if (rawMessages.length === 0) return null;

      const messages: Email[] = rawMessages.map((msg) => {
        const headers = msg.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        const from = this.parseEmailAddress(getHeader('From'));
        const to = this.parseEmailAddresses(getHeader('To'));
        const cc = this.parseEmailAddresses(getHeader('Cc'));
        const bcc = this.parseEmailAddresses(getHeader('Bcc'));

        return {
          id: msg.id || '',
          threadId: msg.threadId || '',
          from,
          to,
          cc,
          bcc,
          subject: getHeader('Subject'),
          snippet: msg.snippet || '',
          body: '', // Not available in metadata format
          bodyText: '', // Not available in metadata format
          date: getHeader('Date'),
          labels: msg.labelIds || [],
          isUnread: (msg.labelIds || []).includes('UNREAD'),
          attachments: [], // Not available in metadata format
          hasAttachments: false,
        };
      });

      // Check for attachments via a quick look at the last message payload parts
      const lastRawMsg = rawMessages[rawMessages.length - 1];
      const hasAttachments = this.checkHasAttachments(lastRawMsg);
      if (hasAttachments) {
        messages[messages.length - 1].hasAttachments = true;
      }

      const lastMessage = messages[messages.length - 1];
      const allLabels = [...new Set(messages.flatMap((m) => m.labels))];
      const participants = this.extractParticipants(messages);

      return {
        id: threadId,
        subject: lastMessage.subject,
        snippet: lastMessage.snippet,
        messages,
        lastDate: lastMessage.date,
        labels: allLabels,
        isUnread: messages.some((m) => m.isUnread),
        from: lastMessage.from,
        participants,
      };
    } catch (e) {
      console.error(`Failed to fetch thread metadata ${threadId}:`, e);
      return null;
    }
  }

  /**
   * Quick check if a message likely has attachments (works with metadata format).
   */
  private checkHasAttachments(msg: gmail_v1.Schema$Message): boolean {
    const payload = msg?.payload;
    if (!payload) return false;
    // In metadata format, parts are minimal but we can check the payload structure
    const parts = payload.parts || [];
    return parts.some((p) =>
      p.filename && p.filename.length > 0 && p.body?.attachmentId
    );
  }

  async fetchThread(threadId: string): Promise<EmailThread | null> {
    if (!this.gmail) throw new Error('Not authenticated');

    try {
      const res = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });

      const messages = (res.data.messages || []).map((msg) => this.parseMessage(msg));
      if (messages.length === 0) return null;

      // Resolve any deferred cid: inline images that need async attachment fetch
      await this.resolveInlineImages(messages);

      const lastMessage = messages[messages.length - 1];
      const allLabels = [...new Set(messages.flatMap((m) => m.labels))];
      const participants = this.extractParticipants(messages);

      return {
        id: threadId,
        subject: lastMessage.subject,
        snippet: lastMessage.snippet,
        messages,
        lastDate: lastMessage.date,
        labels: allLabels,
        isUnread: messages.some((m) => m.isUnread),
        from: lastMessage.from,
        participants,
      };
    } catch (e) {
      console.error(`Failed to fetch thread ${threadId}:`, e);
      return null;
    }
  }

  private parseMessage(msg: gmail_v1.Schema$Message): Email {
    const headers = msg.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const from = this.parseEmailAddress(getHeader('From'));
    const to = this.parseEmailAddresses(getHeader('To'));
    const cc = this.parseEmailAddresses(getHeader('Cc'));
    const bcc = this.parseEmailAddresses(getHeader('Bcc'));

    let { html, text } = this.extractBody(msg.payload);
    const attachments = this.extractAttachments(msg.payload);

    // Resolve cid: inline images — extract Content-ID → data URI map
    const cidMap = this.extractInlineImages(msg.payload, msg.id || '');
    if (html && Object.keys(cidMap).length > 0) {
      for (const [cid, dataUri] of Object.entries(cidMap)) {
        // Replace cid:xxx references (with and without angle brackets)
        html = html.replace(new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), dataUri);
      }
    }

    return {
      id: msg.id || '',
      threadId: msg.threadId || '',
      from,
      to,
      cc,
      bcc,
      subject: getHeader('Subject'),
      snippet: msg.snippet || '',
      body: html || `<pre style="font-family: -apple-system, sans-serif; white-space: pre-wrap;">${this.escapeHtml(text)}</pre>`,
      bodyText: text,
      date: new Date(parseInt(msg.internalDate || '0')).toISOString(),
      labels: msg.labelIds || [],
      isUnread: (msg.labelIds || []).includes('UNREAD'),
      hasAttachments: attachments.length > 0,
      attachments,
    };
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): { html: string; text: string } {
    let html = '';
    let text = '';

    if (!payload) return { html, text };

    const processpart = (part: gmail_v1.Schema$MessagePart) => {
      if (part.mimeType === 'text/html' && part.body?.data) {
        html = Buffer.from(part.body.data, 'base64url').toString('utf-8');
      } else if (part.mimeType === 'text/plain' && part.body?.data) {
        text = Buffer.from(part.body.data, 'base64url').toString('utf-8');
      }
      if (part.parts) {
        part.parts.forEach(processpart);
      }
    };

    processpart(payload);
    return { html, text };
  }

  private extractAttachments(payload: gmail_v1.Schema$MessagePart | undefined): Attachment[] {
    const attachments: Attachment[] = [];

    const processPart = (part: gmail_v1.Schema$MessagePart) => {
      if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        part.parts.forEach(processPart);
      }
    };

    if (payload) processPart(payload);
    return attachments;
  }

  /**
   * Extract inline images (Content-ID parts) and return a cid → data URI map.
   * These are images embedded in the HTML body via cid: references (e.g. signatures, logos).
   */
  private extractInlineImages(payload: gmail_v1.Schema$MessagePart | undefined, messageId: string): Record<string, string> {
    const cidMap: Record<string, string> = {};
    if (!payload) return cidMap;

    const processPart = (part: gmail_v1.Schema$MessagePart) => {
      const headers = part.headers || [];
      const contentId = headers.find((h) => h.name?.toLowerCase() === 'content-id')?.value;
      const mimeType = part.mimeType || '';

      if (contentId && mimeType.startsWith('image/')) {
        // Strip angle brackets from Content-ID: <image001.png@xxx> → image001.png@xxx
        const cid = contentId.replace(/^<|>$/g, '');

        if (part.body?.data) {
          // Inline data available directly (base64url encoded)
          const base64 = Buffer.from(part.body.data, 'base64url').toString('base64');
          cidMap[cid] = `data:${mimeType};base64,${base64}`;
        } else if (part.body?.attachmentId) {
          // Will need to be fetched async — store attachment info for later
          cidMap[cid] = `__KENAZ_CID_FETCH__:${messageId}:${part.body.attachmentId}:${mimeType}`;
        }
      }

      if (part.parts) {
        part.parts.forEach(processPart);
      }
    };

    processPart(payload);
    return cidMap;
  }

  /**
   * Resolve deferred inline image fetches (cid: images that need attachment API calls).
   * Mutates messages in place, replacing placeholder URIs with actual data URIs.
   */
  private async resolveInlineImages(messages: Email[]): Promise<void> {
    const placeholder = '__KENAZ_CID_FETCH__:';
    const fetches: Promise<void>[] = [];

    for (const msg of messages) {
      if (!msg.body || !msg.body.includes(placeholder)) continue;

      // Find all placeholders in this message
      const regex = /__KENAZ_CID_FETCH__:([^:]+):([^:]+):([^"'\s)]+)/g;
      let match: RegExpExecArray | null;
      const replacements: { from: string; messageId: string; attachmentId: string; mimeType: string }[] = [];

      while ((match = regex.exec(msg.body)) !== null) {
        replacements.push({
          from: match[0],
          messageId: match[1],
          attachmentId: match[2],
          mimeType: match[3],
        });
      }

      for (const r of replacements) {
        fetches.push(
          (async () => {
            try {
              const buf = await this.getAttachmentBuffer(r.messageId, r.attachmentId);
              const dataUri = `data:${r.mimeType};base64,${buf.toString('base64')}`;
              msg.body = msg.body.replace(r.from, dataUri);
            } catch (e) {
              console.error(`Failed to fetch inline image ${r.attachmentId}:`, e);
              // Remove broken placeholder so it doesn't show raw text
              msg.body = msg.body.replace(r.from, '');
            }
          })()
        );
      }
    }

    await Promise.all(fetches);
  }

  private parseEmailAddress(raw: string): EmailAddress {
    const match = raw.match(/^(.+?)\s*<(.+?)>$/);
    if (match) {
      return { name: match[1].replace(/"/g, '').trim(), email: match[2].trim() };
    }
    return { name: raw.trim(), email: raw.trim() };
  }

  private parseEmailAddresses(raw: string): EmailAddress[] {
    if (!raw) return [];
    return raw.split(',').map((s) => this.parseEmailAddress(s.trim()));
  }

  private extractParticipants(messages: Email[]): EmailAddress[] {
    const seen = new Set<string>();
    const participants: EmailAddress[] = [];
    for (const msg of messages) {
      for (const addr of [msg.from, ...msg.to, ...msg.cc]) {
        if (!seen.has(addr.email)) {
          seen.add(addr.email);
          participants.push(addr);
        }
      }
    }
    return participants;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Actions ────────────────────────────────────────────────

  async archiveThread(threadId: string): Promise<void> {
    if (!this.gmail) throw new Error('Not authenticated');
    await this.gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: {
        removeLabelIds: ['INBOX'],
      },
    });
  }

  async trashThread(threadId: string): Promise<void> {
    if (!this.gmail) throw new Error('Not authenticated');
    await this.gmail.users.threads.trash({
      userId: 'me',
      id: threadId,
    });
  }

  async modifyLabels(threadId: string, addLabel: string | null, removeLabel: string | null): Promise<void> {
    if (!this.gmail) throw new Error('Not authenticated');

    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];

    if (addLabel) {
      const id = this.getLabelId(addLabel) || await this.ensureLabel(addLabel);
      addLabelIds.push(id);
    }
    if (removeLabel) {
      const id = this.getLabelId(removeLabel);
      if (id) removeLabelIds.push(id);
    }

    if (addLabelIds.length > 0 || removeLabelIds.length > 0) {
      await this.gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: { addLabelIds, removeLabelIds },
      });
    }
  }

  async markAsRead(threadId: string): Promise<void> {
    if (!this.gmail) throw new Error('Not authenticated');
    await this.gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
  }

  // ── Attachments ─────────────────────────────────────────────

  async downloadAttachment(messageId: string, attachmentId: string, filename: string): Promise<string> {
    if (!this.gmail) throw new Error('Not authenticated');

    const res = await this.gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    const data = res.data.data;
    if (!data) throw new Error('No attachment data');

    // Decode base64url to buffer
    const buffer = Buffer.from(data, 'base64url');

    // Save to Downloads folder
    const downloadsPath = app.getPath('downloads');
    const filePath = path.join(downloadsPath, filename);

    // Avoid overwriting — append number if exists
    let finalPath = filePath;
    let counter = 1;
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(downloadsPath, `${base} (${counter})${ext}`);
      counter++;
    }

    fs.writeFileSync(finalPath, buffer);
    return finalPath;
  }

  // ── Send ───────────────────────────────────────────────────

  async sendEmail(payload: SendEmailPayload): Promise<{ id: string; threadId: string }> {
    if (!this.gmail) throw new Error('Not authenticated');

    const appConfig = this.config.get();

    // Use pre-built HTML if provided (rich editor), otherwise convert markdown
    let htmlBody = payload.body_html
      ? payload.body_html
      : this.markdownToHtml(payload.body_markdown);

    // Append signature
    if (payload.signature !== false) {
      htmlBody += `<br/><br/>${appConfig.signature}`;
    }

    // Auto-BCC: append if enabled, not skipped, and recipients aren't all excluded domains
    let bcc = payload.bcc || '';
    if (appConfig.autoBccEnabled && appConfig.autoBccAddress && !payload.skip_auto_bcc) {
      const allRecipients = [payload.to, payload.cc || '']
        .join(',')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      const excludedDomains = appConfig.autoBccExcludedDomains.map((d) => d.toLowerCase().trim());

      // Check if ALL recipients are on excluded domains
      const allExcluded = allRecipients.length > 0 && allRecipients.every((email) => {
        const domain = email.split('@')[1];
        return domain && excludedDomains.includes(domain);
      });

      if (!allExcluded) {
        // Append auto-BCC address (avoiding duplicates)
        const existingBcc = bcc.toLowerCase();
        if (!existingBcc.includes(appConfig.autoBccAddress.toLowerCase())) {
          bcc = bcc ? `${bcc}, ${appConfig.autoBccAddress}` : appConfig.autoBccAddress;
        }
      }
    }

    // Build From header with display name if configured
    const fromHeader = appConfig.displayName
      ? `From: ${mimeEncodeHeader(appConfig.displayName)} <${this.userEmail}>`
      : `From: ${this.userEmail}`;

    // Build RFC 2822 message
    let rawMessage: string;

    if (payload.attachments && payload.attachments.length > 0) {
      // Multipart MIME with attachments
      const boundary = `kenaz_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const topHeaders = [
        fromHeader,
        `To: ${payload.to}`,
        payload.cc ? `Cc: ${payload.cc}` : null,
        bcc ? `Bcc: ${bcc}` : null,
        `Subject: ${mimeEncodeHeader(payload.subject)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ].filter(Boolean);

      // Build the MIME body with proper boundary separators
      // RFC 2046: each boundary must be preceded by a CRLF, and
      // there must be a CRLF after each part's content before the next boundary.
      const mimeBody: string[] = [];

      // HTML body part
      mimeBody.push(`--${boundary}`);
      mimeBody.push('Content-Type: text/html; charset=utf-8');
      mimeBody.push('Content-Transfer-Encoding: 7bit');
      mimeBody.push('');
      mimeBody.push(htmlBody);

      // Attachment parts
      for (const att of payload.attachments) {
        // Wrap base64 at 76 chars per line per RFC 2045
        const wrappedBase64 = att.base64.replace(/(.{76})/g, '$1\r\n');
        mimeBody.push(`--${boundary}`);
        mimeBody.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
        mimeBody.push('Content-Transfer-Encoding: base64');
        mimeBody.push(`Content-Disposition: attachment; filename="${att.filename}"`);
        mimeBody.push('');
        mimeBody.push(wrappedBase64);
      }

      // Closing boundary
      mimeBody.push(`--${boundary}--`);

      rawMessage = [...topHeaders, '', ...mimeBody].join('\r\n');
    } else {
      // Simple message without attachments
      const headers = [
        fromHeader,
        `To: ${payload.to}`,
        payload.cc ? `Cc: ${payload.cc}` : null,
        bcc ? `Bcc: ${bcc}` : null,
        `Subject: ${mimeEncodeHeader(payload.subject)}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
      ].filter(Boolean);

      rawMessage = [...headers, '', htmlBody].join('\r\n');
    }

    // Debug: log MIME structure
    console.log(`[SEND] rawMessage length: ${rawMessage.length}`);
    if (payload.attachments && payload.attachments.length > 0) {
      console.log(`[SEND] attachments: ${payload.attachments.length}`);
      for (const att of payload.attachments) {
        console.log(`[SEND]   ${att.filename} (${att.mimeType}, base64 len=${att.base64.length})`);
      }
      // Log first 500 chars of the raw message for MIME header verification
      console.log(`[SEND] MIME start:\n${rawMessage.slice(0, 500)}`);
      // Log last 200 chars to verify closing boundary
      console.log(`[SEND] MIME end:\n${rawMessage.slice(-200)}`);
    }

    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const sendParams: any = {
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: payload.reply_to_thread_id || undefined,
      },
    };

    const res = await this.gmail.users.messages.send(sendParams);

    return {
      id: res.data.id || '',
      threadId: res.data.threadId || '',
    };
  }

  // ── Drafts ──────────────────────────────────────────────────

  async createDraft(payload: Partial<SendEmailPayload>): Promise<string> {
    if (!this.gmail) throw new Error('Not authenticated');

    const appConfig = this.config.get();

    // Build From header with display name if configured
    const fromHeader = appConfig.displayName
      ? `From: ${mimeEncodeHeader(appConfig.displayName)} <${this.userEmail}>`
      : `From: ${this.userEmail}`;

    // Detect if body content looks like HTML
    const bodyContent = payload.body_markdown || '';
    const isHtml = /<[a-z][\s\S]*>/i.test(bodyContent);

    const messageParts = [
      fromHeader,
      payload.to ? `To: ${payload.to}` : '',
      payload.cc ? `Cc: ${payload.cc}` : '',
      payload.bcc ? `Bcc: ${payload.bcc}` : '',
      payload.subject ? `Subject: ${mimeEncodeHeader(payload.subject)}` : 'Subject: ',
      isHtml ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      bodyContent,
    ]
      .filter((line, i) => i >= 5 || line) // keep content headers + From, filter empty address lines
      .join('\r\n');

    const encodedMessage = Buffer.from(messageParts)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await this.gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage,
          threadId: payload.reply_to_thread_id || undefined,
        },
      },
    });

    return res.data.id || '';
  }

  async listDrafts(): Promise<Array<{ id: string; threadId: string; subject: string; to: string; snippet: string; date: string }>> {
    if (!this.gmail) throw new Error('Not authenticated');

    const res = await this.gmail.users.drafts.list({
      userId: 'me',
      maxResults: 20,
    });

    if (!res.data.drafts || res.data.drafts.length === 0) return [];

    const drafts = await Promise.all(
      res.data.drafts.map(async (d) => {
        try {
          const detail = await this.gmail!.users.drafts.get({
            userId: 'me',
            id: d.id!,
            format: 'metadata',
          });
          const msg = detail.data.message;
          const headers: Array<{name?: string | null; value?: string | null}> = msg?.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h: {name?: string | null; value?: string | null}) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

          return {
            id: d.id!,
            threadId: msg?.threadId || '',
            subject: getHeader('Subject') || '(no subject)',
            to: getHeader('To'),
            snippet: msg?.snippet || '',
            date: getHeader('Date'),
          };
        } catch {
          return null;
        }
      })
    );

    return drafts.filter(Boolean) as any[];
  }

  async getDraft(draftId: string): Promise<{
    id: string;
    to: string;
    cc: string;
    bcc: string;
    subject: string;
    body: string;
    threadId: string;
    messageId: string;
  }> {
    if (!this.gmail) throw new Error('Not authenticated');

    const res = await this.gmail.users.drafts.get({
      userId: 'me',
      id: draftId,
      format: 'full',
    });

    const msg = res.data.message;
    const headers: Array<{name?: string | null; value?: string | null}> = msg?.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: {name?: string | null; value?: string | null}) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    // Extract body — prefer HTML, fall back to plain text
    let bodyText = '';
    const payload = msg?.payload;
    if (payload?.parts) {
      // Prefer HTML part for rich editor
      const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
      const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
      if (htmlPart?.body?.data) {
        bodyText = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
      } else if (textPart?.body?.data) {
        const plain = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        bodyText = plain.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
      }
    } else if (payload?.body?.data) {
      const raw = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      // Check content-type to decide if it's HTML
      const contentType = headers.find((h) => h.name?.toLowerCase() === 'content-type')?.value || '';
      if (contentType.includes('text/html')) {
        bodyText = raw;
      } else {
        // Plain text — convert to HTML paragraphs
        bodyText = raw.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
      }
    }

    return {
      id: res.data.id || '',
      to: getHeader('To'),
      cc: getHeader('Cc'),
      bcc: getHeader('Bcc'),
      subject: getHeader('Subject'),
      body: bodyText,
      threadId: msg?.threadId || '',
      messageId: msg?.id || '',
    };
  }

  async deleteDraft(draftId: string): Promise<void> {
    if (!this.gmail) throw new Error('Not authenticated');
    await this.gmail.users.drafts.delete({
      userId: 'me',
      id: draftId,
    });
  }

  // ── Labels ─────────────────────────────────────────────────

  async listLabels(): Promise<Array<{ id: string; name: string; type: string }>> {
    if (!this.gmail) throw new Error('Not authenticated');
    const res = await this.gmail.users.labels.list({ userId: 'me' });
    return (res.data.labels || []).map((l) => ({
      id: l.id || '',
      name: l.name || '',
      type: l.type || 'user',
    }));
  }

  // ── Thread Summary (AI-ready) ──────────────────────────────

  async getThreadSummary(threadId: string): Promise<any> {
    const thread = await this.fetchThread(threadId);
    if (!thread) throw new Error('Thread not found');

    const selfEmail = this.userEmail.toLowerCase();

    const participants = thread.participants.map((p) => ({
      name: p.name,
      email: p.email,
      role: p.email.toLowerCase() === selfEmail ? 'self' : 'external',
    }));

    const timeline = thread.messages.map((m) => ({
      from: m.from.name || m.from.email,
      date: m.date,
      snippet: (m.bodyText || m.snippet || '').substring(0, 200),
    }));

    const latest = thread.messages[thread.messages.length - 1];

    return {
      threadId,
      subject: thread.subject,
      participants,
      messageCount: thread.messages.length,
      timeline,
      latestMessage: {
        from: latest.from.name || latest.from.email,
        date: latest.date,
        bodyText: latest.bodyText || latest.snippet || '',
      },
      hasAttachments: thread.messages.some((m) => m.hasAttachments),
      labels: thread.labels,
    };
  }

  // ── Attachment Buffer (for API download) ───────────────────

  async getAttachmentBuffer(messageId: string, attachmentId: string): Promise<Buffer> {
    if (!this.gmail) throw new Error('Not authenticated');
    const res = await this.gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });
    if (!res.data.data) throw new Error('No attachment data');
    return Buffer.from(res.data.data, 'base64url');
  }

  // ── Stats ──────────────────────────────────────────────────

  async getStats(): Promise<Record<string, number>> {
    if (!this.gmail) throw new Error('Not authenticated');

    const queries: Record<string, string> = {
      inbox: 'in:inbox',
      unread: 'is:unread in:inbox',
      starred: 'is:starred',
      drafts: 'is:draft',
    };

    // Add custom label counts
    const pendingId = this.getLabelId('PENDING');
    if (pendingId) queries.pending = `label:PENDING`;
    const todoId = this.getLabelId('TODO');
    if (todoId) queries.todo = `label:TODO`;

    const counts: Record<string, number> = {};
    await Promise.all(
      Object.entries(queries).map(async ([key, q]) => {
        try {
          const res = await this.gmail!.users.threads.list({
            userId: 'me',
            q,
            maxResults: 1,
          });
          counts[key] = res.data.resultSizeEstimate || 0;
        } catch {
          counts[key] = 0;
        }
      })
    );

    return counts;
  }

  private markdownToHtml(md: string): string {
    // Simple markdown → HTML conversion
    let html = md
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');

    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; font-size: 14px; color: #333;">${html}</div>`;
  }
}
