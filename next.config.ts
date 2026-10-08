import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a second browser session run on http://127.0.0.1:3000
  // (a coach or admin beside a parent on localhost). Next 16 blocks dev
  // resources from any other origin, and the page never hydrates.
  allowedDevOrigins: ['127.0.0.1'],
  // /services was replaced by /programs (a55eccf) with no forwarding, and
  // search results and old links still point at it.
  async redirects() {
    return [
      { source: '/services', destination: '/programs', permanent: true },
    ];
  },
};

export default nextConfig;
