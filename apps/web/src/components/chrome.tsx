import { Button } from '@/components/ui';
import { useState, type ReactNode } from 'react';

export function PageHeading({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1>{children ? <p>{children}</p> : null}</div>
      <div className="actions">{actions}</div>
    </div>
  );
}

export function ErrorBanner({ error }: { error?: string | null }) {
  return error ? <p className="error-banner" role="alert">{error}</p> : null;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3>{children ? <p>{children}</p> : null}</div>;
}

export function CopyButton({ text, label = '复制文字' }: { text: string; label?: string }) {
  const [status, setStatus] = useState('');
  return (
    <Button
      variant="default"
      size="sm"
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setStatus('已复制');
          window.setTimeout(() => setStatus(''), 1800);
        }).catch(() => setStatus('请在下方文字中手动复制'));
      }}
    >
      {status || label}
    </Button>
  );
}
