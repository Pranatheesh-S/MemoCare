import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./tsResolver.mjs", pathToFileURL(`${import.meta.dirname}/`));
