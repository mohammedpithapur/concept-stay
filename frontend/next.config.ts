import type { NextConfig } from "next";

function supabaseHostname(): string {
  if (process.env.NEXT_PUBLIC_SUPABASE_HOSTNAME) {
    return process.env.NEXT_PUBLIC_SUPABASE_HOSTNAME.trim();
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const raw = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
      const urlStr = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
      return new URL(urlStr).hostname;
    } catch {
      return "xxxx.supabase.co";
    }
  }

  return "xxxx.supabase.co";
}

function apiOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").trim();
  try {
    const urlStr = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    return new URL(urlStr).origin;
  } catch {
    return "http://localhost:8000";
  }
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co https://checkout.razorpay.com https://conceptstay.in https://*.tile.openstreetmap.org https://unpkg.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      `connect-src 'self' ${apiOrigin()} https://*.onrender.com http://localhost:8000 http://127.0.0.1:8000 http://localhost:3000 http://127.0.0.1:3000 https://*.supabase.co https://api.razorpay.com`,
      "frame-src 'self' https://api.razorpay.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "172.28.104.24"],
  turbopack: {
    root: ".",
  },
  images: {
    unoptimized: true,
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
