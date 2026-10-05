import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
const watch = process.argv.includes("--watch");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(here, "static"), out, { recursive: true });

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: {
    content: join(here, "src/content/main.ts"),
    bridge: join(here, "src/content/bridge.ts"),
    popup: join(here, "src/popup/popup.ts"),
  },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome111",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  legalComments: "none",
  logLevel: "info",
};

if (watch) await (await context(options)).watch();
else await build(options);
