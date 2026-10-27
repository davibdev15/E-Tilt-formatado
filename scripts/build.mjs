import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
// Resolve the installed package entry instead of depending on a third-party CDN.
const { build } = await import('./vendor.mjs');
await build();
await writeFile('public/robots.txt', 'User-agent: *\nAllow: /\nDisallow: /painel.html\n');
console.log('Site estático e cliente Supabase preparados. API em api/index.js.');
