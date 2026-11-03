// Сборка в один самодостаточный HTML для публикации как артефакт:
// без doctype / html / head / body, весь CSS и JS внутри.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const css = readFileSync('src/styles.css', 'utf8');
const res = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  legalComments: 'none',
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = `<title>Спросить PubMed</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
</style>
<div id="root"></div>
<script>
${js}
</script>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');

// Отдельная страница для публикации на хостинге (Vercel): полный документ, тот же CSS и JS.
const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#111217">
<meta name="robots" content="noindex, nofollow">
<title>Спросить PubMed</title>
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>
${js}
</script>
</body>
</html>
`;
mkdirSync('public', { recursive: true });
writeFileSync('public/index.html', page);
console.log('public/index.html', (page.length / 1024).toFixed(0) + ' KB');
