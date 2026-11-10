import type { NextConfig } from "next";

// Product photos come from Supabase Storage; thumbnails are resized through /_next/image (lib/photos.ts).
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabase
      ? [
          {
            protocol: supabase.protocol === "http:" ? "http" : "https",
            hostname: supabase.hostname,
            port: supabase.port,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
    // A new photo gets a new file name, so a resized copy never goes stale.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    formats: ["image/webp"],
  },
};

export default nextConfig;
