import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // LAN hosts allowed to load dev assets (/_next/webpack-hmr etc.) so the app
  // can be opened from other machines on the same network. Dev-only — Next
  // ignores this in production builds.
  //
  // Covers the common private ranges rather than single IPs, because every
  // client machine gets a different address from DHCP and listing them one by
  // one means editing this file mid-class. 172.20.10.* is the iPhone Personal
  // Hotspot subnet; 192.168.* and 10.* are typical router LANs.
  //
  // NOTE: allowing the origin only fixes the asset/HMR warning. A plain-http
  // LAN origin is NOT a secure context, so getUserMedia — i.e. ALL recording —
  // is still blocked on those machines. Serve over HTTPS (pnpm dev:https, or a
  // tunnel) if the other computers need to record.
  allowedDevOrigins: [
    "172.20.10.*",
    "192.168.*.*",
    "10.*.*.*",
    "*.local",
  ],
};

export default nextConfig;
