import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        // Workspace packages are linked; keep their imports resolved from this workspace.
        preserveSymlinks: true,
    },
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
    },
});
