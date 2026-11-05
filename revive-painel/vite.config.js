import { defineConfig, loadEnv } from 'vite';
import { cwd } from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';

function versionOfflineShell() {
  let outputDirectory;
  return {
    name: 'revive-version-offline-shell',
    apply: 'build',
    configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const file = resolve(outputDirectory, 'sw.js');
      const source = readFileSync(file, 'utf8');
      const hash = createHash('sha256').update(source);
      for (const name of ['asset-manifest.json', 'index.html', 'manifest.webmanifest', 'icons/revive-192.svg', 'icons/revive-512.svg']) {
        hash.update(readFileSync(resolve(outputDirectory, name)));
      }
      if (!source.includes("'revive-shell-v6'")) throw new Error('Missing offline shell version marker');
      writeFileSync(file, source.replace("'revive-shell-v6'", "'revive-shell-v6-" + hash.digest('hex').slice(0, 16) + "'"));
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, cwd(), '');
  return {
    plugins: [react(), versionOfflineShell()],
    build: { manifest: 'asset-manifest.json' },
    server: {
      proxy: {
        '/api': {
          target: env.REVIVE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          // Keep the browser Host/Origin pair so same-origin validation also works locally.
          changeOrigin: false
        }
      }
    }
  };
});
