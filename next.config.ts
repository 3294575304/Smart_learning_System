import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  // Windows static generation can fail when Next.js starts one worker per CPU.
  experimental: { cpus: 2 },
  outputFileTracingIncludes: {
    "/super-admin/development-logs": ["./CHANGELOG.md"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "p1.itc.cn",
        pathname: "/q_70/images03/**",
      },
    ],
  },
  reactStrictMode: true,
};

export default nextConfig;
