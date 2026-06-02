import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        marketplace: resolve(__dirname, 'marketplace.html'),
        librarian: resolve(__dirname, 'librarian.html'),
        rare: resolve(__dirname, 'rare.html'),
        philosophy: resolve(__dirname, 'philosophy.html'),
        scifi: resolve(__dirname, 'scifi.html'),
        book: resolve(__dirname, 'book.html'),
        favorites: resolve(__dirname, 'favorites.html')
      }
    }
  }
});
