import * as Popover from '@radix-ui/react-popover';
import { useRef, useState } from 'react';
import { Button } from './controls';

export function ActionMenu({ label = '更多', items }: {
  label?: string;
  items: Array<{ label: string; onSelect: () => void; disabled?: boolean; destructive?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><Button variant="ghost" size="sm" className="ui-action-menu-trigger" aria-haspopup="menu">{label} ▾</Button></Popover.Trigger>
    <Popover.Portal>
      <Popover.Content ref={panel} align="end" sideOffset={5} collisionPadding={12} className="ui-action-menu" role="menu" aria-label={label}
        onOpenAutoFocus={event => { event.preventDefault(); panel.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus(); }}
        onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          const options = [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') || [])];
          if (!options.length) return;
          event.preventDefault();
          const current = options.indexOf(document.activeElement as HTMLButtonElement);
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          options[index]?.focus();
        }}>
        {items.map(item => <Button key={item.label} role="menuitem" disabled={item.disabled} className={item.destructive ? 'destructive' : ''} onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</Button>)}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
