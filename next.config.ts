import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a second browser session run on http://127.0.0.1:3000
  // (a coach or admin beside a parent on localhost). Next 16 blocks dev
  // resources from any other origin, and the page never hydrates.
  allowedDevOrigins: ['127.0.0.1'],
  // /services was deleted in a55eccf ("/plans is the only place prices live
  // now"; the homepage button that led there goes to /plans) with no
  // forwarding, and old links still point at it -- the Chinese ones too.
  // /programs came a month later and has no prices. Temporary (307) so the
  // target can still change without browsers having remembered this one.
  async redirects() {
    return [
      { source: '/services', destination: '/plans', permanent: false },
      { source: '/:locale(zh-Hant|zh-Hans)/services', destination: '/:locale/plans', permanent: false },
    ];
  },
};

export default nextConfig;
