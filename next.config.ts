import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
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
