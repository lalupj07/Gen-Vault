'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { motion } from 'framer-motion';
import { Camera, Upload, X, QrCode } from 'lucide-react';

interface QRScannerProps {
  onScan: (text: string) => void;
  onClose: () => void;
}

/** Square QR-only scanner (not linear barcode). */
export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [scanMode, setScanMode] = useState<'camera' | 'file'>('camera');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scanMode === 'camera' && videoRef.current && !scannerRef.current) {
      void startCamera();
    }
    return () => {
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode]);

  const makeScanner = () =>
    new Html5Qrcode('qr-reader', {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });

  const startCamera = async () => {
    setScanning(true);
    setError('');

    try {
      const scanner = makeScanner();
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 12,
          aspectRatio: 1.0,
          // Always square viewfinder — matches 2FA otpauth QR codes
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.78);
            return { width: edge, height: edge };
          },
        },
        (decodedText: string) => {
          onScan(decodedText);
          void stopScanner();
        },
        () => {
          /* no QR in frame yet */
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start camera');
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const s = scannerRef.current;
        if (s.isScanning) {
          await s.stop();
        }
        s.clear();
      } catch {
        /* already stopped */
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    const scanner = makeScanner();
    scannerRef.current = scanner;

    try {
      const decodedText = await scanner.scanFile(file, /* showImage */ true);
      onScan(decodedText);
      scanner.clear();
    } catch {
      setError('No QR code found in image');
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
    }
  };

  const switchMode = (mode: 'camera' | 'file') => {
    void stopScanner();
    setScanMode(mode);
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-vault-black/95 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-vault-black border border-vault-border/40 rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-vault-border/30">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-cyber-cyan" />
            <h2 className="text-lg font-medium text-vault-light">Scan square QR</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors min-h-[44px] min-w-[44px]"
            aria-label="Close scanner"
          >
            <X className="w-5 h-5 text-vault-muted" />
          </button>
        </div>

        <div className="flex p-2 gap-2 border-b border-vault-border/30">
          <button
            type="button"
            onClick={() => switchMode('camera')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-lg text-sm transition-colors ${
              scanMode === 'camera'
                ? 'bg-cyber-cyan/10 text-cyber-cyan'
                : 'text-vault-muted hover:bg-white/[0.05]'
            }`}
          >
            <Camera className="w-4 h-4" />
            Camera
          </button>
          <button
            type="button"
            onClick={() => switchMode('file')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-lg text-sm transition-colors ${
              scanMode === 'file'
                ? 'bg-cyber-cyan/10 text-cyber-cyan'
                : 'text-vault-muted hover:bg-white/[0.05]'
            }`}
          >
            <Upload className="w-4 h-4" />
            Import image
          </button>
        </div>

        <div className="p-5">
          {scanMode === 'camera' ? (
            <div className="relative mx-auto w-full max-w-[320px]">
              <div
                id="qr-reader"
                ref={videoRef}
                className="w-full aspect-square bg-vault-black/50 rounded-xl overflow-hidden [&_video]:object-cover [&_video]:aspect-square"
              />
              {/* Square corner guides (not a barcode laser bar) */}
              {scanning && (
                <div
                  className="absolute inset-[11%] pointer-events-none border-2 border-transparent"
                  aria-hidden
                >
                  <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyber-cyan rounded-tl-md" />
                  <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyber-cyan rounded-tr-md" />
                  <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyber-cyan rounded-bl-md" />
                  <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyber-cyan rounded-br-md" />
                </div>
              )}
              {!scanning && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <QrCode className="w-12 h-12 text-vault-muted/30 mx-auto mb-2" />
                    <p className="text-sm text-vault-muted">Camera inactive</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border-2 border-dashed border-vault-border/40 rounded-xl p-8 text-center hover:border-cyber-cyan/40 transition-colors aspect-square flex flex-col items-center justify-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                id="qr-file-input"
              />
              <label htmlFor="qr-file-input" className="cursor-pointer block">
                <Upload className="w-12 h-12 text-vault-muted/30 mx-auto mb-3" />
                <p className="text-sm text-vault-muted mb-1">Upload a square QR image</p>
                <p className="text-xs text-vault-muted/50">PNG or JPG</p>
              </label>
              {/* Hidden mount for html5-qrcode file decode */}
              <div id="qr-reader" className="hidden" />
            </div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 p-3 rounded-lg bg-accent-danger/10 border border-accent-danger/20 text-accent-danger text-sm"
            >
              {error}
            </motion.div>
          )}

          <p className="mt-4 text-center text-xs text-vault-muted/60">
            Center the square authenticator QR inside the frame
          </p>
        </div>
      </motion.div>
    </div>
  );
}
