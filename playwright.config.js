const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:8000',
    headless: true,
  },
  webServer: {
    command: 'npx serve -l 8000',
    url: 'http://localhost:8000',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
