import React, { useState, useEffect } from 'react';
import type { AppConfig } from '../../shared/types';
import { setUse24HourClock } from '../lib/utils';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [mcpStatus, setMcpStatus] = useState<any>(null);

  useEffect(() => {
    window.dagaz.getConfig().then(setConfig);
    window.dagaz.getMcpStatus().then(setMcpStatus);
  }, []);

  const updateConfig = async (updates: Partial<AppConfig>) => {
    const updated = await window.dagaz.setConfig(updates);
    setConfig(updated);
    if (updates.use24HourClock !== undefined) {
      setUse24HourClock(updates.use24HourClock);
    }
  };

  if (!config) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl w-[500px] max-h-[70vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle sticky top-0 bg-bg-secondary z-10">
          <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Notifications */}
          <section>
            <h3 className="text-xs font-medium text-text-primary mb-3">Notifications</h3>
            <label className="flex items-center justify-between py-1.5">
              <span className="text-xs text-text-secondary">Enable notifications</span>
              <ToggleSwitch
                checked={config.notificationsEnabled}
                onChange={v => updateConfig({ notificationsEnabled: v })}
              />
            </label>
            <label className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-xs text-text-secondary block">Dock badge (pending invites)</span>
                <span className="text-[10px] text-text-muted">Show unresponded invite count on dock icon</span>
              </div>
              <ToggleSwitch
                checked={config.dockBadgeEnabled}
                onChange={v => updateConfig({ dockBadgeEnabled: v })}
              />
            </label>
          </section>

          {/* Calendar View */}
          <section>
            <h3 className="text-xs font-medium text-text-primary mb-3">Calendar View</h3>
            <label className="flex items-center justify-between py-1.5">
              <span className="text-xs text-text-secondary">Default week view</span>
              <select
                value={config.weekViewDays}
                onChange={e => updateConfig({ weekViewDays: parseInt(e.target.value) as 5 | 7 })}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none"
              >
                <option value={5}>5-day (Mon–Fri)</option>
                <option value={7}>7-day (Full week)</option>
              </select>
            </label>
            <label className="flex items-center justify-between py-1.5">
              <span className="text-xs text-text-secondary">24-hour clock</span>
              <ToggleSwitch
                checked={config.use24HourClock}
                onChange={v => updateConfig({ use24HourClock: v })}
              />
            </label>
            <label className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-xs text-text-secondary block">Hide declined events</span>
                <span className="text-[10px] text-text-muted">Don't show events you declined</span>
              </div>
              <ToggleSwitch
                checked={config.hideDeclinedEvents ?? true}
                onChange={v => updateConfig({ hideDeclinedEvents: v })}
              />
            </label>
            <label className="flex items-center justify-between py-1.5">
              <span className="text-xs text-text-secondary">Working hours start</span>
              <select
                value={config.workingHoursStart}
                onChange={e => updateConfig({ workingHoursStart: parseInt(e.target.value) })}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{`${i}:00`}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between py-1.5">
              <span className="text-xs text-text-secondary">Working hours end</span>
              <select
                value={config.workingHoursEnd}
                onChange={e => updateConfig({ workingHoursEnd: parseInt(e.target.value) })}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{`${i}:00`}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between py-1.5">
              <span className="text-xs text-text-secondary">Default event duration</span>
              <select
                value={config.defaultEventDurationMinutes}
                onChange={e => updateConfig({ defaultEventDurationMinutes: parseInt(e.target.value) })}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </label>
          </section>

          {/* Appearance */}
          <section>
            <h3 className="text-xs font-medium text-text-primary mb-3">Appearance</h3>
            <label className="flex items-center justify-between py-1.5">
              <span className="text-xs text-text-secondary">Theme</span>
              <select
                value={config.theme}
                onChange={e => updateConfig({ theme: e.target.value as any })}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </label>
            <label className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-xs text-text-secondary block">Dynamic dock icon</span>
                <span className="text-[10px] text-text-muted">Show day name and date on the dock icon</span>
              </div>
              <ToggleSwitch
                checked={config.dynamicDockIcon}
                onChange={v => updateConfig({ dynamicDockIcon: v })}
              />
            </label>
            <label className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-xs text-text-secondary block">Event indicator dot</span>
                <span className="text-[10px] text-text-muted">Show orange dot when an event starts soon</span>
              </div>
              <ToggleSwitch
                checked={config.dockEventIndicator}
                onChange={v => updateConfig({ dockEventIndicator: v })}
              />
            </label>
            {config.dockEventIndicator && (
              <label className="flex items-center justify-between py-1.5 pl-4">
                <span className="text-xs text-text-secondary">Indicator timing</span>
                <select
                  value={config.dockEventIndicatorMinutes}
                  onChange={e => updateConfig({ dockEventIndicatorMinutes: parseInt(e.target.value) })}
                  className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none"
                >
                  <option value={2}>2 minutes before</option>
                  <option value={5}>5 minutes before</option>
                  <option value={10}>10 minutes before</option>
                  <option value={15}>15 minutes before</option>
                </select>
              </label>
            )}
          </section>

          {/* API & MCP */}
          <section>
            <h3 className="text-xs font-medium text-text-primary mb-3">API & Integrations</h3>
            <label className="flex items-center justify-between py-1.5">
              <span className="text-xs text-text-secondary">Express API (port {config.apiPort})</span>
              <ToggleSwitch
                checked={config.apiEnabled}
                onChange={v => updateConfig({ apiEnabled: v })}
              />
            </label>
            {mcpStatus && (
              <div className="mt-2 p-3 rounded-lg bg-bg-primary border border-border-subtle">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${mcpStatus.installed ? 'bg-accent-success' : 'bg-text-muted'}`} />
                  <span className="text-[10px] text-text-secondary font-medium">
                    Futhark MCP {mcpStatus.installed ? 'installed' : 'not installed'}
                  </span>
                </div>
                <pre className="text-[10px] text-text-muted font-mono overflow-x-auto selectable">
                  {JSON.stringify(mcpStatus.claudeDesktopConfig, null, 2)}
                </pre>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        checked ? 'bg-accent-primary' : 'bg-bg-tertiary border border-border-subtle'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
