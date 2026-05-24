import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  publicDir: "static",
  server: {
    proxy: {
      "^(/api/.*|/login|/logout)": {
        target: "http://127.0.0.1:7071",
      },
    },
  },
});
