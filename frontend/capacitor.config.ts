import type { CapacitorConfig } from "@capacitor/cli";

/**
 * TaxMate native shell. The web assets come from `npm run build:mobile`
 * (dist-mobile); the app talks to the customer's workspace over HTTPS with
 * `Authorization: TaxMate <device token>` — no cookies, no CSRF.
 *
 * Origins the backend must allow (bench set-config allow_cors):
 *   Android  https://localhost      (androidScheme "https")
 *   iOS      capacitor://localhost
 */
const config: CapacitorConfig = {
  appId: "com.ascratech.taxmate",
  appName: "TaxMate",
  webDir: "dist-mobile",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      showSpinner: false,
    },
  },
};

export default config;
