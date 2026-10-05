import type { ReactNode, Ref } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { FormField, Input, Select, Switch, Textarea, type FieldA11yProps, type InputProps, type SelectOption } from '@stimpy/ui';
import { centsToDollarString } from '../../lib/format';
import { Combobox, type ComboboxOption } from '../Combobox';

export interface FieldRenderProps extends FieldA11yProps {
  name: string;
  value: unknown;
  onChange: (...event: unknown[]) => void;
  onBlur: () => void;
  ref: Ref<unknown>;
  invalid: boolean;
}

export interface FieldProps {
  /** Dotted path into the form values (also the API `fields` path unless you map it). */
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
  /** Render the control. Spread `props` onto an `Input`/`Select`/`Textarea`, or wire a custom one. */
  children: (props: FieldRenderProps) => ReactNode;
}

/**
 * Label + control + hint + error for one React Hook Form field, with the ids and ARIA wiring done
 * (`field-<name>`, `aria-describedby`, `aria-invalid`). Error text comes from the schema or from
 * `applyApiErrors` (server `fields`), whichever set it last.
 *
 *   <Field name="name" label="Name" required>{(p) => <Input {...p} />}</Field>
 */
export function Field({ name, label, hint, required, optional, className, children }: FieldProps) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  const error = fieldState.error?.message ?? null;
  return (
    <FormField label={label} name={name} error={error} hint={hint} required={required} optional={optional} className={className}>
      {(a11y) => children({ ...a11y, name: field.name, value: field.value, onChange: field.onChange, onBlur: field.onBlur, ref: field.ref, invalid: !!error })}
    </FormField>
  );
}

type FieldBase = Pick<FieldProps, 'name' | 'label' | 'hint' | 'required' | 'optional' | 'className'>;

export interface TextFieldProps extends FieldBase {
  type?: 'text' | 'email' | 'url' | 'tel' | 'number' | 'search' | 'password';
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: InputProps['inputMode'];
  disabled?: boolean;
  readOnly?: boolean;
  prefixText?: ReactNode;
  suffixText?: ReactNode;
  /** Transform on change, e.g. upper-casing a prefix. */
  transform?: (value: string) => string;
}

export function TextField({ transform, type = 'text', placeholder, maxLength, autoComplete, inputMode, disabled, readOnly, prefixText, suffixText, ...base }: TextFieldProps) {
  return (
    <Field {...base}>
      {(p) => (
        <Input
          id={p.id}
          name={p.name}
          type={type}
          value={(p.value as string | null | undefined) ?? ''}
          onChange={(e) => p.onChange(transform ? transform(e.target.value) : e.target.value)}
          onBlur={p.onBlur}
          ref={p.ref as Ref<HTMLInputElement>}
          invalid={p.invalid}
          aria-describedby={p['aria-describedby']}
          aria-required={p['aria-required']}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete={autoComplete}
          inputMode={inputMode}
          disabled={disabled}
          readOnly={readOnly}
          prefixText={prefixText}
          suffixText={suffixText}
        />
      )}
    </Field>
  );
}

export interface TextAreaFieldProps extends FieldBase {
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  showCount?: boolean;
  disabled?: boolean;
}

export function TextAreaField({ rows = 4, maxLength, placeholder, showCount, disabled, ...base }: TextAreaFieldProps) {
  return (
    <Field {...base}>
      {(p) => (
        <Textarea
          id={p.id}
          name={p.name}
          value={(p.value as string | null | undefined) ?? ''}
          onChange={(e) => p.onChange(e.target.value)}
          onBlur={p.onBlur}
          ref={p.ref as Ref<HTMLTextAreaElement>}
          invalid={p.invalid}
          aria-describedby={p['aria-describedby']}
          aria-required={p['aria-required']}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          showCount={showCount}
          disabled={disabled}
        />
      )}
    </Field>
  );
}

export interface SelectFieldProps extends FieldBase {
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

export function SelectField({ options, placeholder, disabled, ...base }: SelectFieldProps) {
  return (
    <Field {...base}>
      {(p) => (
        <Select
          id={p.id}
          name={p.name}
          value={(p.value as string | null | undefined) ?? ''}
          onChange={(e) => p.onChange(e.target.value)}
          onBlur={p.onBlur}
          ref={p.ref as Ref<HTMLSelectElement>}
          invalid={p.invalid}
          aria-describedby={p['aria-describedby']}
          aria-required={p['aria-required']}
          options={options}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    </Field>
  );
}

export interface SwitchFieldProps {
  name: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  onText?: string;
  offText?: string;
  className?: string;
}

/** Boolean field as a labelled switch ("On"/"Off" text, never colour alone). */
export function SwitchField({ name, label, description, disabled, onText, offText, className }: SwitchFieldProps) {
  const { control } = useFormContext();
  const { field } = useController({ name, control });
  return (
    <Switch
      id={`field-${name}`}
      checked={!!field.value}
      onChange={(v) => field.onChange(v)}
      label={label}
      description={description}
      disabled={disabled}
      onText={onText}
      offText={offText}
      className={className}
    />
  );
}

export interface MoneyFieldProps extends FieldBase {
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Dollars input for a `...Cents` API field. The form value is the typed STRING (`"12.50"`); convert
 * at the form boundary with `parseDollarsToCents` (never `parseFloat * 100`) and show server values
 * with `centsToDollarString`. Pair with `moneySchema()` from `lib/schemas`.
 */
export function MoneyField({ placeholder = '0.00', disabled, ...base }: MoneyFieldProps) {
  return <TextField {...base} prefixText="$" inputMode="decimal" placeholder={placeholder} disabled={disabled} autoComplete="off" />;
}

export { centsToDollarString };

export interface ComboboxFieldProps {
  name: string;
  label: string;
  options: ComboboxOption[];
  hint?: string;
  required?: boolean;
  allowCustom?: boolean;
  clearable?: boolean;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

/** Searchable select bound to a form field (value = option value, or typed text with `allowCustom`). */
export function ComboboxField({ name, ...rest }: ComboboxFieldProps) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  return (
    <Combobox
      id={`field-${name}`}
      value={(field.value as string | null | undefined) || null}
      onChange={(v) => field.onChange(v ?? '')}
      error={fieldState.error?.message ?? null}
      {...rest}
    />
  );
}
