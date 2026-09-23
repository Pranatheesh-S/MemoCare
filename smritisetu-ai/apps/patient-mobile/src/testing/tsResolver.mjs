/**
 * Node ESM resolver hook for the test runner.
 *
 * Metro resolves extensionless imports ("./adapter", "../repositories"); Node's
 * ESM loader does not. This hook adds the same resolution so the tests exercise
 * the application source exactly as written, with no build step and no mocks.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const CANDIDATE_SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx", ".js", "/index.js", ".json"];

/**
 * Native modules replaced by plain-Node stand-ins for the integration test.
 * The application source is untouched — only resolution changes — so the test
 * exercises the real API client, repositories and sync engine.
 */
const NATIVE_STUBS = new Set([
  "expo-secure-store",
  "expo-crypto",
  "expo-constants",
  "expo-application",
  "expo-device",
  "expo-notifications",
  "expo-audio",
  "expo-speech",
  "react-native",
  "react-native-fast-tflite",
]);

const stubsDir = path.resolve(fileURLToPath(import.meta.url), "..", "stubs");

/**
 * Node's ESM loader demands an explicit `with { type: "json" }` on JSON
 * imports; Metro does not. Injecting the attribute here keeps the application
 * source written the way the bundler expects.
 */
function withJsonAttribute(resolved) {
  if (!resolved?.url?.endsWith(".json")) return resolved;
  return { ...resolved, importAttributes: { type: "json" }, format: "json" };
}

export async function resolve(specifier, context, nextResolve) {
  if (process.env.SMRITISETU_STUB_NATIVE === "1" && NATIVE_STUBS.has(specifier)) {
    const stub = path.join(stubsDir, `${specifier}.ts`);
    if (existsSync(stub)) {
      return { url: pathToFileURL(stub).href, format: "module-typescript", shortCircuit: true };
    }
  }

  if (specifier.endsWith("embeddedAssets") || specifier.endsWith("embeddedAssets.ts")) {
    const stub = path.join(stubsDir, "embeddedAssets.ts");
    if (existsSync(stub)) {
      return { url: pathToFileURL(stub).href, format: "module-typescript", shortCircuit: true };
    }
  }

  if (specifier.endsWith("songAssets") || specifier.endsWith("songAssets.ts")) {
    const stub = path.join(stubsDir, "songAssets.ts");
    if (existsSync(stub)) {
      return { url: pathToFileURL(stub).href, format: "module-typescript", shortCircuit: true };
    }
  }

  try {
    return withJsonAttribute(await nextResolve(specifier, context));
  } catch (error) {
    // Only relative/absolute specifiers get the extension treatment; bare
    // package names must keep failing loudly.
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) throw error;

    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const basePath = path.resolve(path.dirname(parentPath), specifier);

    for (const suffix of CANDIDATE_SUFFIXES) {
      const candidate = `${basePath}${suffix}`;
      if (existsSync(candidate)) {
        // TypeScript files must be reported as module-typescript so Node's
        // type stripping runs; anything else is a plain ES module.
        const isTypeScript = candidate.endsWith(".ts") || candidate.endsWith(".tsx");
        return withJsonAttribute({
          url: pathToFileURL(candidate).href,
          format: isTypeScript ? "module-typescript" : "module",
          shortCircuit: true,
        });
      }
    }
    throw error;
  }
}
