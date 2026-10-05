import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Box, FileVideo, ImageIcon, Upload, X } from 'lucide-react';
import { Button, ProgressBar, cn } from '@stimpy/ui';
import { describeError } from '../api/errors';
import { UPLOAD_RULES, formatBytes, uploadFile, validateFile, type UploadFn, type UploadKind, type UploadResult } from '../lib/upload';

export interface FileUploadProps {
  variant: UploadKind;
  /** Visible label, also the accessible name of the control. */
  label: string;
  /** Current file URL (absolute, from the API). */
  value?: string | null;
  /** Called with the upload result, or `null` when the reference is removed. */
  onChange: (result: UploadResult | null) => void;
  /** Optional upload `purpose` (e.g. `builder-model`). */
  purpose?: string;
  hint?: ReactNode;
  /** Field error from the form (also set `aria-invalid` on your side if you wire it yourself). */
  error?: string | null;
  disabled?: boolean;
  /** Smaller drop target, for "add another image" slots. */
  compact?: boolean;
  /** Hide the Remove button (the field is required). */
  hideRemove?: boolean;
  /** Replaceable for tests. Defaults to the XHR upload with progress. */
  upload?: UploadFn;
  id?: string;
  /** Called with the chosen file after the client checks pass and before the upload starts (e.g. to parse a GLB in the browser). */
  onFilePicked?: (file: File) => void;
  /** Called when an upload starts/ends so a form can disable Save meanwhile. */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}

type State =
  | { status: 'idle' }
  | { status: 'uploading'; name: string; size: number; progress: number; preview: string | null }
  | { status: 'error'; message: string };

function basename(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
  } catch {
    return url;
  }
}

/**
 * Upload control for images, videos and 3D models (`POST /admin/uploads`). Client checks mirror
 * the server (type, size, `glTF` header), the upload shows progress and can be cancelled, and
 * server errors map to plain copy (413 -> "too large (maximum N MB)", 415 -> "isn't supported").
 * Drag a file onto it or press the button. One file at a time. Remove only drops the reference
 * (there is no delete endpoint). Previews use `<img>` / `<video>` only, never inline SVG.
 */
export function FileUpload({
  variant,
  label,
  value,
  onChange,
  purpose,
  hint,
  error,
  disabled,
  compact,
  hideRemove,
  upload = uploadFile,
  id,
  onBusyChange,
  onFilePicked,
  className,
}: FileUploadProps) {
  const rule = UPLOAD_RULES[variant];
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [last, setLast] = useState<UploadResult | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);

  const busy = state.status === 'uploading';
  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;
  useEffect(() => {
    onBusyRef.current?.(busy);
  }, [busy]);

  // Release the object URL of the preview and cancel a running upload on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );
  const previewUrl = state.status === 'uploading' ? state.preview : null;
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const start = async (file: File) => {
    const problem = await validateFile(file, variant);
    if (problem) {
      setState({ status: 'error', message: problem.message });
      return;
    }
    onFilePicked?.(file);
    const preview = variant === 'image' ? URL.createObjectURL(file) : null;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'uploading', name: file.name, size: file.size, progress: 0, preview });
    try {
      const result = await upload(file, {
        purpose,
        signal: controller.signal,
        onProgress: (p) => setState((s) => (s.status === 'uploading' ? { ...s, progress: p } : s)),
      });
      setLast(result);
      setLastName(file.name);
      setState({ status: 'idle' });
      onChange(result);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setState({ status: 'idle' });
        return;
      }
      setState({ status: 'error', message: describeError(e, 'write').message });
    } finally {
      abortRef.current = null;
    }
  };

  const pick = (files: FileList | File[] | null) => {
    if (!files || files.length === 0 || disabled || busy) return;
    if (files.length > 1) {
      setState({ status: 'error', message: 'Choose one file at a time.' });
      return;
    }
    void start(files[0] as File);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files);
  };

  const shownError = error ?? (state.status === 'error' ? state.message : null);
  const hasValue = !!value;
  const describedBy = [shownError ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  const preview = hasValue ? (
    variant === 'image' ? (
      <img src={value as string} alt="" className={cn('rounded-md border border-base bg-cream object-contain', compact ? 'h-16 w-16' : 'h-28 w-28')} />
    ) : variant === 'video' ? (
      <video src={value as string} muted controls preload="metadata" className="h-28 max-w-[10rem] rounded-md border border-base bg-cream" />
    ) : (
      <span className="flex h-16 w-16 items-center justify-center rounded-md border border-base bg-cream text-fg" aria-hidden="true">
        <Box size={28} />
      </span>
    )
  ) : null;

  const Icon = variant === 'image' ? ImageIcon : variant === 'video' ? FileVideo : Box;

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)} data-testid={`file-upload-${variant}`}>
      <label htmlFor={inputId} className="text-body font-medium text-fg">
        {label}
      </label>
      <div
        onDragOver={(e) => {
          if (disabled || busy) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-lg border-2 border-dashed p-3 transition-colors duration-fast',
          dragging ? 'border-fg bg-cream' : 'border-control bg-surface-base',
          shownError && 'border-danger',
          disabled && 'opacity-60',
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={rule.accept}
          disabled={disabled || busy}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = '';
          }}
        />

        {state.status === 'uploading' ? (
          <div className="flex flex-col gap-2" role="status" aria-live="polite">
            <div className="flex items-center gap-3">
              {state.preview ? <img src={state.preview} alt="" className="h-16 w-16 rounded-md border border-base object-contain" /> : <Icon size={28} aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium">{state.name}</p>
                <p className="text-body-sm tabular-nums text-fg-muted">
                  {formatBytes(state.size)} &middot; {Math.round(state.progress * 100)}%
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            </div>
            <ProgressBar value={state.progress * 100} aria-label={`Uploading ${state.name}`} />
          </div>
        ) : (
          <div className={cn('flex flex-wrap items-center gap-3', compact && 'justify-center')}>
            {preview}
            <div className="min-w-0 flex-1">
              {hasValue ? (
                <>
                  <p className="truncate text-body-sm font-medium">{lastName ?? basename(value as string)}</p>
                  {last ? (
                    <p className="text-body-sm tabular-nums text-fg-muted">
                      {formatBytes(last.sizeBytes)}
                      {last.width && last.height ? ` · ${last.width} × ${last.height}` : ''}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="flex items-center gap-2 text-body-sm text-fg-muted">
                  <Upload size={18} aria-hidden="true" />
                  {compact ? 'Add' : 'Drop a file here or'}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
                {hasValue ? 'Replace' : 'Choose file'}
              </Button>
              {hasValue && !hideRemove ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    setLast(null);
                    setLastName(null);
                    setState({ status: 'idle' });
                    onChange(null);
                  }}
                  leftIcon={<X size={16} aria-hidden="true" />}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
      <p id={hintId} className="text-body-sm text-fg-muted">
        {hint ?? `${rule.typesLabel}, up to ${formatBytes(rule.maxBytes)}. ${rule.note}`}
      </p>
      {shownError ? (
        <p id={errorId} role="alert" className="text-body-sm font-medium text-fg-danger">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
