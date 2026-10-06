import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "PRIVACY.md"), "utf8");
const output = resolve(root, "site/privacy/index.html");

const escapeHtml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function inline(markdown) {
  return escapeHtml(markdown)
    .replace(/\*\*(.+?)\*\*/gu, "<strong>$1</strong>")
    .replace(/(https:\/\/[A-Za-z0-9./_-]+)/gu, '<a href="$1">$1</a>');
}

const blocks = [];
let paragraph = [];
const flushParagraph = () => {
  if (paragraph.length === 0) return;
  const text = paragraph.join(" ");
  const effective = text.startsWith("Effective ");
  blocks.push(`<p${effective ? ' class="effective"' : ""}>${inline(text)}</p>`);
  paragraph = [];
};

for (const line of source.split(/\r?\n/u)) {
  if (!line.trim()) {
    flushParagraph();
    continue;
  }
  const heading = /^(#{1,2})\s+(.+)$/u.exec(line);
  if (heading) {
    flushParagraph();
    const level = heading[1].length;
    const id = heading[2].toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
    blocks.push(`<h${level} id="${id}">${inline(heading[2])}</h${level}>`);
    continue;
  }
  if (/^-\s+/u.test(line)) {
    flushParagraph();
    blocks.push(`<p>${inline(line.replace(/^-\s+/u, ""))}</p>`);
    continue;
  }
  paragraph.push(line.trim());
}
flushParagraph();

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Amper's privacy policy, rendered from the policy in the public source repository." />
    <meta name="theme-color" content="#f8fafd" />
    <title>Privacy Policy — Amper</title>
    <link rel="icon" href="/amper/assets/amper-icon-32.png" type="image/png" />
    <link rel="stylesheet" href="/amper/assets/site.css" />
  </head>
  <body>
    <header class="site-header shell">
      <a class="brand" href="/amper/" aria-label="Amper home"><img src="/amper/assets/amper-icon-128.png" alt="" />Amper</a>
      <nav class="nav" aria-label="Main navigation">
        <a href="/amper/">Home</a>
        <a href="https://github.com/shin-ieru/amper/issues">Support</a>
      </nav>
    </header>
    <main class="policy shell"><article>${blocks.join("\n      ")}</article></main>
    <footer class="site-footer shell">
      <p>Privacy policy source: <a href="https://github.com/shin-ieru/amper/blob/main/PRIVACY.md">PRIVACY.md</a>.</p>
      <nav aria-label="Footer navigation">
        <a href="/amper/">Home</a>
        <a href="https://github.com/shin-ieru/amper/issues">GitHub Issues</a>
      </nav>
    </footer>
  </body>
</html>
`;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html);
console.log(`Rendered ${output} from PRIVACY.md (${blocks.length} policy blocks).`);
