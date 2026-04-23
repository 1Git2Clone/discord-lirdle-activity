#!/bin/sh
echo "Migrating database..."
pnpm --filter @lirdle/db exec prisma db push

echo "Starting application..."
exec "$@"