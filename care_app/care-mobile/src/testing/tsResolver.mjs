/** Node ESM resolver: extensionless "./x" imports + JSON import attribute, so
 *  tests run the TypeScript source directly with no build step. */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx", ".js", ".json"];

export async function resolve(specifier, context, nextResolve) {
  try {
    const r = await nextResolve(specifier, context);
    if (r?.url?.endsWith(".json")) return { ...r, importAttributes: { type: "json" }, format: "json" };
    return r;
  } catch (error) {
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) throw error;
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const base = path.resolve(path.dirname(parent), specifier);
    for (const suffix of SUFFIXES) {
      const candidate = `${base}${suffix}`;
      if (existsSync(candidate)) {
        const isTs = candidate.endsWith(".ts") || candidate.endsWith(".tsx");
        return { url: pathToFileURL(candidate).href, format: isTs ? "module-typescript" : "module", shortCircuit: true };
      }
    }
    throw error;
  }
}
