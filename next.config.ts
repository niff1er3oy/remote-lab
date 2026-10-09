import type { NextConfig } from "next";

// Where the sensor service listens. The lab room opens /ws/sensor on this
// site, and the rewrite below passes it on. Read when the app is built and
// when it starts, so a change needs both.
const sensorUrl = (process.env.SENSOR_URL?.trim() || 'http://127.0.0.1:8888').replace(/^ws/, 'http');

const nextConfig: NextConfig = {
  allowedDevOrigins: ['demo.niff1er-3oy.com'],
  async rewrites() {
    return [
      {
        source: '/ws/sensor',
        destination: sensorUrl,
      },
    ];
  },
};

export default nextConfig;
