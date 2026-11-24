import { useId, useRef, useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

type ActionStyle = { variant?: 'default' | 'primary' | 'ghost' | 'plain'; size?: 'md' | 'sm' };
function actionClass({ variant = 'plain', size = 'md' }: ActionStyle, className = '') {
  return ['ui-button', variant === 'plain' ? '' : 'btn', variant === 'default' ? '' : variant, size === 'sm' ? 'small' : '', className].filter(Boolean).join(' ');
}

export function Button({ variant, size, className, type = 'button', ...props }: ComponentPropsWithRef<'button'> & ActionStyle) {
  return <button {...props} type={type} className={actionClass({ variant, size }, className)} />;
}

type ButtonLinkProps = ActionStyle & (
  | (LinkProps & { href?: never })
  | (ComponentPropsWithRef<'a'> & { href: string; to?: never })
);
export function ButtonLink({ variant = 'default', size, className, ...props }: ButtonLinkProps) {
  const classes = actionClass({ variant, size }, className);
  return props.to !== undefined ? <Link {...props as LinkProps} className={classes} /> : <a {...props as ComponentPropsWithRef<'a'>} className={classes} />;
}

type InputProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  type?: 'text' | 'number' | 'email' | 'password' | 'search' | 'tel' | 'url';
};
export function Input({ className = '', type = 'text', ...props }: InputProps) {
  return <input {...props} type={type} className={`ui-input ${className}`} />;
}
export function Textarea({ className = '', ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea {...props} className={`ui-textarea ${className}`} />;
}
export function Checkbox({ className = '', ...props }: Omit<ComponentPropsWithRef<'input'>, 'type'>) {
  return <input {...props} type="checkbox" className={`ui-check ${className}`} />;
}
export function Radio({ className = '', ...props }: Omit<ComponentPropsWithRef<'input'>, 'type'>) {
  return <input {...props} type="radio" className={`ui-radio ${className}`} />;
}

// Custom pickers need a validation target because their visible control is a
// button. Keep the submitted value and validation behavior in one place.
export function useControlValidation(value: string | number) {
  const trigger = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const [wasInvalid, setWasInvalid] = useState(false);
  const invalid = wasInvalid && String(value) === '';
  return {
    trigger, errorId, invalid,
    onInvalid(event: React.InvalidEvent<HTMLInputElement>) {
      event.preventDefault();
      setWasInvalid(true);
      if (!event.currentTarget.form || event.currentTarget.form.querySelector(':invalid') === event.currentTarget) trigger.current?.focus();
    },
  };
}

export function Disclosure({ summary, children, className = '', ...props }: Omit<ComponentPropsWithRef<'details'>, 'children'> & { summary: ReactNode; children: ReactNode }) {
  return <details {...props} className={`ui-disclosure ${className}`}><summary className="ui-disclosure-trigger">{summary}</summary>{children}</details>;
}
