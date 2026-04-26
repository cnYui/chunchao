import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 8002,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), 'index.html'),
        synthesizer: resolve(process.cwd(), 'synthesizer.html'),
      },
    },
  },
});
