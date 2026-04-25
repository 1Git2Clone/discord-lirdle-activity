import { InteractionResponseType, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { clog } from '@lirdle/logger';
import { generateGridDashboard } from '../utils/imageGenerator.js';

const activeDashboards = new Map();

const getTodayDate = () => new Date().toISOString().split('T')[0];

export const run = async (client, interaction) => {
	try {
		await client.rest.post(`/interactions/${interaction.id}/${interaction.token}/callback`, {
			body: { type: InteractionResponseType.LaunchActivity }
		});
		clog(console.log, `[apps/bot/interactions/lirdle.js] User ${interaction.user.id} launched lirdle activity`);

		if (!interaction.guild || !interaction.channel) return;
		const channelId = interaction.channelId;
		const guildId = interaction.guildId;

		if (activeDashboards.has(channelId)) {
			clearInterval(activeDashboards.get(channelId));
			activeDashboards.delete(channelId);
		}

		const { db } = await import('@lirdle/db');
		const guildMembers = await interaction.guild.members.fetch();
		await db.guildConfig.upsert({
			where: { guildId: guildId },
			update: { activeChannelId: channelId },
			create: { guildId: guildId, activeChannelId: channelId }
		});

		const embed = new EmbedBuilder()
			.setColor('#ef4444')
			.setTitle('🔴 Lirdle Live Spectator')
			.setDescription('Loading live data...')
			.setFooter({ text: 'Updates every 10 seconds • Sleeps after 15m of inactivity' });

		const dashboardMessage = await interaction.channel.send({ embeds: [embed] });

		let lastHash = '';
		let idleTicks = 0;
		const MAX_IDLE_TICKS = 90;

		const pollInterval = setInterval(async () => {
			try {
				const today = getTodayDate();
				const activeThreshold = new Date(Date.now() - 15 * 60 * 1000);

				const activeSessions = await db.session.findMany({
					where: {
						date: today,
						updatedAt: { gte: activeThreshold },
						userId: { in: Array.from(guildMembers.keys()) }
					},
					include: { dailyWord: true }
				});

				const currentHash = activeSessions.map(s => s.updatedAt.getTime()).join('-');

				if (currentHash === lastHash) {
					idleTicks++;
					if (idleTicks >= MAX_IDLE_TICKS) {
						clearInterval(pollInterval);
						activeDashboards.delete(channelId);
						const sleepEmbed = new EmbedBuilder()
							.setColor('#6b7280')
							.setTitle('💤 Live Spectator Ended')
							.setDescription('Players have been inactive for 15 minutes. Type `/lirdle` to wake it up!');
						await dashboardMessage.edit({ embeds: [sleepEmbed], files: [] }).catch(() => { });
					}
					return;
				}

				idleTicks = 0;
				lastHash = currentHash;

				const activePlayers = activeSessions.map(session => {
					const member = guildMembers.get(session.userId);
					const state = JSON.parse(session.guesses || '{}');
					return {
						username: member ? member.user.username : 'Unknown',
						avatarUrl: member ? member.user.displayAvatarURL({ extension: 'png', size: 128 }) : null,
						guessWords: Array.isArray(state.guessWords) ? state.guessWords : [],
						perceivedScores: Array.isArray(state.scores) ? state.scores : [],
						won: session.won,
						isFinished: session.won === true
					};
				});

				const imageBuffer = await generateGridDashboard(activePlayers, "🔴 LIVE LIRDLE SPECTATOR");
				const attachment = new AttachmentBuilder(imageBuffer, { name: 'lirdle-live.png' });

				const liveEmbed = new EmbedBuilder()
					.setColor('#ef4444')
					.setImage('attachment://lirdle-live.png')
					.setFooter({ text: '🔴 LIVE • Updates automatically' });

				await dashboardMessage.edit({ embeds: [liveEmbed], files: [attachment] });

			} catch (err) {
				clog(console.error, '[apps/bot/interactions/lirdle.js][Poll Loop Error]', err);
			}
		}, 10000);

		activeDashboards.set(channelId, pollInterval);

	} catch (error) {
		clog(console.error, '[apps/bot/interactions/lirdle.js] Error:', error);
	}
};