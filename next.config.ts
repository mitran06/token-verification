import type { NextConfig } from "next";

// Kiosk app served behind a Cloudflare Tunnel. Self-hosted assets only (no CDN),
// so a fairly tight CSP works. 'unsafe-inline' on script/style is still needed
// for Next's hydration bootstrap + inline styles.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  // Next's dev HMR / React Refresh needs 'unsafe-eval'; production stays stricter.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self'", // SSE (M3) is same-origin
  "font-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Pin the trusted origins for Server Actions so a spoofed X-Forwarded-Host
    // at the edge can't defeat Next's same-origin check.
    serverActions: {
      allowedOrigins: ["token.mitran.dev", "localhost:3000"],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
