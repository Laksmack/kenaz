import React, { useRef, useState, useCallback, useEffect } from 'react';

type CaptureMode = 'trackpad' | 'camera' | 'import';

interface SignatureCaptureProps {
  onCapture: (name: string, pngBase64: string) => void;
  onCancel: () => void;
}

export function SignatureCapture({ onCapture, onCancel }: SignatureCaptureProps) {
  const [mode, setMode] = useState<CaptureMode>('trackpad');
  const [name, setName] = useState('signature');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl w-[520px] max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Capture Signature</h2>
          <button onClick={onCancel} className="text-text-muted hover:text-text-primary transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-border-subtle">
          {(['trackpad', 'camera', 'import'] as CaptureMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${
                mode === m
                  ? 'text-accent-primary border-b-2 border-accent-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {m === 'import' ? 'Image Import' : m}
            </button>
          ))}
        </div>

        {/* Name input */}
        <div className="px-5 pt-4 pb-2">
          <label className="text-xs text-text-muted block mb-1">Signature Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary/40"
            placeholder="e.g. signature, initials"
          />
        </div>

        {/* Capture area */}
        <div className="px-5 pb-5">
          {mode === 'trackpad' && (
            <TrackpadCapture name={name} onCapture={onCapture} />
          )}
          {mode === 'camera' && (
            <CameraCapture name={name} onCapture={onCapture} />
          )}
          {mode === 'import' && (
            <ImageImport name={name} onCapture={onCapture} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Trackpad Drawing ─────────────────────────────────────────

function TrackpadCapture({ name, onCapture }: { name: string; onCapture: (name: string, pngBase64: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  const startDraw = useCallback((e: React.PointerEvent) => {
    drawing.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    lastPoint.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setHasDrawn(true);
  }, []);

  const draw = useCallback((e: React.PointerEvent) => {
    if (!drawing.current || !lastPoint.current) return;
    const ctx = getCtx();
    if (!ctx) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastPoint.current = { x, y };
  }, []);

  const endDraw = useCallback(() => {
    drawing.current = false;
    lastPoint.current = null;
  }, []);

  const clear = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasDrawn(false);
  }, []);

  const save = useCallback(() => {
    if (!canvasRef.current) return;
    // Crop to content and convert to transparent PNG
    const ctx = getCtx()!;
    const { width, height } = canvasRef.current;
    const imageData = ctx.getImageData(0, 0, width, height);

    // Find bounding box of non-empty pixels
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = imageData.data[(y * width + x) * 4 + 3];
        if (a > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX <= minX || maxY <= minY) return;

    const pad = 10;
    const cropW = maxX - minX + pad * 2;
    const cropH = maxY - minY + pad * 2;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d')!;
    cropCtx.drawImage(canvasRef.current, minX - pad, minY - pad, cropW, cropH, 0, 0, cropW, cropH);

    const dataUrl = cropCanvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    onCapture(name, base64);
  }, [name, onCapture]);

  return (
    <div>
      <div className="mt-3 border border-border-subtle rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={480}
          height={160}
          className="cursor-crosshair touch-none"
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
      </div>
      <p className="text-[10px] text-text-muted mt-2">Draw your signature using the trackpad or mouse</p>
      <div className="flex gap-2 mt-3">
        <button onClick={clear} className="px-3 py-1.5 rounded-md text-xs text-text-secondary hover:bg-bg-hover transition-colors">
          Clear
        </button>
        <div className="flex-1" />
        <button
          onClick={save}
          disabled={!hasDrawn}
          className="px-4 py-1.5 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-40"
          style={{ backgroundColor: '#4AA89A' }}
        >
          Save Signature
        </button>
      </div>
    </div>
  );
}

// ── Camera Capture ───────────────────────────────────────────

function CameraCapture({ name, onCapture }: { name: string; onCapture: (name: string, pngBase64: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 480 } })
      .then(s => {
        if (!active) { s.getTracks().forEach(t => t.stop()); return; }
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(e => setError('Camera access denied'));

    return () => { active = false; stream?.getTracks().forEach(t => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    // Apply contrast thresholding: convert to black-on-transparent
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (gray < 128) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = Math.round((1 - gray / 128) * 255);
      } else {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    setCaptured(dataUrl);
  }, []);

  const save = useCallback(() => {
    if (!captured) return;
    const base64 = captured.split(',')[1];
    onCapture(name, base64);
    stream?.getTracks().forEach(t => t.stop());
  }, [captured, name, onCapture, stream]);

  if (error) {
    return <div className="mt-3 text-xs text-red-400">{error}</div>;
  }

  return (
    <div>
      <div className="mt-3 border border-border-subtle rounded-lg overflow-hidden bg-black">
        {captured ? (
          <img src={captured} alt="Captured signature" className="w-full" style={{ maxHeight: 240 }} />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="w-full" style={{ maxHeight: 240 }} />
        )}
      </div>
      <p className="text-[10px] text-text-muted mt-2">Sign on white paper and hold up to camera</p>
      <div className="flex gap-2 mt-3">
        {captured ? (
          <>
            <button onClick={() => setCaptured(null)} className="px-3 py-1.5 rounded-md text-xs text-text-secondary hover:bg-bg-hover transition-colors">
              Retake
            </button>
            <div className="flex-1" />
            <button
              onClick={save}
              className="px-4 py-1.5 rounded-md text-xs font-medium text-white transition-colors"
              style={{ backgroundColor: '#4AA89A' }}
            >
              Save Signature
            </button>
          </>
        ) : (
          <>
            <div className="flex-1" />
            <button
              onClick={capture}
              className="px-4 py-1.5 rounded-md text-xs font-medium text-white transition-colors"
              style={{ backgroundColor: '#4AA89A' }}
            >
              Capture
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Image Import ─────────────────────────────────────────────

function ImageImport({ name, onCapture }: { name: string; onCapture: (name: string, pngBase64: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;

      // Process: convert to black-on-transparent if needed
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        // Check if image already has transparency
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let hasTransparency = false;
        for (let i = 3; i < imageData.data.length; i += 4) {
          if (imageData.data[i] < 250) { hasTransparency = true; break; }
        }

        if (!hasTransparency) {
          // Apply white-to-transparent conversion
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            if (gray > 200) {
              data[i + 3] = 0;
            } else {
              data[i] = 0;
              data[i + 1] = 0;
              data[i + 2] = 0;
              data[i + 3] = Math.round((1 - gray / 255) * 255);
            }
          }
          ctx.putImageData(imageData, 0, 0);
        }

        setPreview(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const save = useCallback(() => {
    if (!preview) return;
    const base64 = preview.split(',')[1];
    onCapture(name, base64);
  }, [preview, name, onCapture]);

  return (
    <div>
      <div className="mt-3">
        {preview ? (
          <div className="border border-border-subtle rounded-lg overflow-hidden bg-[#f5f5f5] p-4 flex items-center justify-center" style={{ minHeight: 120 }}>
            <img src={preview} alt="Signature preview" style={{ maxHeight: 120, maxWidth: '100%' }} />
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-border-subtle rounded-lg py-8 text-center hover:border-accent-primary/40 transition-colors"
          >
            <svg className="w-8 h-8 mx-auto text-text-muted mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-xs text-text-muted">Click to upload PNG/JPG</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          onChange={handleFile}
          className="hidden"
        />
      </div>
      <p className="text-[10px] text-text-muted mt-2">White background will be converted to transparent</p>
      <div className="flex gap-2 mt-3">
        {preview && (
          <button onClick={() => setPreview(null)} className="px-3 py-1.5 rounded-md text-xs text-text-secondary hover:bg-bg-hover transition-colors">
            Change
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={save}
          disabled={!preview}
          className="px-4 py-1.5 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-40"
          style={{ backgroundColor: '#4AA89A' }}
        >
          Save Signature
        </button>
      </div>
    </div>
  );
}
