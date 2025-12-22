import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-config-files',
      configureServer(server) {
        server.middlewares.use('/local-config', (req, res, next) => {
          const configDir = path.resolve(__dirname, '../../configuration');
          const filePath = path.join(configDir, req.url || '');
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(fs.readFileSync(filePath, 'utf-8'));
          } else {
            next();
          }
        });
      },
    },
  ],
  base: './',
  server: {
    port: 5180,
    open: true,
  },
});
