import { defineConfig } from 'prisma/config';
import process from 'node:process';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'file:dev.db', // Default to non-containerized development
    // url: 'file:../../dev.db', // For non-containerized development
    // url: 'file:/app/packages/db/dev.db', // Docker
  },
});
