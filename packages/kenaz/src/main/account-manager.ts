import fs from 'fs';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { GmailService } from './gmail';
import { HubSpotService } from './hubspot';
import { CalendarService } from './calendar';
import { CacheStore } from './cache-store';
import { GlobalConfigStore, AccountConfigStore, ConfigStore } from './config';
import { ViewStore, RuleStore } from './stores';
import { ConnectivityMonitor } from './connectivity';
import { SyncEngine } from './sync-engine';
import type { AccountInfo } from '../shared/types';

export interface AccountServices {
  gmail: GmailService;
  hubspot: HubSpotService;
  calendar: CalendarService;
  cache: CacheStore;
  config: ConfigStore;
  accountConfig: AccountConfigStore;
  viewStore: ViewStore;
  ruleStore: RuleStore;
  syncEngine: SyncEngine;
}

export class AccountManager {
  private accountsPath: string;
  private accountsDir: string;
  private accounts: AccountInfo[] = [];
  private activeEmail: string | null = null;
  private bundles: Map<string, AccountServices> = new Map();
  private globalConfig: GlobalConfigStore;
  private connectivity: ConnectivityMonitor;
  private mainWindow: BrowserWindow | null = null;

  constructor(globalConfig: GlobalConfigStore, connectivity: ConnectivityMonitor) {
    this.accountsPath = path.join(app.getPath('userData'), 'accounts.json');
    this.accountsDir = path.join(app.getPath('userData'), 'accounts');
    this.globalConfig = globalConfig;
    this.connectivity = connectivity;
    this.accounts = this.loadAccounts();

    if (this.accounts.length > 0) {
      const mostRecent = [...this.accounts].sort(
        (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
      )[0];
      this.activeEmail = mostRecent.email;
    }
  }

  private loadAccounts(): AccountInfo[] {
    try {
      if (fs.existsSync(this.accountsPath)) {
        const data = JSON.parse(fs.readFileSync(this.accountsPath, 'utf-8'));
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      console.error('[AccountManager] Failed to load accounts:', e);
    }
    return [];
  }

  private saveAccounts(): void {
    try {
      fs.writeFileSync(this.accountsPath, JSON.stringify(this.accounts, null, 2));
    } catch (e) {
      console.error('[AccountManager] Failed to save accounts:', e);
    }
  }

  private getAccountDir(email: string): string {
    return path.join(this.accountsDir, email);
  }

  getGlobalConfig(): GlobalConfigStore {
    return this.globalConfig;
  }

  getConnectivity(): ConnectivityMonitor {
    return this.connectivity;
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
    this.connectivity.setMainWindow(win);
    for (const bundle of this.bundles.values()) {
      bundle.syncEngine.setMainWindow(win);
    }
  }

  listAccounts(): AccountInfo[] {
    return [...this.accounts];
  }

  getActiveEmail(): string | null {
    return this.activeEmail;
  }

  hasAccounts(): boolean {
    return this.accounts.length > 0;
  }

  /**
   * Get the service bundle for the active account.
   * Lazily initializes if not yet created.
   */
  getActiveServices(): AccountServices | null {
    if (!this.activeEmail) return null;
    return this.getOrCreateBundle(this.activeEmail);
  }

  /**
   * Get the service bundle for a specific account.
   */
  getServicesFor(email: string): AccountServices | null {
    if (!this.accounts.find(a => a.email === email)) return null;
    return this.getOrCreateBundle(email);
  }

  private getOrCreateBundle(email: string): AccountServices {
    const existing = this.bundles.get(email);
    if (existing) return existing;

    const dataDir = this.getAccountDir(email);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const accountConfig = new AccountConfigStore(dataDir);
    const config = new ConfigStore(this.globalConfig, accountConfig);
    const gmail = new GmailService(config, dataDir);
    const hubspot = new HubSpotService(config);
    const calendar = new CalendarService();
    const cache = new CacheStore(dataDir);
    const viewStore = new ViewStore(dataDir);
    const ruleStore = new RuleStore(dataDir);
    const syncEngine = new SyncEngine(gmail, cache, this.connectivity, config);

    if (this.mainWindow) {
      syncEngine.setMainWindow(this.mainWindow);
    }

    // Share OAuth client with calendar service
    const oauthClient = gmail.getOAuth2Client();
    if (oauthClient) {
      calendar.setAuth(oauthClient);
    }

    // Wire up connectivity to use this account's gmail for probing
    if (email === this.activeEmail) {
      this.connectivity.setGmail(gmail);
    }

    const bundle: AccountServices = {
      gmail,
      hubspot,
      calendar,
      cache,
      config,
      accountConfig,
      viewStore,
      ruleStore,
      syncEngine,
    };

    this.bundles.set(email, bundle);
    return bundle;
  }

  /**
   * Register a new account after OAuth. Called once the email is known.
   */
  registerAccount(email: string): AccountInfo {
    const now = new Date().toISOString();
    const existing = this.accounts.find(a => a.email === email);
    if (existing) {
      existing.lastActive = now;
      this.saveAccounts();
      return existing;
    }

    const info: AccountInfo = { email, addedAt: now, lastActive: now };
    this.accounts.push(info);
    this.saveAccounts();
    return info;
  }

  /**
   * Switch to a different account.
   * Pauses the old account's sync engine and starts the new one.
   */
  async switchAccount(email: string): Promise<boolean> {
    const target = this.accounts.find(a => a.email === email);
    if (!target) return false;

    // Pause current account's sync
    if (this.activeEmail && this.bundles.has(this.activeEmail)) {
      this.bundles.get(this.activeEmail)!.syncEngine.stop();
    }

    this.activeEmail = email;
    target.lastActive = new Date().toISOString();
    this.saveAccounts();

    const bundle = this.getOrCreateBundle(email);
    this.connectivity.setGmail(bundle.gmail);

    // Share OAuth with calendar
    const oauthClient = bundle.gmail.getOAuth2Client();
    if (oauthClient) {
      bundle.calendar.setAuth(oauthClient);
    }

    // Notify renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('account:changed', email);
    }

    return true;
  }

  /**
   * Add a new account. The OAuth flow is triggered via GmailService.authenticate()
   * on a temporary service. Once auth succeeds, we detect the email and register.
   */
  async addAccount(): Promise<{ success: boolean; email?: string; error?: string }> {
    // Create a temporary data dir for the new account
    const tempDir = path.join(this.accountsDir, `_pending_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const accountCfg = new AccountConfigStore(tempDir);
    const tempConfig = new ConfigStore(this.globalConfig, accountCfg);
    const tempGmail = new GmailService(tempConfig, tempDir);

    const result = await tempGmail.authenticate();
    if (!result.success) {
      // Clean up temp dir
      try { fs.rmSync(tempDir, { recursive: true }); } catch {}
      return { success: false, error: result.error };
    }

    // Get the authenticated email
    const isAuth = await tempGmail.isAuthenticated();
    if (!isAuth) {
      try { fs.rmSync(tempDir, { recursive: true }); } catch {}
      return { success: false, error: 'Authentication check failed' };
    }

    const email = tempGmail.getUserEmail();
    if (!email) {
      try { fs.rmSync(tempDir, { recursive: true }); } catch {}
      return { success: false, error: 'Could not determine account email' };
    }

    // Move temp dir to permanent location
    const finalDir = this.getAccountDir(email);
    if (fs.existsSync(finalDir)) {
      // Account already exists, just update the token
      const tempToken = path.join(tempDir, 'token.json');
      const finalToken = path.join(finalDir, 'token.json');
      if (fs.existsSync(tempToken)) {
        fs.copyFileSync(tempToken, finalToken);
      }
      try { fs.rmSync(tempDir, { recursive: true }); } catch {}
    } else {
      fs.renameSync(tempDir, finalDir);
    }

    // Invalidate any cached bundle for this email so it picks up the new token
    const oldBundle = this.bundles.get(email);
    if (oldBundle) {
      oldBundle.syncEngine.stop();
      oldBundle.cache.close();
      this.bundles.delete(email);
    }

    this.registerAccount(email);
    await this.switchAccount(email);

    return { success: true, email };
  }

  /**
   * Remove an account and its data.
   */
  async removeAccount(email: string): Promise<boolean> {
    const idx = this.accounts.findIndex(a => a.email === email);
    if (idx < 0) return false;

    // Stop services
    const bundle = this.bundles.get(email);
    if (bundle) {
      bundle.syncEngine.stop();
      bundle.cache.close();
      this.bundles.delete(email);
    }

    this.accounts.splice(idx, 1);
    this.saveAccounts();

    // Remove data directory
    const dir = this.getAccountDir(email);
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
    } catch (e) {
      console.error(`[AccountManager] Failed to remove data for ${email}:`, e);
    }

    // If we removed the active account, switch to the next one
    if (this.activeEmail === email) {
      if (this.accounts.length > 0) {
        await this.switchAccount(this.accounts[0].email);
      } else {
        this.activeEmail = null;
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('account:changed', null);
        }
      }
    }

    return true;
  }

  /**
   * Start the sync engine for the active account.
   */
  async startActiveSync(): Promise<void> {
    const bundle = this.getActiveServices();
    if (bundle) {
      await bundle.syncEngine.start();
    }
  }

  /**
   * Stop all sync engines and close all caches.
   */
  shutdown(): void {
    for (const bundle of this.bundles.values()) {
      bundle.syncEngine.stop();
      bundle.cache.close();
    }
  }
}
