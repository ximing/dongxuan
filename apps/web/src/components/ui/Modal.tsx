import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { Button } from './controls';

export function Modal({ open, title, onClose, initialFocus, children, restoreFocus = true, className = '' }: {
  open: boolean;
  title: string;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
  restoreFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement;
    dialog.showModal(); initialFocus?.current?.focus();
    return () => { dialog.close(); if (restoreFocus && previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, initialFocus, restoreFocus]);
  if (!open) return null;
  return <dialog ref={ref} className={'ui-modal ' + className} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <div className="dialog-head"><h2 id={titleId}>{title}</h2><Button className="close-btn" aria-label="关闭" onClick={onClose}>×</Button></div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
