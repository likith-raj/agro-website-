import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), {
    name: 'startup-loader-first',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Keep the startup loader ahead of the large single-file bundle during download.
        const script = html.match(/^[ \t]*<script type="module"[^>]*>[\s\S]*?<\/script>/m)[0];
        return html.replace(script, '').replace('</body>', `${script}\n</body>`);
      },
    },
  }],
  base: './',
  server: { watch: { ignored: ['**/verification/**'] } },
  build: { assetsInlineLimit: Infinity, chunkSizeWarningLimit: 3000 },
});
