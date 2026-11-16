// Writes src/routeTree.gen.ts for the apps, so `tsc --noEmit` works on a clean
// checkout. The file is gitignored: normally the Vite router plugin writes it
// during dev or build. This runs the very same generator the plugin runs, from
// the copy of it installed next to the app's own router plugin, with the same
// options the apps pass to the plugin (target react). No network.
//
//   bun toolings/ci/routes.ts apps/police apps/dpp ...
import { createRequire } from "node:module";
import { resolve } from "node:path";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: routes.ts <app dir>...");
  process.exit(2);
}

for (const dir of dirs) {
  const root = resolve(dir);
  const fromApp = createRequire(resolve(root, "package.json"));
  const pluginEntry = fromApp.resolve("@tanstack/router-plugin/vite");
  const generatorPath = createRequire(pluginEntry).resolve("@tanstack/router-generator");
  const { Generator, getConfig } = await import(generatorPath);
  const config = getConfig({ target: "react" }, root);
  await new Generator({ config, root }).run();
  console.log(`route tree written for ${dir}`);
}
