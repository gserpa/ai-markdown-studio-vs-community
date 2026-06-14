import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/markdown-render-full.js',
  platform: 'browser',
});
