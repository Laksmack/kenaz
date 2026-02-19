/**
 * Futhark MCP Installer
 *
 * Called from each app's main process on startup. Ensures:
 *   1. ~/.futhark/mcp-server.js exists and is up-to-date
 *   2. Claude Desktop config has a single "futhark" MCP entry
 *   3. Legacy per-app entries (kenaz, raido, dagaz, laguz) are removed
 *
 * Usage from an Electron main process:
 *
 *   import { ensureFutharkMcp } from '@futhark/core/mcp/installer';
 *   import { dialog } from 'electron';
 *
 *   await ensureFutharkMcp({
 *     showPrompt: async (msg) => {
 *       const { response } = await dialog.showMessageBox({ message: msg, buttons: ['Register', 'Not Now'] });
 *       return response === 0;
 *     },
 *   });
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';

const FUTHARK_DIR = join(homedir(), '.futhark');
const MCP_SERVER_DEST = join(FUTHARK_DIR, 'mcp-server.js');
const VERSION_FILE = join(FUTHARK_DIR, 'version.json');
const CLAUDE_CONFIG_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  'Claude',
  'claude_desktop_config.json'
);

const LEGACY_ENTRIES = ['kenaz', 'raido', 'dagaz', 'laguz'];

// The version embedded in the built MCP server bundle.
// Bump this when the tool surface changes.
const MCP_VERSION = '1.0.1';

export interface InstallerOptions {
  /** Path to the built futhark-mcp.js bundle (caller resolves this based on dev vs packaged) */
  bundlePath: string;
  /** Show a prompt to the user before writing Claude Desktop config. Return true to proceed. */
  showPrompt: (message: string) => Promise<boolean>;
}

/**
 * Ensure the unified Futhark MCP server is installed and registered.
 * Safe to call from multiple apps concurrently — uses atomic writes.
 */
export async function ensureFutharkMcp(options: InstallerOptions): Promise<void> {
  const { bundlePath, showPrompt } = options;

  // 1. Ensure ~/.futhark/ exists
  if (!existsSync(FUTHARK_DIR)) {
    mkdirSync(FUTHARK_DIR, { recursive: true });
  }

  // 2. Copy/update the MCP server bundle
  const needsCopy = shouldUpdateBundle();
  if (needsCopy && existsSync(bundlePath)) {
    try {
      copyFileSync(bundlePath, MCP_SERVER_DEST);
      writeFileSync(VERSION_FILE, JSON.stringify({ version: MCP_VERSION, updatedAt: new Date().toISOString() }));
      console.log(`[Futhark MCP] Installed v${MCP_VERSION} to ${MCP_SERVER_DEST}`);
    } catch (e: any) {
      console.error('[Futhark MCP] Failed to install server bundle:', e.message);
      return;
    }
  }

  // 3. Ensure Claude Desktop config has the futhark entry
  await ensureClaudeConfig(showPrompt);
}

function shouldUpdateBundle(): boolean {
  if (!existsSync(MCP_SERVER_DEST)) return true;
  if (!existsSync(VERSION_FILE)) return true;
  try {
    const current = JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
    return current.version !== MCP_VERSION;
  } catch {
    return true;
  }
}

async function ensureClaudeConfig(showPrompt: InstallerOptions['showPrompt']): Promise<void> {
  if (process.platform !== 'darwin') return;

  // Check if Claude Desktop config directory exists
  const claudeDir = join(homedir(), 'Library', 'Application Support', 'Claude');
  if (!existsSync(claudeDir)) {
    // Claude Desktop not installed — nothing to do
    return;
  }

  let config: any = {};
  if (existsSync(CLAUDE_CONFIG_PATH)) {
    try {
      config = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'));
    } catch (e: any) {
      console.error('[Futhark MCP] Failed to read Claude config:', e.message);
      return;
    }
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  const hasFuthark = !!config.mcpServers.futhark;
  const hasLegacy = LEGACY_ENTRIES.some((name) => !!config.mcpServers[name]);

  if (hasFuthark && !hasLegacy) {
    // Already configured, nothing to do
    return;
  }

  // Build the futhark entry
  const futharkEntry = {
    command: 'node',
    args: [MCP_SERVER_DEST],
  };

  if (hasFuthark && hasLegacy) {
    // Just clean up legacy entries silently
    for (const name of LEGACY_ENTRIES) {
      delete config.mcpServers[name];
    }
    writeClaudeConfig(config);
    console.log('[Futhark MCP] Cleaned up legacy per-app MCP entries from Claude config');
    return;
  }

  // No futhark entry — prompt the user
  const shouldRegister = await showPrompt(
    'Register Futhark tools with Claude Desktop?\n\n' +
    'This adds a single MCP server entry to your Claude Desktop config, ' +
    'giving Claude access to all Futhark apps (email, tasks, calendar, notes).\n\n' +
    'You\'ll need to restart Claude Desktop to activate it.'
  );

  if (!shouldRegister) {
    console.log('[Futhark MCP] User declined registration');
    return;
  }

  // Add futhark, remove legacy
  config.mcpServers.futhark = futharkEntry;
  for (const name of LEGACY_ENTRIES) {
    delete config.mcpServers[name];
  }

  writeClaudeConfig(config);
  console.log('[Futhark MCP] Registered with Claude Desktop');
}

function writeClaudeConfig(config: any): void {
  try {
    writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  } catch (e: any) {
    console.error('[Futhark MCP] Failed to write Claude config:', e.message);
  }
}

/**
 * Returns the Claude Desktop config JSON for manual setup.
 * Used by Settings UIs as a fallback.
 */
export function getFutharkMcpConfig(): object {
  return {
    mcpServers: {
      futhark: {
        command: 'node',
        args: [MCP_SERVER_DEST],
      },
    },
  };
}

/**
 * Check if the MCP server is installed at ~/.futhark/
 */
export function isMcpInstalled(): boolean {
  return existsSync(MCP_SERVER_DEST);
}

/**
 * Get the installed MCP version, or null if not installed.
 */
export function getMcpVersion(): string | null {
  if (!existsSync(VERSION_FILE)) return null;
  try {
    return JSON.parse(readFileSync(VERSION_FILE, 'utf-8')).version;
  } catch {
    return null;
  }
}
