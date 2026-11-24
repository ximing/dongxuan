import { observer, useService } from '@rabjs/react';
import { useEffect, useId, useRef } from 'react';
import { DialogService } from '@/services/dialog.service';
import { Button } from './controls';

const ConfirmDialogContent = observer(function ConfirmDialogContent() {
  const dialog = useService(DialogService);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (dialog.message !== null) ref.current?.showModal();
  }, [dialog.message]);

  useEffect(() => () => dialog.dismiss(), [dialog]);

  if (dialog.message === null) return null;
  return (
    <dialog
      ref={ref}
      className="ui-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        dialog.finish(false);
      }}
    >
      <h2 id={titleId}>确认删除</h2>
      <p id={descriptionId}>{dialog.message}</p>
      <div className="actions">
        <Button variant="default" autoFocus onClick={() => dialog.finish(false)}>取消</Button>
        <Button variant="primary" onClick={() => dialog.finish(true)}>确认删除</Button>
      </div>
    </dialog>
  );
});

export function ConfirmDialog() {
  return <ConfirmDialogContent />;
}

export function useConfirm(): (message: string) => Promise<boolean> {
  const dialog = useService(DialogService);
  return (message: string) => dialog.confirm(message);
}
