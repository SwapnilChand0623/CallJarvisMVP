// Test-only: lets Node's built-in TypeScript support resolve the extensionless relative imports Next.js uses.
// Run: node --import ./src/app/api/internal/voice/_tests/resolve-ts.mjs --test src/app/api/internal/voice/_tests/
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
      try { return next(`${specifier}.ts`, context); } catch { /* fall through to the default error */ }
    }
    return next(specifier, context);
  },
});
