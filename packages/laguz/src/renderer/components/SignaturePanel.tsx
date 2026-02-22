import React, { useState, useEffect, useCallback } from 'react';
import { SignatureCapture } from './SignatureCapture';
import type { SignatureInfo } from '../types';

interface SignaturePanelProps {
  onSelect: (sig: SignatureInfo) => void;
  onClose: () => void;
}

export function SignaturePanel({ onSelect, onClose }: SignaturePanelProps) {
  const [signatures, setSignatures] = useState<SignatureInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCapture, setShowCapture] = useState(false);

  const loadSignatures = useCallback(async () => {
    setLoading(true);
    try {
      const sigs = await window.laguz.getSignatures();
      setSignatures(sigs);
    } catch (e) {
      console.error('Failed to load signatures:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSignatures(); }, [loadSignatures]);

  const handleCapture = useCallback(async (name: string, pngBase64: string) => {
    try {
      await window.laguz.saveSignature(name, pngBase64);
      setShowCapture(false);
      await loadSignatures();
    } catch (e) {
      console.error('Failed to save signature:', e);
    }
  }, [loadSignatures]);

  const handleDelete = useCallback(async (name: string) => {
    if (!confirm(`Delete signature "${name}"?`)) return;
    try {
      await window.laguz.deleteSignature(name);
      await loadSignatures();
    } catch (e) {
      console.error('Failed to delete signature:', e);
    }
  }, [loadSignatures]);

  if (showCapture) {
    return <SignatureCapture onCapture={handleCapture} onCancel={() => setShowCapture(false)} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-bg-secondary border-t border-border-subtle rounded-t-xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Select Signature</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Signature list */}
        <div className="p-5">
          {loading ? (
            <div className="text-xs text-text-muted text-center py-4">Loading...</div>
          ) : signatures.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-text-muted mb-3">No signatures stored</p>
              <button
                onClick={() => setShowCapture(true)}
                className="px-4 py-2 rounded-md text-xs font-medium text-white transition-colors"
                style={{ backgroundColor: '#4AA89A' }}
              >
                Create Signature
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {signatures.map(sig => (
                <button
                  key={sig.name}
                  onClick={() => onSelect(sig)}
                  className="group relative border border-border-subtle rounded-lg p-3 bg-white hover:border-accent-primary/40 transition-colors"
                >
                  <img
                    src={`data:image/png;base64,${sig.pngBase64}`}
                    alt={sig.name}
                    className="w-full h-12 object-contain"
                  />
                  <div className="text-[10px] text-center mt-1.5 text-gray-600 truncate">{sig.name}</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(sig.name); }}
                    className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-400 transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border-subtle">
            <button
              onClick={() => setShowCapture(true)}
              className="px-3 py-1.5 rounded-md text-xs text-text-secondary hover:bg-bg-hover transition-colors"
            >
              + New Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
