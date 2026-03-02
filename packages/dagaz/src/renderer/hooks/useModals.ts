import { useState, useCallback } from 'react';
import type { CalendarEvent } from '../../shared/types';

export function useModals() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showInvitesPanel, setShowInvitesPanel] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [goToDateOpen, setGoToDateOpen] = useState(false);
  const [rsvpMenuEvent, setRsvpMenuEvent] = useState<CalendarEvent | null>(null);

  const toggleSettings = useCallback(() => setSettingsOpen(prev => !prev), []);
  const toggleHelp = useCallback(() => setShowHelp(prev => !prev), []);

  /** Priority-ordered close: closes the topmost open modal/panel. Returns true if something was closed. */
  const closeTopmost = useCallback((quickCreateOpen: boolean, closeQuickCreate: () => void) => {
    if (rsvpMenuEvent) { setRsvpMenuEvent(null); return true; }
    if (searchOpen) { setSearchOpen(false); return true; }
    if (goToDateOpen) { setGoToDateOpen(false); return true; }
    if (showHelp) { setShowHelp(false); return true; }
    if (settingsOpen) { setSettingsOpen(false); return true; }
    if (quickCreateOpen) { closeQuickCreate(); return true; }
    return false;
  }, [rsvpMenuEvent, searchOpen, goToDateOpen, showHelp, settingsOpen]);

  return {
    settingsOpen, setSettingsOpen,
    showHelp, setShowHelp,
    showInvitesPanel, setShowInvitesPanel,
    searchOpen, setSearchOpen,
    goToDateOpen, setGoToDateOpen,
    rsvpMenuEvent, setRsvpMenuEvent,
    toggleSettings,
    toggleHelp,
    closeTopmost,
  };
}
