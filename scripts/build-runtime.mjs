import { build } from 'esbuild';
await build({ entryPoints: ['src/runtime-vendor.ts'], bundle: true, outfile: 'public/runtime.js', format: 'iife', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
