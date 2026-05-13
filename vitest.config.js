// Vitest config. Tests run against the source files under src/ directly,
// not against the built bundle.
export default {
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/scripts/**/*.js", "src/module.js"],
      exclude: ["src/scripts/API/migration.js"],
    },
  },
};
