import express from 'express';
import cors from 'cors';
import dotenvFlow from 'dotenv-flow';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import { clog } from '@lirdle/logger';
import { getUniqueWordForUser, evaluateTrueScore, xmur3, mulberry32 } from './utils/prng.js';
import { lie } from './public/numbers.js';

dotenvFlow.config({ path: '../../' });

const { db } = await import('@lirdle/db');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.WEB_PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID.trim();
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(CLIENT_SECRET)
  .digest('base64')
  .substr(0, 32);
const IV_LENGTH = 16;

function encryptState(data) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(JSON.stringify(data));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypt AES-256-CBC encrypted state. Returns null on failure instead of
 * silently returning [] — callers must handle null explicitly so a decryption
 * failure never silently resets the accumulated changes array.
 * @param {string} text - IV-prefixed hex-encoded ciphertext ("iv:ciphertext")
 * @returns {Array|null} Decrypted changes array, or null if decryption failed
 */
function decryptState(text) {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString());
  } catch (error) {
    console.error('[apps/web/index.js] Error decrypting state:', error);
    return null;
  }
}

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/guess', async (req, res) => {
  try {
    const { userId, guessString, lettersByPosition, changes, encryptedChanges, solverData } =
      req.body;

    let user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      user = await db.user.create({
        data: {
          id: userId,
          gamesPlayed: 0,
          seed: crypto.randomUUID(),
        },
      });
    }

    const targetWord = getUniqueWordForUser(user.seed, user.gamesPlayed);
    const trueScores = evaluateTrueScore(targetWord, guessString);
    const guessedIt = guessString === targetWord;

    // Resolve the accumulated changes array from the client-sent encrypted state.
    // decryptState returns null on failure — never []. This distinction matters:
    // silently falling back to [] would reset the lie history mid-game, causing
    // the lie markers shown on win to be indexed to the wrong rows (off-by-one).
    // On failure we fall back to the last session saved in the DB, which always
    // includes the encryptedChanges as part of the guesses blob. If both fail
    // we return 500 so the client surfaces the error rather than silently
    // continuing with a corrupted state.
    let parsedChanges = null;
    if (encryptedChanges) {
      parsedChanges = decryptState(encryptedChanges);
    } else if (typeof changes === 'string') {
      parsedChanges = decryptState(changes);
    } else if (Array.isArray(changes)) {
      parsedChanges = changes;
    }

    if (parsedChanges === null) {
      const today = new Date().toISOString().split('T')[0];
      const storedSession = await db.session.findUnique({
        where: { userId_date: { userId, date: today } },
      });
      if (storedSession?.guesses) {
        try {
          const storedState = JSON.parse(storedSession.guesses);
          if (storedState?.encryptedChanges) {
            parsedChanges = decryptState(storedState.encryptedChanges);
          }
        } catch {
          // Stored guesses blob is malformed — fall through to error below
        }
      }
    }

    if (parsedChanges === null) {
      clog(
        console.error,
        `[apps/web/index.js] Could not recover changes state for user ${userId} — returning error`,
      );
      return res.status(500).json({ error: 'Could not recover game state. Please reload.' });
    }
    let finalScores = [...trueScores];
    let newChanges = [...parsedChanges];

    if (!guessedIt) {
      const lieSeedString = `${user.seed}-${user.gamesPlayed}-turn${parsedChanges.length}`;
      const deterministicRand = mulberry32(xmur3(lieSeedString)());
      lie(guessString, finalScores, lettersByPosition, newChanges, solverData, deterministicRand);
    }

    let outgoingChanges;
    if (guessedIt) {
      outgoingChanges = newChanges;
    } else {
      outgoingChanges = encryptState(newChanges);
    }

    res.json({
      guessedIt: guessedIt,
      scores: finalScores,
      changes: outgoingChanges,
      encryptedChanges: guessedIt ? null : encryptState(newChanges),
    });
  } catch (error) {
    clog(console.error, '[apps/web/index.js] Error processing guess:', error);
    res.status(500).json({ error: 'Server error processing guess' });
  }
});

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
    const { userId, date, guesses, won, stats } = req.body || {};
    // TODO: Remove for debug
    // clog(console.log, `[apps/web/index.js] save-session payload:`, { userId, date, targetWord, hasGuesses: !!guesses, won, statsKeys: stats ? Object.keys(stats) : null });

    if (!userId || !date || !guesses) {
      return res.status(400).json({
        error: 'Missing required fields',
        body: req.body,
      });
    }

    const guessesString = JSON.stringify(guesses);

    await db.dailyWord.upsert({
      where: { date: date },
      update: {},
      create: {
        date: date,
        word: 'SECRET_PRNG',
      },
    });

    const existingSession = await db.session.findUnique({
      where: { userId_date: { userId, date } },
    });
    const isFirstWin = won && (!existingSession || !existingSession.won);

    await db.user.upsert({
      where: { id: userId },
      update: {
        gamesPlayed: isFirstWin ? { increment: 1 } : undefined,
        wins: isFirstWin ? { increment: 1 } : undefined,
        maxStreak: stats?.highestScore || undefined,
      },
      create: {
        id: userId,
        gamesPlayed: won ? 1 : 0,
        wins: won ? 1 : 0,
        currentStreak: won ? 1 : 0,
        maxStreak: stats?.highestScore || 0,
        seed: crypto.randomUUID(),
      },
    });

    const session = await db.session.upsert({
      where: {
        userId_date: { userId, date },
      },
      update: {
        guesses: guessesString,
        won: won,
        completedAt: new Date(),
      },
      create: {
        userId,
        date,
        guesses: guessesString,
        won: won,
      },
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
      where: { id: userId },
    });

    if (!user) {
      user = { id: userId, currentStreak: 0, maxStreak: 0, gamesPlayed: 0, wins: 0 };
    }

    const session = await db.session.findUnique({
      where: {
        userId_date: { userId, date },
      },
    });

    res.json({
      success: true,
      user: user,
      session: session || null,
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
  clog(
    console.log,
    `[apps/web/index.js] Lirdle frontend & API running at http://localhost:${PORT}`,
  );
});
