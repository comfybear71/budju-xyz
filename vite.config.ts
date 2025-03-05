import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), svgr({ svgrOptions: {} }), tailwindcss()],
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
      "process.env.VITE_TOKEN_ADDRESS": JSON.stringify(env.VITE_TOKEN_ADDRESS),
      "process.env.VITE_BURN_ADDRESS": JSON.stringify(env.VITE_BURN_ADDRESS),
      "process.env.VITE_BANK_ADDRESS": JSON.stringify(env.VITE_BANK_ADDRESS),
      "process.env.VITE_ENVIRONMENT": JSON.stringify(env.VITE_ENVIRONMENT),
      "process.env.VITE_NFT_TARGET_HOLDERS": JSON.stringify(
        env.VITE_NFT_TARGET_HOLDERS,
      ),
      global: "globalThis",
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    build: {
      rollupOptions: {
        // Remove external to bundle @solana/web3.js
        // external: ["@solana/web3.js"],
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
