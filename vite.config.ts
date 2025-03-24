import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";

// Function to copy .htaccess file after build
const copyHtaccess = () => {
  return {
    name: "copy-htaccess",
    closeBundle: () => {
      const htaccessContent = `# Enable the rewrite engine
RewriteEngine On

# Handle the asset path rewrite (from /src/assets/ to /assets/)
RewriteRule ^src/assets/(.*)$ /assets/$1 [L]

# Set environment variable (can be accessed by PHP)
SetEnv VITE_ASSET_PREFIX /assets

# SPA fallback - serve index.html for all non-file/directory routes
# Only apply this rule if the requested filename is not an existing file
RewriteCond %{REQUEST_FILENAME} !-f
# Only apply this rule if the requested filename is not an existing directory
RewriteCond %{REQUEST_FILENAME} !-d
# Rewrite all requests to index.html
RewriteRule ^(.*)$ /index.html [L]

# Enable CORS if needed
<IfModule mod_headers.c>
  <FilesMatch "\.(ttf|ttc|otf|eot|woff|woff2|font.css|css|js|json|svg)$">
    Header set Access-Control-Allow-Origin "*"
  </FilesMatch>
</IfModule>

# Set proper MIME types
<IfModule mod_mime.c>
  AddType application/javascript js
  AddType application/json json
  AddType text/css css
  AddType image/svg+xml svg
</IfModule>

# Enable compression for better performance
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css application/javascript application/json image/svg+xml
</IfModule>`;

      // Ensure the dist directory exists
      if (!fs.existsSync("dist")) {
        fs.mkdirSync("dist", { recursive: true });
      }

      // Write the .htaccess file to the dist directory
      fs.writeFileSync("dist/.htaccess", htaccessContent);
      console.log("✅ .htaccess file created successfully");
    },
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      svgr({ svgrOptions: {} }),
      tailwindcss(),
      copyHtaccess(), // Add custom plugin to generate .htaccess
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
      // Existing env variables
      "process.env.VITE_TOKEN_ADDRESS": JSON.stringify(env.VITE_TOKEN_ADDRESS),
      "process.env.VITE_BURN_ADDRESS": JSON.stringify(env.VITE_BURN_ADDRESS),
      "process.env.VITE_BANK_ADDRESS": JSON.stringify(env.VITE_BANK_ADDRESS),
      "process.env.VITE_ENVIRONMENT": JSON.stringify(env.VITE_ENVIRONMENT),
      "process.env.VITE_NFT_TARGET_HOLDERS": JSON.stringify(
        env.VITE_NFT_TARGET_HOLDERS,
      ),
      // Add asset prefix env variable
      "process.env.VITE_ASSET_PREFIX": JSON.stringify("/assets"),
      // Polyfill globals
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
      outDir: "dist",
      emptyOutDir: true,
      // Configure assets to use the prefix
      assetsDir: "assets",
      rollupOptions: {
        // Optional: Ensure external modules are handled correctly if needed
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    server: {
      allowedHosts: [
        "localhost", // Optional: keep localhost allowed
      ],
      host: "0.0.0.0", // Bind to all interfaces for network access
      port: 5173,
    },
  };
});
