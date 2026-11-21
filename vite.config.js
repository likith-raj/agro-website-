import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  return {
    plugins: [react(), tailwindcss(), {
      name: 'shelf-current-artwork-only',
      enforce: 'pre',
      async load(id) {
        if (!id.endsWith('/ashen-press.html?raw')) return;
        const source = await readFile(id.slice(0, -4), 'utf8');
        const artwork = /^const PLATE_SRC = \{\};[^\r\n]*\r?\nconst MARK_SRC = \{\};\r?\nObject\.assign\(MARK_SRC,\{\r?\n(?:  '[a-z0-9-]+':'data:image\/webp;base64,[A-Za-z0-9+/=]+',?\r?\n)+\}\);[^\r\n]*\r?\nconst PLATE = \{\};[^\r\n]*\r?\nObject\.assign\(PLATE_SRC,\{\r?\n(?:  '[a-z0-9-]+':'data:image\/webp;base64,[A-Za-z0-9+/=]+',?\r?\n)+\}\);\r?\n(?=function loadPlates\(\)\{)/m;
        if (!artwork.test(source)) throw new Error('Registered shelf image structure changed.');
        return `export default ${JSON.stringify(source.replace(artwork, 'const PLATE_SRC = {};\nconst MARK_SRC = {};\nconst PLATE = {};\n'))}`;
      },
    }, ...(offline ? [viteSingleFile(), {
      name: 'startup-content-first',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const script = html.match(/^[ \t]*<script type="module"[^>]*>[\s\S]*?<\/script>/m)[0];
          return html.replace(script, '').replace('</body>', `${script}\n</body>`);
        },
      },
    }] : [])],
    base: offline ? './' : '/agro-website-/',
    server: { watch: { ignored: ['**/verification/**'] } },
    build: {
      outDir: offline ? 'offline' : 'dist',
      assetsInlineLimit: offline ? Infinity : 0,
      chunkSizeWarningLimit: 1500,
      manifest: !offline,
    },
  };
});
