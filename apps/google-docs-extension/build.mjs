import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
const watch = process.argv.includes("--watch");
const development = watch || process.argv.includes("--development");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(here, "static"), out, { recursive: true });
if (!development) {
  const popupPath = join(out, "popup.html");
  const popup = readFileSync(popupPath, "utf8");
  const productionPopup = popup.replace(/\s*<details class="dev">[\s\S]*?<\/details>\s*/u, "\n");
  if (productionPopup === popup) throw new Error("Production build could not remove the developer controls.");
  writeFileSync(popupPath, productionPopup);
}

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: {
    content: join(here, "src/content/main.ts"),
    bridge: join(here, "src/content/bridge.ts"),
    popup: join(here, "src/popup/popup.ts"),
    reference: join(here, "src/reference/reference.ts"),
  },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome111",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  legalComments: "none",
  logLevel: "info",
  define: { __AMPER_DEVELOPMENT__: JSON.stringify(development) },
};

if (watch) await (await context(options)).watch();
else await build(options);
