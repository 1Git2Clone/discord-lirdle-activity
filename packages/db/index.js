import pkg from '@prisma/client';
const { PrismaClient } = pkg;

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = process.env.DATABASE_URL || `file:${path.join(__dirname, 'dev.db')}`;

const adapter = new PrismaBetterSqlite3({ url: dbUrl });

/**
 * Prisma client instance connected to the SQLite database.
 * Uses better-sqlite3 adapter via @prisma/adapter-better-sqlite3.
 * Connection URL defaults to a local dev.db file relative to this package.
 * @type {import('@prisma/client').PrismaClient}
 */
export const db = new PrismaClient({
  adapter,
});
