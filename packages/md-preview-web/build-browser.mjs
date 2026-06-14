import * as esbuild from 'esbuild';

/** Stubs Node-only builtins with empty objects so dead-code paths don't crash at runtime. */
const stubNodeBuiltins = {
  name: 'stub-node-builtins',
  setup(build) {
    const stubs = ['node:fs', 'node:path'];
    const filter = new RegExp(`^(${stubs.join('|')})$`);
    build.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'stub-node' }));
    build.onLoad({ filter: /.*/, namespace: 'stub-node' }, () => ({ contents: 'export default {}', loader: 'js' }));
  },
};

await esbuild.build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/markdown-render-full.js',
  platform: 'browser',
  loader: { '.json': 'json' },
  plugins: [stubNodeBuiltins],
});
