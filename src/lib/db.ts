import { PrismaClient } from "@prisma/client";

// Next.js dev hot-reload re-evaluates modules on every change; without caching the client
// on the global object, each reload would open a new pool of DB connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
