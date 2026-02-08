import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { BrowserWindow } from 'electron';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ConfigStore } from './config';
import type { Email, EmailThread, EmailAddress, Attachment, SendEmailPayload } from '../shared/types';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/calendar.readonly',
];

// You must place your OAuth credentials in the app's userData directory
// Download from Google Cloud Console → APIs & Services → Credentials
function getCredentialsPath(): string {
  return path.join(app.getPath('userData'), 'credentials.json');
}

function getTokenPath(): string {
  return path.join(app.getPath('userData'), 'token.json');
}

export class GmailService {
  private oauth2Client: OAuth2Client | null = null;
  private gmail: gmail_v1.Gmail | null = null;
  private config: ConfigStore;
  private labelCache: Map<string, string> = new Map(); // name → id

  getOAuth2Client(): OAuth2Client | null {
    return this.oauth2Client;
  }

  constructor(config: ConfigStore) {
    this.config = config;
    this.tryLoadExistingToken();
  }

  private tryLoadExistingToken() {
    try {
      const credPath = getCredentialsPath();
      if (!fs.existsSync(credPath)) return;

      const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      const { client_id, client_secret, redirect_uris } = creds.installed || creds.web || {};
      this.oauth2Client = new OAuth2Client(client_id, client_secret, 'http://localhost:8234');

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
      console.log('[Gmail] Authenticated as:', profile.data.emailAddress);
      return true;
    } catch (e: any) {
      console.error('[Gmail] Auth check failed:', e.message);
      return false;
    }
  }

  async authenticate(): Promise<{ success: boolean; error?: string }> {
    try {
      const credPath = getCredentialsPath();
      if (!fs.existsSync(credPath)) {
        return {
          success: false,
          error: `Place your Google OAuth credentials at: ${credPath}`,
        };
      }

      const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      const { client_id, client_secret } = creds.installed || creds.web || {};
      this.oauth2Client = new OAuth2Client(client_id, client_secret, 'http://localhost:8234');

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
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<html><body style="background:#0a0a0a;color:#f0e6da;font-family:Outfit,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-size:24px">Kenaz <span style="color:#F7A94B">ᚲ</span> authenticated!</h2><p style="color:#999;margin-top:8px">You can close this tab.</p></div></body></html>');
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
      // Ensure PENDING and FOLLOWUP labels exist
      await this.ensureLabel('PENDING');
      await this.ensureLabel('FOLLOWUP');
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

  async fetchThreads(query: string, maxResults: number = 50): Promise<EmailThread[]> {
    if (!this.gmail) throw new Error('Not authenticated');

    const res = await this.gmail.users.threads.list({
      userId: 'me',
      q: query || undefined,
      maxResults,
    });

    const threads = res.data.threads || [];
    const results: EmailThread[] = [];

    // Fetch thread details in parallel (batches of 10)
    for (let i = 0; i < threads.length; i += 10) {
      const batch = threads.slice(i, i + 10);
      const details = await Promise.all(
        batch.map((t) => this.fetchThread(t.id!))
      );
      results.push(...details.filter((d): d is EmailThread => d !== null));
    }

    return results;
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

    const { html, text } = this.extractBody(msg.payload);
    const attachments = this.extractAttachments(msg.payload);

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

  // ── Send ───────────────────────────────────────────────────

  async sendEmail(payload: SendEmailPayload): Promise<{ id: string; threadId: string }> {
    if (!this.gmail) throw new Error('Not authenticated');

    const appConfig = this.config.get();

    // Convert markdown to simple HTML
    let htmlBody = this.markdownToHtml(payload.body_markdown);

    // Append signature
    if (payload.signature !== false) {
      htmlBody += `<br/><br/>${appConfig.signature}`;
    }

    // Build RFC 2822 message
    const messageParts = [
      `To: ${payload.to}`,
      payload.cc ? `Cc: ${payload.cc}` : '',
      payload.bcc ? `Bcc: ${payload.bcc}` : '',
      `Subject: ${payload.subject}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      htmlBody,
    ]
      .filter(Boolean)
      .join('\r\n');

    const encodedMessage = Buffer.from(messageParts)
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
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');

    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; font-size: 14px; color: #333;"><p>${html}</p></div>`;
  }
}
