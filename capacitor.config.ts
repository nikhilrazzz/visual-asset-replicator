import type { CapacitorConfig } from "@capacitor/cli";

// The iPhone app is a native shell that loads the live Mafia site,
// so every web update reaches the app without a new store release.
const config: CapacitorConfig = {
  appId: "com.inflooo.mafia",
  appName: "Mafia",
  webDir: "capacitor-www",
  backgroundColor: "#000000",
  server: {
    url: "https://mafia.inflooo.com",
    cleartext: false,
  },
  ios: { contentInset: "always" },
};

export default config;
