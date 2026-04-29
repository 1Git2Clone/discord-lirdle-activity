import { db } from './index.js';

/**
 * Fetch all userIds who have ever played in this guild (via UserGuild).
 * @param {string} guildId
 * @returns {Promise<string[]>}
 */
export async function getGuildUserIds(guildId) {
  const rows = await db.userGuild.findMany({
    where: { guildId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/**
 * Compute per-user aggregate stats from sessions. Uses denormalized `tries`.
 */
function aggregateUserStats(sessions) {
  const map = {};
  for (const s of sessions) {
    if (!map[s.userId]) {
      map[s.userId] = {
        gamesPlayed: 0,
        wins: 0,
        totalFinishedTries: 0,
        finishedGames: 0,
        totalUnfinishedTries: 0,
        unfinishedGames: 0,
        bestTries: Infinity,
        worstTries: -1,
      };
    }
    const agg = map[s.userId];
    agg.gamesPlayed++;
    if (s.won) {
      agg.wins++;
      agg.finishedGames++;
      agg.totalFinishedTries += s.tries;
      if (s.tries < agg.bestTries) agg.bestTries = s.tries;
      if (s.tries > agg.worstTries) agg.worstTries = s.tries;
    } else {
      agg.unfinishedGames++;
      agg.totalUnfinishedTries += s.tries;
    }
  }
  for (const uid of Object.keys(map)) {
    const a = map[uid];
    if (a.bestTries === Infinity) a.bestTries = 0;
    if (a.worstTries === -1) a.worstTries = 0;
    a.avgTries = a.finishedGames > 0 ? a.totalFinishedTries / a.finishedGames : 0;
    a.avgTriesBeforeStop = a.unfinishedGames > 0 ? a.totalUnfinishedTries / a.unfinishedGames : 0;
  }
  return map;
}

/**
 * Get leaderboard for a guild. Queries UserGuild for all userIds,
 * then queries Session with .select() to avoid loading JSON.
 * @param {string} guildId
 * @param {'daily'|'monthly'|'all'} period
 * @param {string} [dateStr]
 * @returns {Promise<Array>} Ranked entries
 */
export async function getLeaderboard(guildId, period, dateStr) {
  const userIds = await getGuildUserIds(guildId);
  if (userIds.length === 0) return [];

  const where = { userId: { in: userIds } };

  if (period === 'daily') {
    const date = dateStr || new Date().toISOString().split('T')[0];
    where.date = date;
  } else if (period === 'monthly') {
    const pivot = dateStr ? new Date(dateStr) : new Date();
    const year = pivot.getFullYear();
    const monthKey = `${year}-${String(pivot.getMonth() + 1).padStart(2, '0')}`;
    const firstOfMonth = `${monthKey}-01`;
    const lastDay = new Date(year, pivot.getMonth() + 1, 0).getDate();
    const lastOfMonth = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
    where.date = { gte: firstOfMonth, lte: lastOfMonth };
  }

  const sessions = await db.session.findMany({
    where,
    select: { userId: true, won: true, tries: true },
  });

  const aggMap = aggregateUserStats(sessions);

  return Object.entries(aggMap)
    .map(([userId, stats]) => ({ userId, ...stats }))
    .sort((a, b) => {
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.finishedGames > 0 && b.finishedGames > 0) return a.avgTries - b.avgTries;
      if (a.finishedGames > 0) return -1;
      if (b.finishedGames > 0) return 1;
      return a.avgTriesBeforeStop - b.avgTriesBeforeStop;
    })
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}

/**
 * Compute per-user stats history with sorting.
 * @param {string} userId - Discord user ID
 * @param {string} [sortBy] - Sort field
 * @param {'asc'|'desc'} [order] - Sort order
 * @param {number} [limit] - Max results
 * @returns {Promise<Object>} Stats summary and session list
 */
export async function getUserStats(userId, sortBy = 'date', order = 'desc', limit = 50) {
  const sessions = await db.session.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    select: { date: true, won: true, tries: true },
  });

  // Compute aggregate — uses denormalized tries, no JSON parsing
  const finished = sessions.filter((s) => s.won);
  const unfinished = sessions.filter((s) => !s.won);
  const totalFinished = finished.length;
  const totalFinishedTries = finished.reduce((sum, s) => sum + s.tries, 0);
  const totalUnfinished = unfinished.length;
  const totalUnfinishedTries = unfinished.reduce((sum, s) => sum + s.tries, 0);

  const stats = {
    gamesPlayed: sessions.length,
    wins: totalFinished,
    gamesForgot: totalUnfinished,
    avgTries: totalFinished > 0 ? totalFinishedTries / totalFinished : 0,
    fewestTries: finished.length > 0 ? Math.min(...finished.map((s) => s.tries)) : 0,
    mostTries: finished.length > 0 ? Math.max(...finished.map((s) => s.tries)) : 0,
    avgTriesBeforeStop: totalUnfinished > 0 ? totalUnfinishedTries / totalUnfinished : 0,
    currentStreak: 0,
    maxStreak: 0,
  };

  // Compute streaks from User model
  const user = await db.user.findUnique({ where: { id: userId } });
  if (user) {
    stats.currentStreak = user.currentStreak;
    stats.maxStreak = user.maxStreak;
  }

  // Sort sessions
  const sortFieldMap = { date: 'date', tries: 'tries', won: 'won' };
  const field = sortFieldMap[sortBy] || 'date';
  const dir = order === 'asc' ? 1 : -1;
  sessions.sort((a, b) => {
    const va = a[field] ?? 0;
    const vb = b[field] ?? 0;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  const limited = sessions.slice(0, limit);

  return { stats, sessions: limited };
}
