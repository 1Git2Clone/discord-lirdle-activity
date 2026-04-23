import express from 'express';
import cors from 'cors';
import dotenvFlow from 'dotenv-flow';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { clog } from '@lirdle/logger';

dotenvFlow.config({ path: '../../' });

const { db } = await import('@lirdle/db');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.WEB_PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID.trim();
const CLIENT_SECRET = process.env.CLIENT_SECRET;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/token', async (req, res) => {
	try {
		const response = await fetch(`https://discord.com/api/oauth2/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				grant_type: 'authorization_code',
				code: req.body.code,
			}),
		});

		const data = await response.json();
		res.send(data);
	} catch (error) {
		clog(console.error, '[apps/web/index.js] Error fetching token:', error);
		res.status(500).send('Error fetching token');
	}
});

app.post('/api/save-session', async (req, res) => {
	try {
		const { userId, date, targetWord, guesses, won, stats } = req.body || {};
		// TODO: Remove for debug
		// clog(console.log, `[apps/web/index.js] save-session payload:`, { userId, date, targetWord, hasGuesses: !!guesses, won, statsKeys: stats ? Object.keys(stats) : null });

		if (!userId || !date || !targetWord || !guesses) {
			return res.status(400).json({
				error: 'Missing required fields',
				body: req.body
			});
		}

		const guessesString = JSON.stringify(guesses);

		await db.dailyWord.upsert({
			where: { date: date },
			update: {},
			create: {
				date: date,
				word: targetWord
			}
		});

		await db.user.upsert({
			where: { id: userId },
			update: {
				gamesPlayed: stats?.totalFinishedGames || 1,
				wins: won ? { increment: 1 } : undefined,
				currentStreak: stats?.totalFinishedGames || 1,
				maxStreak: stats?.highestScore || 1
			},
			create: {
				id: userId,
				gamesPlayed: 1,
				wins: won ? 1 : 0,
				currentStreak: 1,
				maxStreak: 1
			}
		});

		const session = await db.session.upsert({
			where: {
				userId_date: { userId, date }
			},
			update: {
				guesses: guessesString,
				won: won,
				completedAt: new Date()
			},
			create: {
				userId,
				date,
				guesses: guessesString,
				won: won
			}
		});

		clog(console.log, `[apps/web/index.js] Saved session for User ${userId} on ${date}`);
		res.json({ success: true, session });

	} catch (error) {
		clog(console.error, '[apps/web/index.js] Error saving session:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.get('/api/load-session', async (req, res) => {
	try {
		const { userId, date } = req.query;

		if (!userId || !date) {
			return res.status(400).json({ error: 'Missing userId or date' });
		}

		let user = await db.user.findUnique({
			where: { id: userId }
		});

		if (!user) {
			user = { id: userId, currentStreak: 0, maxStreak: 0, gamesPlayed: 0, wins: 0 };
		}

		const session = await db.session.findUnique({
			where: {
				userId_date: { userId, date }
			}
		});

		res.json({
			success: true,
			user: user,
			session: session || null
		});

	} catch (error) {
		clog(console.error, '[apps/web/index.js] Error loading session:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.get('/api/config', (req, res) => {
	res.json({ clientId: CLIENT_ID });
});

app.get('/tease/:fileName', async (req, res) => {
	const fileName = req.params.fileName;
	if (!/^t\d{3}\.txt$/.test(fileName)) {
		return res.status(400).send('Invalid request');
	}
	const filePath = path.join(__dirname, 'public', 'tease', fileName);
	try {
		await fs.access(filePath);
		return res.sendFile(filePath);
	} catch {
		return res.status(200).type('text/plain').send('');
	}
});

app.get('/stats/:fileName', async (req, res) => {
	const fileName = req.params.fileName;
	if (!/^day\d{4}\.json$/.test(fileName)) {
		return res.status(400).json({ error: 'Invalid request' });
	}
	const filePath = path.join(__dirname, 'public', 'stats', fileName);
	try {
		await fs.access(filePath);
		return res.sendFile(filePath);
	} catch {
		return res.json({ started: 0, finished: 0, finishedDetails: { average: 0 } });
	}
});

app.get('/usage/:endpoint', (req, res) => {
	const endpoint = req.params.endpoint;
	const query = req.query;
	clog(console.log, `[apps/web/index.js] Usage event: ${endpoint}`, query);
	res.json({ success: true, endpoint, query });
});

app.listen(PORT, () => {
	clog(console.log, `[apps/web/index.js] Lirdle frontend & API running at http://localhost:${PORT}`);
});