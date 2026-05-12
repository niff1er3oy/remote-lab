import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['demo.niff1er-3oy.com'],
  async rewrites() {
    return [
      {
        source: '/ws/sensor',
        destination: 'http://127.0.0.1:8000/ws/sensor',
      },
    ];
  },
};

export default nextConfig;
