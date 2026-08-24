'use client';

import { useRef, useState } from 'react';
import { UploadCloud, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  hint?: string;
  disabled?: boolean;
  onUpload: (file: File) => void | Promise<void>;
}

export function FileUpload({ accept = 'image/*,.pdf', maxSizeMB = 5, label = 'Upload document', hint, disabled, onUpload }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = (f: File) => {
    setError(null);
    if (f.size > maxSizeMB * 1024 * 1024) {
      setError(`File is larger than ${maxSizeMB}MB.`);
      return;
    }
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/30',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <UploadCloud className="mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint || `Drag & drop or click to browse (max ${maxSizeMB}MB)`}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {file && (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={submit} disabled={busy}>
              {busy ? 'Uploading...' : 'Upload'}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setFile(null)} disabled={busy} aria-label="Remove file">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
