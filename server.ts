/**
 * Ɔkwankyerɛfo Pa - Server Entry Point
 * 
 * Supports both:
 * 1. Cloud Run / Production: `node server.ts` (loads or generates dist/server.cjs bundle)
 * 2. Development: `tsx server.ts` (loads src/serverApp.ts with hot Vite middlewares)
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const distServer = path.resolve(process.cwd(), "dist", "server.cjs");
const isDev =
  process.execArgv.some((a) => a.includes("tsx")) ||
  process.argv.some((a) => a.includes("tsx")) ||
  "TSX" in process.env ||
  process.env.npm_lifecycle_event === "dev" ||
  process.env.NODE_ENV !== "production";

if (isDev || !fs.existsSync(distServer)) {
  // In development: load src/serverApp.ts with live Vite middlewares
  await import("./src/serverApp.ts");
} else {
  // Plain node execution (Google Cloud Run / production container)
  if (!fs.existsSync(distServer)) {
    console.log("⚡ Building server bundle on the fly with esbuild...");
    try {
      const { buildSync } = await import("esbuild");
      buildSync({
        entryPoints: [path.resolve(process.cwd(), "src", "serverApp.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        packages: "external",
        sourcemap: true,
        outfile: distServer,
      });
      console.log("✓ Server bundle built successfully");
    } catch (err) {
      console.error("Failed to build server bundle:", err);
      throw err;
    }
  }

  // Load production bundled CommonJS server
  await import(pathToFileURL(distServer).href);
}
