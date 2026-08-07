import type { NextConfig } from "next";

/**
 * No API rewrites: the API lives in this app as Route Handlers under /app/api.
 * (The previous split-stack setup rewrote `/api/:path*` to itself in production,
 * which made every deployed API call 404.)
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    // Upstream image hosts. Anything not listed here is rendered as an
    // initials-based fallback rather than a broken image.
    remotePatterns: [
      { protocol: "https", hostname: "r2.thesportsdb.com" },
      { protocol: "https", hostname: "www.thesportsdb.com" },
      { protocol: "https", hostname: "crests.football-data.org" },
      { protocol: "https", hostname: "e0.365dm.com" },
      { protocol: "https", hostname: "ichef.bbci.co.uk" },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
