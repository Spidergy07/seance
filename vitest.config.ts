import { defineConfig } from 'vitest/config';

// Tests run under Node with no browser. DOM-dependent code uses linkedom,
// which the tests import explicitly. Tests never hit the network (see
// tech.md and design.md section 12).
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
  },
});
