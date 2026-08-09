import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  reporter: 'line',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
