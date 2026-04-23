import cron from 'node-cron';
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { clog } from '@lirdle/logger';
import { generateGridDashboard } from './imageGenerator.js';

export const startCronJobs = (client) => {
	// '0 0 * * *' = Runs at minute 0, hour 0 (Midnight UTC) every single day
	cron.schedule('0 0 * * *', async () => {
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

					const channel = await guild.channels.fetch(config.activeChannelId).catch(() => null);
					if (!channel) continue;

					const members = await guild.members.fetch();
					const memberIds = Array.from(members.keys());

					const sessions = await db.session.findMany({
						where: { date: targetDate, userId: { in: memberIds } },
						include: { dailyWord: true }
					});

					if (sessions.length === 0) continue;

					const players = sessions.map(session => {
						const m = members.get(session.userId);
						const state = JSON.parse(session.guesses || '{}');
						const guessArray = Array.isArray(state.guessWords) ? state.guessWords : [];
						return {
							username: m ? m.user.username : 'Unknown',
							avatarUrl: m ? m.user.displayAvatarURL({ extension: 'png', size: 128 }) : null,
							guessWords: guessArray,
							perceivedScores: Array.isArray(state.scores) ? state.scores : [],
							won: session.won,
							isFinished: session.won === true,
							tries: guessArray.length
						};
					});

					players.sort((a, b) => {
						if (a.won && !b.won) return -1;
						if (!a.won && b.won) return 1;
						if (a.won && b.won) return a.tries - b.tries;
						return b.tries - a.tries;
					});

					const targetWord = sessions[0].dailyWord?.word;
					const imageBuffer = await generateGridDashboard(players, targetWord, "🏆 Final Daily Leaderboard");
					const attachment = new AttachmentBuilder(imageBuffer, { name: 'daily-leaderboard.png' });

					const embed = new EmbedBuilder()
						.setColor('#eab308')
						.setImage('attachment://daily-leaderboard.png')
						.setFooter({ text: `Lirdle Daily Wrap-up • ${targetDate}` });

					await channel.send({ embeds: [embed], files: [attachment] });

				} catch (err) {
					clog(console.error, `[apps/bot/utils/cronJobs.js] Error processing guild ${config.guildId}:`, err);
				}
			}
		} catch (e) {
			clog(console.error, '[apps/bot/utils/cronJobs.js] Fatal Error:', e);
		}
	}, {
		timezone: "UTC"
	});
};