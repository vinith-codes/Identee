// Lets Node load the studio files the way Vite does: their imports leave out ".js" ("./assistantSlogans").
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if ((specifier.startsWith(".") || specifier.startsWith("/")) && !/\.[a-z]+$/i.test(specifier)) {
      for (const ext of [".js", ".jsx", "/index.js"]) {
        try {
          return await next(specifier + ext, context);
        } catch {
          /* try the next ending */
        }
      }
    }
    throw err;
  }
}
