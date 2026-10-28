// Turns the single-file demo build into a page body for hosting as a claude.ai artifact
// (the host supplies <!doctype>, <html>, <head> and <body>).
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-demo/index.html', 'utf8');
const icon = 'data:image/svg+xml;base64,' + Buffer.from(readFileSync('public/icon.svg', 'utf8')).toString('base64');

const head = src.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = src.match(/<body>([\s\S]*?)<\/body>/)[1];

const keep = head
  .split('\n')
  .filter((l) => !/<meta charset|<meta name="viewport"|apple-mobile|apple-touch-icon|rel="icon"/.test(l))
  .join('\n');

const out = `${keep}\n<link rel="icon" href="${icon}">\n${body}`;
writeFileSync('dist-demo/fitnessai.html', out);
console.log('wrote dist-demo/fitnessai.html', (out.length / 1024).toFixed(0), 'KB');
