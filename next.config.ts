import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Tesseract.js loads worker/core files dynamically at runtime.
  // Keeping it external avoids Next bundling quirks that lead to MODULE_NOT_FOUND.
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
