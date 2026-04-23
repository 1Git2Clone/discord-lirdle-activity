import dotenvFlow from 'dotenv-flow'; import path from 'path';
import { fileURLToPath } from 'url';
import { clog } from '@lirdle/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

dotenvFlow.config({ path: repoRoot });

// BOT VARIABLES
export const clientid = process.env.CLIENT_ID;
export const token = process.env.TOKEN;
export const version = process.env.VERSION;

// DATABASE & LOGGING
export const databaseUrl = process.env.DATABASE_URL;
export const logWithTime = process.env.LOG_WITH_TIME !== 'false';
export const logTimezone = process.env.LOG_TIMEZONE || 'UTC';

function validateConfig() {
	const missing = { essential: [], nonEssential: [] };

	if (!clientid) missing.essential.push('CLIENT_ID');
	if (!token) missing.essential.push('TOKEN');
	if (!databaseUrl) missing.essential.push('DATABASE_URL');

	if (!version) missing.nonEssential.push('VERSION');

	if (missing.essential.length > 0) {
		clog(console.error, `[apps/bot/config.js] Missing essential variables: ${missing.essential.join(', ')}`);
		process.exit(1);
	}
	if (missing.nonEssential.length > 0) {
		clog(console.warn, `[apps/bot/config.js] Missing non-essential variables: ${missing.nonEssential.join(', ')}`);
	}
	clog(console.log, '[apps/bot/config.js] Validation Success.');
}

validateConfig();