// vite.config.ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      svgr({
        svgrOptions: {
          // svgr options
        },
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@components": path.resolve(__dirname, "./src/components"),
        "@features": path.resolve(__dirname, "./src/features"),
        "@hooks": path.resolve(__dirname, "./src/hooks"),
        "@lib": path.resolve(__dirname, "./src/lib"),
        "@styles": path.resolve(__dirname, "./src/styles"),
        "@assets": path.resolve(__dirname, "./src/assets"),
        "@constants": path.resolve(__dirname, "./src/constants"),
        "@types": path.resolve(__dirname, "./src/types"),
      },
    },
    define: {
      // Define global variables to expose environment variables to the client
      "process.env.VITE_TOKEN_ADDRESS": JSON.stringify(env.VITE_TOKEN_ADDRESS),
      "process.env.VITE_BURN_ADDRESS": JSON.stringify(env.VITE_BURN_ADDRESS),
      "process.env.VITE_BANK_ADDRESS": JSON.stringify(env.VITE_BANK_ADDRESS),
      "process.env.VITE_ENVIRONMENT": JSON.stringify(env.VITE_ENVIRONMENT),
      "process.env.VITE_NFT_TARGET_HOLDERS": JSON.stringify(
        env.VITE_NFT_TARGET_HOLDERS,
      ),
      // Add Buffer polyfill
      global: {},
      "Buffer.isBuffer": () => false,
    },
    optimizeDeps: {
      esbuildOptions: {
        // Node.js global to browser globalThis
        define: {
          global: "globalThis",
        },
      },
    },
    // Handling Web3 polyfills
    build: {
      rollupOptions: {
        external: ["@solana/web3.js"],
      },
    },
  };
});
