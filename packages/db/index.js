import pkg from '@prisma/client';
const { PrismaClient } = pkg;

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const rawDbUrl = process.env.DATABASE_URL || 'file:dev.db';
const dbUrl = rawDbUrl.startsWith('file:')
	? `file:${path.resolve(repoRoot, rawDbUrl.slice(5))}`
	: rawDbUrl;

const adapter = new PrismaBetterSqlite3({ url: dbUrl });

export const db = new PrismaClient({
	adapter
});