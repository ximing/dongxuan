import { register, resolve, RSRoot } from '@rabjs/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from '@/App';
import { AuthService } from '@/services/auth.service';
import { DialogService } from '@/services/dialog.service';
import '@/style-entry.css';

register(AuthService);
register(DialogService);
resolve(AuthService);
resolve(DialogService);

const root = document.getElementById('root');
if (!root) throw new Error('missing root');

createRoot(root).render(
  <StrictMode>
    <RSRoot>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RSRoot>
  </StrictMode>,
);
