import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

let prisma: PrismaClient | undefined;

/** Lazy singleton so both the Next.js app and the NestJS service can import this without opening duplicate connection pools per request. */
export function getDb() {
  if (!prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // Railway's TCP proxy drops idle connections. Without a connect timeout, short
    // idle timeout and keep-alive, a dropped connection made queries hang forever.
    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 30_000,
      idleTimeoutMillis: 20_000,
      query_timeout: 30_000,
      keepAlive: true,
      max: 5,
    });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export { PrismaClient };
