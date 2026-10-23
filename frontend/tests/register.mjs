// used by "npm test": node --import ./tests/register.mjs --test tests/
import { register } from "node:module";

register("./resolve.mjs", import.meta.url);
