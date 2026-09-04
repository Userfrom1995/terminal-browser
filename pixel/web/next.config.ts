import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the pnpm workspace lockfile sits one level up, so pin the root explicitly
  turbopack: { root: __dirname },
};

export default nextConfig;
