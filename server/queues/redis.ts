import type { ConnectionOptions } from "bullmq";

function parseRedisPort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port < 1) {
    throw new Error(`REDIS_URL contains an invalid port: ${value}`);
  }
  return port;
}

export function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error(
      "REDIS_URL is not set. Add it to .env before starting the normalization queue.",
    );
  }

  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error(`REDIS_URL must use redis:// or rediss://, got: ${url.protocol}`);
  }

  return {
    host: url.hostname,
    port: url.port ? parseRedisPort(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== "/" ? Number.parseInt(url.pathname.slice(1), 10) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
