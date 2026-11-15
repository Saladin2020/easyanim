/** Bundle src/shared/evaluate.ts into runtime/web/easyanim-core.js (the Pixi runner's evaluator). Run by `npm run build`. */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const out = "runtime/web/easyanim-core.js";
await build({
  stdin: {
    contents: 'export { evaluate, actorsAt, cuesBetween, waitInputIn, safeCount, ease, frameOf, CPS } from "./src/shared/evaluate.ts";\nexport { ANIMS, FRAME, FRAME_COLUMNS, SIDE_ROWS, columnOf } from "./src/shared/sprites.ts";\n',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: out,
  legalComments: "none",
  banner: { js: "// Easy Anim core: cutscene evaluation shared by the editor, the CLI renderer and the Pixi runner.\n// Generated from src/shared/evaluate.ts by scripts/build-core.mjs. MIT." },
});
const src = readFileSync(out, "utf8");
writeFileSync(out, src.replace(/\r\n/g, "\n"));
console.log(`wrote ${out} (${src.length} bytes)`);
