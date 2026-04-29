import cron from 'node-cron';
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { clog } from '@lirdle/logger';
import { generateGridDashboard } from './imageGenerator.js';

/**
 * Resolve the channel to post leaderboard messages to, preferring the
 * leaderboardChannelId if set, falling back to activeChannelId.
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {Object} config - GuildConfig from DB
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function resolveLeaderboardChannel(guild, config) {
  const channelId = config.leaderboardChannelId || config.activeChannelId;
  if (!channelId) return null;
  try {
    return await guild.channels.fetch(channelId);
  } catch {
    return null;
  }
}

/**
 * Build a text-based leaderboard summary string.
 * @param {Array} entries - Ranked leaderboard entries from the API
 * @param {Map<string, string>} usernameMap - userId -> username map
 * @returns {string} Formatted leaderboard text
 */
function buildLeaderboardText(entries, usernameMap) {
  const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'];
  const lines = [];
  const topShown = Math.min(entries.length, 20);

  for (let i = 0; i < topShown; i++) {
    const e = entries[i];
    const username = usernameMap.get(e.userId) || e.userId.slice(0, 8);
    const medal = i < 3 ? MEDAL_EMOJIS[i] : `${i + 1}.`;
    const winRate = e.gamesPlayed > 0 ? Math.round((e.wins / e.gamesPlayed) * 100) : 0;

    if (e.wins > 0) {
      lines.push(
        `${medal} **${username}** — ${e.wins} win${e.wins !== 1 ? 's' : ''} · avg ${e.avgTries.toFixed(1)} tries · ${winRate}% win rate`,
      );
    } else {
      lines.push(
        `${medal} **${username}** — ${e.gamesPlayed} game${e.gamesPlayed !== 1 ? 's' : ''}`,
      );
    }
  }

  return lines.join('\n');
}

/**
 * Schedule daily and monthly cron jobs.
 * @param {import('discord.js').Client} client - Discord client instance
 */
export const startCronJobs = (client) => {
  // Runs at midnight UTC every day
  cron.schedule(
    '0 0 * * *',
    async () => {
      clog(console.log, '[apps/bot/utils/cronJobs.js] Firing Midnight Leaderboard...');
      try {
        const { db } = await import('@lirdle/db');

        // It is currently 00:00.
        // Subtracting 1 hour (3600000ms) guarantees we get "yesterday's" date string safely.
        const targetDate = new Date(Date.now() - 3600000).toISOString().split('T')[0];

        const configs = await db.guildConfig.findMany();

        for (const config of configs) {
          try {
            const guild = await client.guilds.fetch(config.guildId).catch(() => null);
            if (!guild) continue;

            const channel = await resolveLeaderboardChannel(guild, config);
            if (!channel) continue;

            const userIds = (
              await db.userGuild.findMany({
                where: { guildId: config.guildId },
                select: { userId: true },
              })
            ).map((r) => r.userId);

            if (userIds.length === 0) continue;

            const sessions = await db.session.findMany({
              where: { date: targetDate, userId: { in: userIds } },
              include: { dailyWord: true },
            });

            if (sessions.length === 0) continue;

            let memberMap = new Map();
            try {
              const playerIds = sessions.map((s) => s.userId);
              const members = await guild.members.fetch({ user: playerIds });
              for (const [id, member] of members) {
                memberMap.set(id, member.user.username);
              }
            } catch {
              /* fallback: show userId */
            }

            const players = sessions.map((session) => {
              const username = memberMap.get(session.userId) || 'Unknown';
              const state = JSON.parse(session.guesses || '{}');
              const guessArray = Array.isArray(state.guessWords) ? state.guessWords : [];
              return {
                username,
                avatarUrl: null,
                guessWords: guessArray,
                perceivedScores: Array.isArray(state.scores) ? state.scores : [],
                won: session.won,
                isFinished: session.won === true,
                tries: guessArray.length,
              };
            });

            players.sort((a, b) => {
              if (a.won && !b.won) return -1;
              if (!a.won && b.won) return 1;
              if (a.won && b.won) return a.tries - b.tries;
              return b.tries - a.tries;
            });

            const imageBuffer = await generateGridDashboard(
              players,
              `Final Daily Leaderboard — ${targetDate}`,
            );
            const attachment = new AttachmentBuilder(imageBuffer, {
              name: 'daily-leaderboard.png',
            });

            const embed = new EmbedBuilder()
              .setColor('#eab308')
              .setImage('attachment://daily-leaderboard.png')
              .setFooter({ text: `Lirdle Daily Wrap-up • ${targetDate}` });

            await channel.send({ embeds: [embed], files: [attachment] });
          } catch (err) {
            clog(
              console.error,
              `[apps/bot/utils/cronJobs.js] Error processing guild ${config.guildId}:`,
              err,
            );
          }
        }
      } catch (e) {
        clog(console.error, '[apps/bot/utils/cronJobs.js] Fatal Error:', e);
      }
    },
    {
      timezone: 'UTC',
    },
  );

  // Runs at 00:05 on the 1st of every month
  cron.schedule(
    '5 0 1 * *',
    async () => {
      clog(console.log, '[apps/bot/utils/cronJobs.js] Firing Monthly Leaderboard...');
      try {
        const { db } = await import('@lirdle/db');
        const { getLeaderboard } = await import('@lirdle/db/leaderboard.js');

        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const year = prevMonth.getFullYear();
        const month = String(prevMonth.getMonth() + 1).padStart(2, '0');
        const yearMonth = `${year}-${month}`;

        const configs = await db.guildConfig.findMany({
          where: { monthlyStatsEnabled: true },
        });

        for (const config of configs) {
          try {
            const guild = await client.guilds.fetch(config.guildId).catch(() => null);
            if (!guild) continue;

            const channel = await resolveLeaderboardChannel(guild, config);
            if (!channel) continue;

            const entries = await getLeaderboard(config.guildId, 'monthly', `${yearMonth}-01`);
            if (entries.length === 0) continue;

            const usernameMap = new Map();
            try {
              const members = await guild.members.fetch({ user: entries.map((e) => e.userId) });
              for (const [id, m] of members) usernameMap.set(id, m.user.username);
            } catch {
              /* fallback */
            }
            const leaderboardText = buildLeaderboardText(entries, usernameMap);

            const monthNames = [
              'January',
              'February',
              'March',
              'April',
              'May',
              'June',
              'July',
              'August',
              'September',
              'October',
              'November',
              'December',
            ];

            const embed = new EmbedBuilder()
              .setColor('#8b5cf6')
              .setTitle(`📊 Lirdle Monthly Recap — ${monthNames[prevMonth.getMonth()]} ${year}`)
              .setDescription(leaderboardText)
              .setFooter({
                text: `${entries.length} player${entries.length !== 1 ? 's' : ''} • Monthly stats`,
              });

            await channel.send({ embeds: [embed] });
          } catch (err) {
            clog(
              console.error,
              `[apps/bot/utils/cronJobs.js] Error posting monthly for guild ${config.guildId}:`,
              err,
            );
          }
        }
      } catch (e) {
        clog(console.error, '[apps/bot/utils/cronJobs.js] Monthly Cache Fatal Error:', e);
      }
    },
    {
      timezone: 'UTC',
    },
  );
};
