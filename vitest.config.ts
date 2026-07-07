import { defineConfig } from "vitest/config";

// Pure unit tests only (no miniflare/wrangler): tests/ imports pure functions
// from lib/, functions/api/_lib/ and workers/expire-sweeper/src/market-auth.ts.
// Integration tests (@cloudflare/vitest-pool-workers) are a separate post-task
// so this suite stays <10s. Test files live ONLY in tests/ — functions/ is
// Pages file-routing and workers/*/src risks the wrangler bundle.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 5000,
    // An empty run must fail the gate, not silently pass (a typo in `include`
    // would otherwise make the CI test step evergreen).
    passWithNoTests: false,
  },
});
