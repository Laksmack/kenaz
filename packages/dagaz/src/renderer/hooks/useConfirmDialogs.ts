import { useState, useCallback } from 'react';

interface DeleteConfirm {
  id: string;
  summary: string;
}

interface RsvpConfirm {
  id: string;
  summary: string;
  response: 'accepted' | 'declined' | 'tentative';
}

export function useConfirmDialogs() {
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [rsvpConfirm, setRsvpConfirm] = useState<RsvpConfirm | null>(null);

  const showDeleteConfirm = useCallback((id: string, summary: string) => {
    setDeleteConfirm({ id, summary });
  }, []);

  const showRsvpConfirm = useCallback((id: string, summary: string, response: 'accepted' | 'declined' | 'tentative') => {
    setRsvpConfirm({ id, summary, response });
  }, []);

  const dismissDeleteConfirm = useCallback(() => setDeleteConfirm(null), []);
  const dismissRsvpConfirm = useCallback(() => setRsvpConfirm(null), []);

  return {
    deleteConfirm, showDeleteConfirm, dismissDeleteConfirm,
    rsvpConfirm, showRsvpConfirm, dismissRsvpConfirm,
  };
}
