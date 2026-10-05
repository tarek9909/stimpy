'use client';

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../cn';
import { QUANTITY_MAX, QUANTITY_MIN } from '../constants';
import { AlertCircle, Check, ChevronDown, Minus, Plus } from '../icons';
import { useIsomorphicLayoutEffect } from '../hooks';
import { mergeRefs } from '../utils';
import { Spinner } from './Spinner';

/* ------------------------------------------------------------------------------------------
 * Shared control skin. 44px minimum height, 16px text (no iOS zoom), `control` border (3.4:1).
 * ---------------------------------------------------------------------------------------- */

const controlSkin = cn(
  'w-full min-h-11 rounded-md border border-control bg-surface-base px-3 py-2 text-body text-fg',
  'placeholder:text-fg-muted',
  'transition-colors duration-fast ease-standard',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:border-2',
  'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-bg disabled:text-disabled-fg',
);

/* ---------------------------------------------------------------------------------- Input */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Visual prefix, e.g. `+961`. Decorative: put the meaning in the label. */
  prefixText?: ReactNode;
  suffixText?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { prefixText, suffixText, invalid, className, type = 'text', ...rest },
  ref,
) {
  const aria = invalid ? ({ 'aria-invalid': true } as const) : {};
  if (prefixText == null && suffixText == null) {
    return <input ref={ref} type={type} className={cn(controlSkin, 'read-only:bg-surface', className)} {...aria} {...rest} />;
  }
  return (
    <div
      className={cn(
        'focus-within-ring flex min-h-11 w-full items-stretch overflow-hidden rounded-md border border-control bg-surface-base transition-colors duration-fast ease-standard',
        invalid && 'border-2 border-danger',
        rest.disabled && 'border-transparent bg-disabled-bg',
        className,
      )}
    >
      {prefixText != null ? (
        <span className="flex items-center border-r border-base px-3 text-body text-fg-muted" aria-hidden="true">
          {prefixText}
        </span>
      ) : null}
      <input
        ref={ref}
        type={type}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-body text-fg placeholder:text-fg-muted disabled:cursor-not-allowed disabled:text-disabled-fg"
        {...aria}
        {...rest}
      />
      {suffixText != null ? (
        <span className="flex items-center border-l border-base px-3 text-body text-fg-muted" aria-hidden="true">
          {suffixText}
        </span>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------------------------------- Textarea */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Grows with its content instead of scrolling. */
  autoGrow?: boolean;
  /** Shows `n/maxLength` under the field (requires `maxLength`). */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, autoGrow, showCount, className, onChange, value, defaultValue, maxLength, rows = 3, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  const [typed, setTyped] = useState(() => String(defaultValue ?? '').length);
  const countId = useId();
  const resize = () => {
    const el = inner.current;
    if (autoGrow && el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  useIsomorphicLayoutEffect(resize, [value, autoGrow]);
  const current = typeof value === 'string' ? value.length : typed;

  return (
    <div className="w-full">
      <textarea
        ref={mergeRefs(ref, inner)}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        aria-describedby={showCount && maxLength ? countId : rest['aria-describedby']}
        className={cn(controlSkin, 'read-only:bg-surface resize-y leading-normal', autoGrow && 'resize-none overflow-hidden', className)}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          resize();
          setTyped(e.target.value.length);
          onChange?.(e);
        }}
        {...rest}
      />
      {showCount && maxLength ? (
        <p id={countId} className="mt-1 text-right text-caption text-fg-muted tabular-nums">
          {current}/{maxLength}
        </p>
      ) : null}
    </div>
  );
});

/* --------------------------------------------------------------------------------- Select */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  image?: string | null;
  hint?: string | null;
  icon?: ReactNode;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options?: SelectOption[];
  /** Disabled first option shown while nothing is chosen. */
  placeholder?: string;
  invalid?: boolean;
  triggerClassName?: string;
  menuClassName?: string;
}

function extractOptionsFromChildren(children: ReactNode): SelectOption[] {
  const result: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === 'option') {
      const p = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
      if (p.value !== undefined) {
        let label = '';
        if (typeof p.children === 'string' || typeof p.children === 'number') {
          label = String(p.children);
        } else if (Array.isArray(p.children)) {
          label = p.children.map((c) => (typeof c === 'string' || typeof c === 'number' ? c : '')).join('');
        }
        result.push({
          value: String(p.value),
          label: label || String(p.value),
          disabled: p.disabled,
        });
      }
    } else if (child.props && (child.props as { children?: ReactNode }).children) {
      result.push(...extractOptionsFromChildren((child.props as { children?: ReactNode }).children));
    }
  });
  return result;
}

/** Custom-designed select with rich options (images, icons, hints), popover list, and keyboard support. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    options,
    placeholder,
    invalid,
    className,
    triggerClassName,
    menuClassName,
    children,
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    disabled,
    required,
    id,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const triggerId = `${selectId}-trigger`;
  const listboxId = `${selectId}-listbox`;

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(() => {
    if (value !== undefined && value !== null) return String(value);
    if (defaultValue !== undefined && defaultValue !== null) return String(defaultValue);
    return '';
  });

  const currentValue = isControlled ? String(value ?? '') : internalValue;

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const nativeSelectRef = useRef<HTMLSelectElement>(null);

  const allOptions = useMemo<SelectOption[]>(() => {
    if (options && options.length > 0) return options;
    if (!children) return [];
    return extractOptionsFromChildren(children);
  }, [options, children]);

  const fullOptions = useMemo<SelectOption[]>(() => {
    if (placeholder && !allOptions.some((o) => o.value === '')) {
      return [{ value: '', label: placeholder, disabled: required }, ...allOptions];
    }
    return allOptions;
  }, [placeholder, required, allOptions]);

  const selectedOption = useMemo(() => {
    return fullOptions.find((o) => o.value === currentValue) ?? null;
  }, [fullOptions, currentValue]);

  useEffect(() => {
    if (isControlled) {
      setInternalValue(String(value ?? ''));
    }
  }, [isControlled, value]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onMouseDown = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const el = listboxRef.current.children[highlightedIndex] as HTMLElement | undefined;
      if (typeof el?.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen, highlightedIndex]);

  const selectOption = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      if (!isControlled) {
        setInternalValue(opt.value);
      }
      setIsOpen(false);
      triggerRef.current?.focus();

      if (nativeSelectRef.current) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          'value',
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(nativeSelectRef.current, opt.value);
        } else {
          nativeSelectRef.current.value = opt.value;
        }

        const event = new Event('change', { bubbles: true });
        nativeSelectRef.current.dispatchEvent(event);
      }

      if (onChange && nativeSelectRef.current) {
        const syntheticEvent = {
          target: nativeSelectRef.current,
          currentTarget: nativeSelectRef.current,
          bubbles: true,
          cancelable: false,
          defaultPrevented: false,
          type: 'change',
        } as unknown as ChangeEvent<HTMLSelectElement>;
        onChange(syntheticEvent);
      }
    },
    [isControlled, onChange],
  );

  const handleNativeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!isControlled) {
      setInternalValue(e.target.value);
    }
    onChange?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      if (isOpen) setIsOpen(false);
      if (onBlur && nativeSelectRef.current) {
        const syntheticEvent = {
          target: nativeSelectRef.current,
          currentTarget: nativeSelectRef.current,
          type: 'blur',
        } as unknown as React.FocusEvent<HTMLSelectElement>;
        onBlur(syntheticEvent);
      }
    }
  };

  const openDropdown = () => {
    if (disabled) return;
    setIsOpen(true);
    const curIdx = fullOptions.findIndex((o) => o.value === currentValue);
    setHighlightedIndex(curIdx >= 0 ? curIdx : Math.max(0, fullOptions.findIndex((o) => !o.disabled)));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          setHighlightedIndex((prev) => {
            let next = prev + 1;
            while (next < fullOptions.length && fullOptions[next]?.disabled) {
              next++;
            }
            return next < fullOptions.length ? next : prev;
          });
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          setHighlightedIndex((prev) => {
            let next = prev - 1;
            while (next >= 0 && fullOptions[next]?.disabled) {
              next--;
            }
            return next >= 0 ? next : prev;
          });
        }
        break;
      }
      case 'Home': {
        if (isOpen) {
          e.preventDefault();
          const first = fullOptions.findIndex((o) => !o.disabled);
          if (first >= 0) setHighlightedIndex(first);
        }
        break;
      }
      case 'End': {
        if (isOpen) {
          e.preventDefault();
          for (let i = fullOptions.length - 1; i >= 0; i--) {
            if (!fullOptions[i]?.disabled) {
              setHighlightedIndex(i);
              break;
            }
          }
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          const opt = fullOptions[highlightedIndex];
          if (opt && !opt.disabled) {
            selectOption(opt);
          }
        }
        break;
      }
      case 'Escape': {
        if (isOpen) {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
        break;
      }
      case 'Tab': {
        if (isOpen) {
          setIsOpen(false);
        }
        break;
      }
      default: {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const char = e.key.toLowerCase();
          const start = isOpen ? highlightedIndex + 1 : 0;
          const matchIdx = fullOptions.findIndex(
            (o, idx) => idx >= start && !o.disabled && o.label.toLowerCase().startsWith(char),
          );
          const wrapIdx =
            matchIdx >= 0
              ? matchIdx
              : fullOptions.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(char));
          if (wrapIdx >= 0) {
            setHighlightedIndex(wrapIdx);
            if (!isOpen) {
              selectOption(fullOptions[wrapIdx]!);
            }
          }
        }
      }
    }
  };

  const isPlaceholder = !selectedOption || (selectedOption.value === '' && !!placeholder);

  return (
    <div ref={containerRef} className={cn('relative w-full', className)} onBlur={handleBlur}>
      {/* Hidden native select for form serialization, accessibility, and ref forwarding */}
      <select
        ref={mergeRefs(ref, nativeSelectRef)}
        id={selectId}
        value={currentValue}
        onChange={handleNativeChange}
        onFocus={(e) => {
          triggerRef.current?.focus();
          onFocus?.(e);
        }}
        tabIndex={-1}
        disabled={disabled}
        required={required}
        aria-invalid={invalid || undefined}
        className="sr-only"
        {...rest}
      >
        {placeholder && !allOptions.some((o) => o.value === '') ? (
          <option value="" disabled={required}>
            {placeholder}
          </option>
        ) : null}
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>

      {/* Custom styled trigger button */}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-invalid={invalid || undefined}
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-labelledby']}
        aria-describedby={rest['aria-describedby']}
        onClick={() => {
          if (!disabled) {
            if (isOpen) setIsOpen(false);
            else openDropdown();
          }
        }}
        onKeyDown={onKeyDown}
        className={cn(
          controlSkin,
          'flex items-center justify-between gap-2.5 text-left cursor-pointer select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent',
          isOpen && 'border-accent ring-2 ring-accent/30',
          triggerClassName,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {selectedOption?.image ? (
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-base/40 bg-surface">
              <img
                src={selectedOption.image}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </span>
          ) : selectedOption?.icon ? (
            <span className="shrink-0 text-fg-muted">{selectedOption.icon}</span>
          ) : null}

          <span
            className={cn(
              'truncate',
              isPlaceholder ? 'text-fg-muted font-normal' : 'text-fg font-medium',
            )}
          >
            {selectedOption ? selectedOption.label : placeholder || '\u00A0'}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1.5 ml-1 text-fg-muted">
          {selectedOption?.hint ? (
            <span className="text-body-xs text-fg-muted">{selectedOption.hint}</span>
          ) : null}
          <ChevronDown
            width={18}
            height={18}
            className={cn(
              'text-fg transition-transform duration-200',
              isOpen && 'rotate-180 text-accent',
            )}
            aria-hidden="true"
          />
        </span>
      </button>

      {/* Custom styled popover menu */}
      {isOpen ? (
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={rest['aria-label'] || placeholder || 'Options'}
          className={cn(
            'absolute left-0 right-0 top-full mt-1.5 z-50 max-h-60 overflow-y-auto rounded-md border border-base bg-surface-base py-1 px-1 shadow-float',
            menuClassName,
          )}
        >
          {fullOptions.length === 0 ? (
            <div className="px-3 py-3 text-center text-body-sm text-fg-muted">
              No options available
            </div>
          ) : (
            fullOptions.map((opt, i) => {
              const isSelected = opt.value === currentValue;
              const isHighlighted = i === highlightedIndex;
              return (
                <div
                  key={opt.value || `empty-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onClick={() => {
                    if (!opt.disabled) {
                      selectOption(opt);
                    }
                  }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={cn(
                    'group relative flex min-h-[40px] items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-body-sm transition-colors cursor-pointer select-none',
                    isHighlighted && 'bg-surface text-fg',
                    isSelected && !isHighlighted && 'bg-surface/50 font-medium text-fg',
                    opt.disabled && 'cursor-not-allowed opacity-40 pointer-events-none',
                  )}
                >
                  {opt.image ? (
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-base/40 bg-surface">
                      <img
                        src={opt.image}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </span>
                  ) : opt.icon ? (
                    <span className="shrink-0 text-fg-muted">{opt.icon}</span>
                  ) : null}

                  <span className={cn('min-w-0 flex-1 truncate', isSelected ? 'font-medium text-fg' : 'text-fg')}>
                    {opt.label}
                  </span>

                  {opt.hint ? (
                    <span className="shrink-0 text-body-xs text-fg-muted">{opt.hint}</span>
                  ) : null}

                  {isSelected ? (
                    <Check size={16} className="text-accent shrink-0 ml-1.5" aria-hidden="true" />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------------------------------- Checkbox */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  label: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
  invalid?: boolean;
}

/** 24px box in a 44px hit area, native input underneath (keyboard, forms and AT for free). */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate, invalid, className, disabled, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = `${inputId}-desc`;
  const inner = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-body text-fg',
        disabled && 'cursor-not-allowed text-disabled-fg',
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex h-6 w-6 shrink-0">
        <input
          ref={mergeRefs(ref, inner)}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={description ? descId : undefined}
          className="peer stimpy-peer absolute -inset-2.5 z-10 m-0 h-11 w-11 cursor-[inherit] opacity-0"
          {...rest}
        />
        <span
          aria-hidden="true"
          className={cn(
            'focus-target inline-flex h-6 w-6 items-center justify-center rounded-sm border-2 border-control bg-surface-base text-fg-inverse',
            'transition-colors duration-fast ease-standard',
            '[&>.check]:opacity-0 [&>.minus]:opacity-0',
            'peer-checked:border-fg peer-checked:bg-fg peer-checked:[&>.check]:opacity-100',
            'peer-indeterminate:border-fg peer-indeterminate:bg-fg peer-indeterminate:[&>.check]:opacity-0 peer-indeterminate:[&>.minus]:opacity-100',
            'peer-aria-[invalid=true]:border-danger',
            'peer-disabled:border-line peer-disabled:bg-disabled-bg',
          )}
        >
          <Check className="check absolute" width={16} height={16} strokeWidth={3} />
          <Minus className="minus absolute" width={16} height={16} strokeWidth={3} />
        </span>
      </span>
      <span className="flex flex-col">
        <span>{label}</span>
        {description ? (
          <span id={descId} className={cn('text-body-sm', disabled ? 'text-disabled-fg' : 'text-fg-muted')}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
});

/* ------------------------------------------------------------------------------- RadioGroup */

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  /** Trailing detail such as a price. */
  meta?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: RadioOption[];
  /** Visible group label. Use `aria-label` instead when the label is shown elsewhere. */
  legend?: ReactNode;
  'aria-label'?: string;
  variant?: 'default' | 'card';
  invalid?: boolean;
  className?: string;
}

/** Native radios: arrow keys, roving tabindex and form semantics come from the browser. */
export function RadioGroup({
  name,
  value,
  onChange,
  options,
  legend,
  variant = 'default',
  invalid,
  className,
  'aria-label': ariaLabel,
}: RadioGroupProps) {
  const legendId = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={legend ? legendId : undefined}
      aria-label={legend ? undefined : ariaLabel}
      aria-invalid={invalid || undefined}
      className={cn('w-full', className)}
    >
      {legend ? (
        <div id={legendId} className="mb-2 text-body font-medium text-fg">
          {legend}
        </div>
      ) : null}
      <div className={cn(variant === 'card' ? 'grid gap-3' : 'flex flex-col')}>
        {options.map((o) => {
          const checked = value === o.value;
          const common = {
            type: 'radio' as const,
            name,
            value: o.value,
            checked,
            disabled: o.disabled,
            onChange: () => onChange(o.value),
          };
          if (variant === 'card') {
            return (
              <label
                key={o.value}
                className={cn(
                  'focus-within-ring relative flex cursor-pointer items-start gap-3 rounded-lg border-2 border-base bg-surface-base p-4 text-fg transition-colors duration-fast ease-standard',
                  'hover:border-control has-[:checked]:border-fg',
                  o.disabled && 'cursor-not-allowed text-disabled-fg hover:border-base',
                )}
              >
                <input {...common} className="peer stimpy-peer sr-only" />
                <RadioDot checked={checked} disabled={o.disabled} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{o.label}</span>
                  {o.description ? (
                    <span className={cn('text-body-sm', o.disabled ? 'text-disabled-fg' : 'text-fg-muted')}>
                      {o.description}
                    </span>
                  ) : null}
                </span>
                {o.meta ? <span className="shrink-0 font-bold tabular-nums">{o.meta}</span> : null}
              </label>
            );
          }
          return (
            <label
              key={o.value}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-body text-fg',
                o.disabled && 'cursor-not-allowed text-disabled-fg',
              )}
            >
              <span className="relative mt-0.5 inline-flex h-6 w-6 shrink-0">
                <input {...common} className="peer stimpy-peer absolute -inset-2.5 z-10 m-0 h-11 w-11 cursor-[inherit] opacity-0" />
                <RadioDot checked={checked} disabled={o.disabled} focusTarget />
              </span>
              <span className="flex flex-col">
                <span>{o.label}</span>
                {o.description ? (
                  <span className={cn('text-body-sm', o.disabled ? 'text-disabled-fg' : 'text-fg-muted')}>
                    {o.description}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function RadioDot({ checked, disabled, focusTarget }: { checked: boolean; disabled?: boolean; focusTarget?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-surface-base',
        focusTarget && 'focus-target',
        checked ? 'border-fg' : 'border-control',
        disabled && 'border-line bg-disabled-bg',
      )}
    >
      <span className={cn('h-3 w-3 rounded-full bg-fg transition-opacity duration-fast', checked ? 'opacity-100' : 'opacity-0')} />
    </span>
  );
}

/* ------------------------------------------------------------------------ SegmentedControl */

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the group, e.g. "View". */
  'aria-label': string;
  name?: string;
  fullWidth?: boolean;
  className?: string;
}

/** 2-4 mutually exclusive options (2D/3D, packs, Hoodies/Stimpies). `role="radiogroup"`. */
export function SegmentedControl({
  options,
  value,
  onChange,
  name,
  fullWidth,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex gap-1 rounded-md border border-control bg-surface-base p-1',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((o) => (
        <label key={o.value} className={cn('relative flex-1', o.disabled && 'cursor-not-allowed')}>
          <input
            type="radio"
            name={groupName}
            value={o.value}
            checked={value === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
            className="peer stimpy-peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span
            className={cn(
              'focus-target flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-sm px-4 text-button font-medium text-fg',
              'transition-colors duration-fast ease-standard',
              'peer-checked:bg-fg peer-checked:text-fg-inverse',
              'peer-disabled:text-disabled-fg',
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------------- Switch */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Required: a switch without a label is meaningless to a screen reader. */
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /** Text shown next to the track, so state is never colour alone. */
  onText?: string;
  offText?: string;
  id?: string;
  className?: string;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onChange, label, description, disabled, loading, onText = 'On', offText = 'Off', id, className },
  ref,
) {
  const auto = useId();
  const buttonId = id ?? auto;
  const descId = `${buttonId}-desc`;
  const inactive = disabled || loading;
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4 py-1', className)}>
      <label htmlFor={buttonId} className={cn('flex flex-col text-body text-fg', inactive && 'text-disabled-fg')}>
        <span>{label}</span>
        {description ? (
          <span id={descId} className={cn('text-body-sm', inactive ? 'text-disabled-fg' : 'text-fg-muted')}>
            {description}
          </span>
        ) : null}
      </label>
      <button
        ref={ref}
        id={buttonId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={loading || undefined}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={() => {
          if (!inactive) onChange(!checked);
        }}
        className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-1 disabled:cursor-not-allowed"
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex h-7 w-12 items-center rounded-full border-2 transition-colors duration-fast ease-standard',
            checked ? 'border-fg bg-fg' : 'border-control bg-surface-base',
            disabled && 'border-transparent bg-disabled-bg',
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-fast ease-standard',
              checked ? 'translate-x-5 bg-fg-inverse' : 'translate-x-0 bg-fg-muted',
              disabled && 'bg-disabled-fg',
            )}
          >
            {loading ? <Spinner size="sm" className="scale-75 text-fg" /> : null}
          </span>
        </span>
        <span
          className={cn('w-7 text-left text-body-sm font-medium tabular-nums', disabled ? 'text-disabled-fg' : 'text-fg')}
        >
          {checked ? onText : offText}
        </span>
      </button>
    </div>
  );
});

/* ------------------------------------------------------------------------ QuantityStepper */

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Accessible name of the group, e.g. "Quantity of Neon Koi". */
  label: string;
  /** The contract allows 1..10 per line: bounds are clamped to it. */
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Minus/plus buttons (48px) around a live value. Buttons use `aria-disabled` at the bounds so
 * keyboard focus is not lost when the limit is reached.
 */
export function QuantityStepper({ value, onChange, label, min = QUANTITY_MIN, max = QUANTITY_MAX, disabled, className }: QuantityStepperProps) {
  const lo = Math.max(QUANTITY_MIN, min);
  const hi = Math.min(QUANTITY_MAX, Math.max(lo, max));
  const current = Math.min(hi, Math.max(lo, value));
  const atMin = current <= lo;
  const atMax = current >= hi;
  const btn = cn(
    'inline-flex h-12 w-12 items-center justify-center rounded-md border border-control bg-surface-base text-fg',
    'transition-colors duration-fast ease-standard hover:border-fg active:bg-line',
    'aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-disabled-bg aria-disabled:text-disabled-fg',
  );
  return (
    <div role="group" aria-label={label} className={cn('inline-flex items-center gap-1', className)}>
      <button
        type="button"
        className={btn}
        aria-label="Decrease quantity"
        aria-disabled={disabled || atMin ? true : undefined}
        onClick={() => {
          if (!disabled && !atMin) onChange(current - 1);
        }}
      >
        <Minus width={20} height={20} aria-hidden="true" />
      </button>
      <output
        aria-live="polite"
        aria-label={`Quantity ${current}`}
        className="inline-flex h-12 min-w-12 items-center justify-center px-2 text-h4 font-medium tabular-nums text-fg"
      >
        {current}
      </output>
      <button
        type="button"
        className={btn}
        aria-label="Increase quantity"
        aria-disabled={disabled || atMax ? true : undefined}
        onClick={() => {
          if (!disabled && !atMax) onChange(current + 1);
        }}
      >
        <Plus width={20} height={20} aria-hidden="true" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------------------ FormField */

export interface FormFieldProps {
  label: ReactNode;
  /** Name of the field (sent back by the API in `fields`). Also used for the DOM id when `id` is absent. */
  name?: string;
  id?: string;
  error?: string | null;
  hint?: ReactNode;
  /** Adds the word "required" next to the label (never colour alone). */
  required?: boolean;
  /** Adds "optional" next to the label. */
  optional?: boolean;
  /** One control. Its `id`, `aria-describedby`, `aria-invalid` and `aria-required` are set for it. */
  children: ReactElement | ((props: FieldA11yProps) => ReactNode);
  className?: string;
}

export interface FieldA11yProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

export function FormField({ label, name, id, error, hint, required, optional, children, className }: FormFieldProps) {
  const auto = useId();
  const fieldId = id ?? (name ? `field-${name}` : auto);
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const a11y: FieldA11yProps = {
    id: fieldId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required ? true : undefined,
  };
  let control: ReactNode;
  if (typeof children === 'function') {
    control = children(a11y);
  } else {
    const only = Children.only(children);
    control = isValidElement(only)
      ? cloneElement(only as ReactElement<Record<string, unknown>>, {
          ...a11y,
          'aria-describedby': [describedBy, (only.props as Record<string, string | undefined>)['aria-describedby']]
            .filter(Boolean)
            .join(' ') || undefined,
          ...(error ? { invalid: true } : {}),
        })
      : only;
  }
  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)} data-field={name}>
      <label htmlFor={fieldId} className="text-body font-medium text-fg">
        {label}
        {required ? <span className="ml-1 text-body-sm font-normal text-fg-muted">(required)</span> : null}
        {optional && !required ? <span className="ml-1 text-body-sm font-normal text-fg-muted">(optional)</span> : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-body-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-body-sm font-medium text-fg-danger">
          <AlertCircle width={16} height={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------- ErrorSummary */

export interface ErrorSummaryItem {
  /** DOM id of the invalid field (the link target). Omit for errors without a field. */
  fieldId?: string;
  message: string;
}

export interface ErrorSummaryProps extends HTMLAttributes<HTMLDivElement> {
  errors: ErrorSummaryItem[];
  title?: string;
  /** Move focus to the summary when it appears (after a failed submit). Default false: focus the first field instead. */
  focusOnMount?: boolean;
}

/** Focuses a field by id. Used by the summary links and by forms after a failed submit. */
export function focusField(fieldId: string): boolean {
  const el = typeof document !== 'undefined' ? document.getElementById(fieldId) : null;
  if (!el) return false;
  el.focus();
  return true;
}

/** Focuses the first `[aria-invalid="true"]` control inside `root`. */
export function focusFirstInvalid(root: ParentNode = document): boolean {
  const el = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  el?.focus();
  return !!el;
}

export const ErrorSummary = forwardRef<HTMLDivElement, ErrorSummaryProps>(function ErrorSummary(
  { errors, title = 'Please fix the following', focusOnMount = false, className, ...rest },
  ref,
) {
  const inner = useRef<HTMLDivElement>(null);
  const hasErrors = errors.length > 0;
  useEffect(() => {
    if (hasErrors && focusOnMount) inner.current?.focus();
  }, [hasErrors, focusOnMount, errors]);
  if (!hasErrors) return null;
  return (
    <div
      ref={mergeRefs(ref, inner)}
      role="alert"
      tabIndex={-1}
      className={cn('rounded-lg border-2 border-danger bg-surface-base p-4 text-fg', className)}
      {...rest}
    >
      <p className="flex items-center gap-2 text-h4 font-medium">
        <AlertCircle width={20} height={20} className="shrink-0 text-danger" aria-hidden="true" />
        {title}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-body-sm">
        {errors.map((e, i) => (
          <li key={`${e.fieldId ?? 'form'}-${i}`}>
            {e.fieldId ? (
              <a
                href={`#${e.fieldId}`}
                className="underline underline-offset-4"
                onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
                  if (focusField(e.fieldId as string)) ev.preventDefault();
                }}
              >
                {e.message}
              </a>
            ) : (
              e.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
});

/** The shared control skin, for custom inputs that must match Input/Select. */
export const controlClassName = controlSkin;
