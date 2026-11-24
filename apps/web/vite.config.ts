import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', 'DONGXUAN_');
  const target = env.DONGXUAN_API_TARGET || 'http://127.0.0.1:3048';
  const proxy = {'/api': {target,changeOrigin:true},'/health': {target,changeOrigin:true}};
  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(rootDir, 'src') } },
    server: { host: '127.0.0.1', port: 5192, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 5192, strictPort: true, proxy },
  };
});
