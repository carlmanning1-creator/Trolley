import { defineConfig, devices } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = 3100;

// Cloud dev containers ship one pre-installed Chromium; use it when present instead of downloading.
const CHROMIUM = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;

// Cloud dev containers re-sign outbound TLS with their own CA. Trust exactly that CA (by its key hash)
// so the test browser can reach Supabase. Nothing changes on machines without that CA file.
const PROXY_CA = "/root/.ccr/agent-proxy-ca.crt";
const proxyCaArgs = existsSync(PROXY_CA)
  ? [
      `--ignore-certificate-errors-spki-list=${execSync(
        `openssl x509 -in ${PROXY_CA} -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`,
      )
        .toString()
        .trim()}`,
    ]
  : [];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath: CHROMIUM, args: proxyCaArgs },
    // Route the test browser through the container's outbound proxy when there is one.
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" }
      : undefined,
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    // Carl and Bec: Android Chrome
    { name: "android", use: { ...devices["Pixel 7"] } },
    // Grace: iPhone. Chromium with the iPhone screen, touch and user agent.
    {
      name: "iphone",
      use: {
        ...devices["iPhone 15"],
        browserName: "chromium",
        defaultBrowserType: "chromium",
      },
    },
  ],
});
