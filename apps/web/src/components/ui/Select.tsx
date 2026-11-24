import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Button, Input, useControlValidation } from './controls';

export type SelectOption = { value: string | number; label: ReactNode; disabled?: boolean };
const EMPTY_VALUE = '__ui_empty_value__';
type SelectProps = Omit<ComponentPropsWithoutRef<'button'>, 'value' | 'onChange' | 'children' | 'defaultValue'> & {
  value: string | number;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  name?: string;
};

// Radix supplies focus management, typeahead and keyboard navigation; the visible
// trigger and list are styled here. The input preserves HTML form validation.
export function Select({ value, onValueChange, options, placeholder = '请选择', required, name, disabled, className = '', ...props }: SelectProps) {
  const { trigger, errorId, invalid, onInvalid } = useControlValidation(value);
  const empty = options.find(option => String(option.value) === '');
  return <span className={`ui-select ${className}`}>
    <SelectPrimitive.Root value={String(value)} onValueChange={next => onValueChange(next === EMPTY_VALUE ? '' : next)} disabled={disabled}>
      <SelectPrimitive.Trigger asChild>
        <Button {...props} ref={trigger} className="ui-control ui-select-trigger" aria-required={required || undefined} aria-invalid={invalid || props['aria-invalid']} aria-describedby={[props['aria-describedby'], invalid ? errorId : ''].filter(Boolean).join(' ') || undefined}>
          <SelectPrimitive.Value placeholder={empty?.label || placeholder} />
          <SelectPrimitive.Icon className="ui-select-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></SelectPrimitive.Icon>
        </Button>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={5} collisionPadding={12} className="ui-select-content">
          <SelectPrimitive.ScrollUpButton className="ui-select-scroll">⌃</SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {options.map(option => <SelectPrimitive.Item key={option.value} value={String(option.value) || EMPTY_VALUE} disabled={option.disabled || (required && String(option.value) === '')} className="ui-select-option">
              <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              <SelectPrimitive.ItemIndicator className="ui-select-check">✓</SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>)}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="ui-select-scroll">⌄</SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
    <Input className="ui-validation" tabIndex={-1} aria-hidden="true" autoComplete="off" name={name} value={value} required={required} disabled={disabled} onChange={() => {}} onInvalid={onInvalid} />
    {invalid ? <span className="ui-control-error" id={errorId} role="alert">请选择此项</span> : null}
  </span>;
}
