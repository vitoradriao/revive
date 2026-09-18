const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
    test: {
        environment: 'node',
        globals: true,
        // Valores exclusivos dos testes: a suite nao depende do .env local.
        env: {
            SUPABASE_URL: 'https://revive-tests.invalid',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-placeholder',
            SUPABASE_KEY: 'test-key-placeholder',
            JWT_SECRET: 'revive-test-only-jwt-secret',
        },
        include: ['tests/**/*.test.js']
    }
});
