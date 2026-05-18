import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Hide simulator on production until local testing is complete
    if (process.env.NODE_ENV === "production") {
      return [
        { source: "/simulator", destination: "/", permanent: false },
      ];
    }
    return [];
  },
};

export default nextConfig;
