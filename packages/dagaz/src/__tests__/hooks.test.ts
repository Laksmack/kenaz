import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useToast } from '../renderer/hooks/useToast';
import { useQuickCreate } from '../renderer/hooks/useQuickCreate';
import { useConfirmDialogs } from '../renderer/hooks/useConfirmDialogs';
import { useModals } from '../renderer/hooks/useModals';
import { useConnectivity } from '../renderer/hooks/useConnectivity';

describe('useToast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts with no toast', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast).toBeNull();
  });

  it('shows a toast message', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('Hello'));
    expect(result.current.toast).toBe('Hello');
  });

  it('auto-dismisses after duration', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('Hello', 1000));
    expect(result.current.toast).toBe('Hello');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.toast).toBeNull();
  });

  it('replaces existing toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('First'));
    act(() => result.current.showToast('Second'));
    expect(result.current.toast).toBe('Second');
  });
});

describe('useQuickCreate', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useQuickCreate());
    expect(result.current.quickCreateOpen).toBe(false);
    expect(result.current.editingEvent).toBeNull();
  });

  it('opens for new event with optional start/end', () => {
    const { result } = renderHook(() => useQuickCreate());
    const start = new Date('2026-03-01T09:00:00');
    const end = new Date('2026-03-01T10:00:00');
    act(() => result.current.openQuickCreate(start, end));
    expect(result.current.quickCreateOpen).toBe(true);
    expect(result.current.quickCreateStart).toEqual(start);
    expect(result.current.quickCreateEnd).toEqual(end);
    expect(result.current.editingEvent).toBeNull();
  });

  it('opens for editing an event', () => {
    const { result } = renderHook(() => useQuickCreate());
    const event = { id: '1', summary: 'Test' } as any;
    act(() => result.current.openEditEvent(event));
    expect(result.current.quickCreateOpen).toBe(true);
    expect(result.current.editingEvent).toEqual(event);
  });

  it('closes and clears editing event', () => {
    const { result } = renderHook(() => useQuickCreate());
    act(() => result.current.openEditEvent({ id: '1' } as any));
    act(() => result.current.closeQuickCreate());
    expect(result.current.quickCreateOpen).toBe(false);
    expect(result.current.editingEvent).toBeNull();
  });
});

describe('useConfirmDialogs', () => {
  it('starts with no dialogs', () => {
    const { result } = renderHook(() => useConfirmDialogs());
    expect(result.current.deleteConfirm).toBeNull();
    expect(result.current.rsvpConfirm).toBeNull();
  });

  it('shows and dismisses delete confirm', () => {
    const { result } = renderHook(() => useConfirmDialogs());
    act(() => result.current.showDeleteConfirm('ev-1', 'Standup'));
    expect(result.current.deleteConfirm).toEqual({ id: 'ev-1', summary: 'Standup' });
    act(() => result.current.dismissDeleteConfirm());
    expect(result.current.deleteConfirm).toBeNull();
  });

  it('shows and dismisses RSVP confirm', () => {
    const { result } = renderHook(() => useConfirmDialogs());
    act(() => result.current.showRsvpConfirm('ev-2', 'Retro', 'accepted'));
    expect(result.current.rsvpConfirm).toEqual({ id: 'ev-2', summary: 'Retro', response: 'accepted' });
    act(() => result.current.dismissRsvpConfirm());
    expect(result.current.rsvpConfirm).toBeNull();
  });
});

describe('useModals', () => {
  it('starts with everything closed', () => {
    const { result } = renderHook(() => useModals());
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.showHelp).toBe(false);
    expect(result.current.searchOpen).toBe(false);
    expect(result.current.goToDateOpen).toBe(false);
    expect(result.current.rsvpMenuEvent).toBeNull();
  });

  it('toggleSettings toggles settings', () => {
    const { result } = renderHook(() => useModals());
    act(() => result.current.toggleSettings());
    expect(result.current.settingsOpen).toBe(true);
    act(() => result.current.toggleSettings());
    expect(result.current.settingsOpen).toBe(false);
  });

  it('closeTopmost closes in priority order', () => {
    const { result } = renderHook(() => useModals());
    const closeFn = vi.fn();

    // Open search
    act(() => result.current.setSearchOpen(true));
    let closed: boolean;
    act(() => { closed = result.current.closeTopmost(false, closeFn); });
    // Should have closed search, not called closeFn
    expect(closed!).toBe(true);
    expect(closeFn).not.toHaveBeenCalled();
  });

  it('closeTopmost returns false when nothing is open', () => {
    const { result } = renderHook(() => useModals());
    const closed = result.current.closeTopmost(false, vi.fn());
    expect(closed).toBe(false);
  });
});

describe('useConnectivity', () => {
  it('starts online (navigator.onLine)', () => {
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.isOnline).toBe(true);
  });

  it('reacts to browser offline event', () => {
    const { result } = renderHook(() => useConnectivity());
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current.isOnline).toBe(false);
  });

  it('reacts to browser online event', () => {
    const { result } = renderHook(() => useConnectivity());
    act(() => window.dispatchEvent(new Event('offline')));
    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current.isOnline).toBe(true);
  });
});
