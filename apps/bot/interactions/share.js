import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { clog } from '@lirdle/logger';
import { generateLirdleImage } from '../utils/imageGenerator.js';

const getTodayDate = () => {
	const today = new Date();
	return today.toISOString().split('T')[0];
};

export const run = async (client, interaction) => {
	try {
		await interaction.deferReply();

		const userId = interaction.user.id;
		const today = getTodayDate();
		const { db } = await import('@lirdle/db');

		const user = await db.user.findUnique({ where: { id: userId } });
		const session = await db.session.findUnique({
			where: { userId_date: { userId, date: today } },
			include: { dailyWord: true }
		});

		if (!session || !session.won) {
			const embed = new EmbedBuilder()
				.setColor('#f97316')
				.setTitle('Game Not Finished')
				.setDescription('You must finish your game today before you can share your results!')
				.setFooter({ text: 'Use /lirdle to finish playing' });
			return await interaction.editReply({ embeds: [embed] });
		}

		const state = JSON.parse(session.guesses || '{}');
		const guessWords = Array.isArray(state.guessWords) ? state.guessWords : [];
		const perceivedScores = Array.isArray(state.scores) ? state.scores : [];

		const imageBuffer = await generateLirdleImage(
			guessWords,
			perceivedScores,
			session.dailyWord?.word,
			true
		);
		const attachment = new AttachmentBuilder(imageBuffer, { name: 'lirdle-share.png' });

		const embed = new EmbedBuilder()
			.setColor('#22c55e')
			.setTitle(`🎮 ${interaction.user.username}'s Lirdle Result`)
			.setDescription(`Solved in **${guessWords.length}** tries!`)
			.addFields(
				{ name: 'Games Won', value: `${user.wins} / ${user.gamesPlayed}`, inline: true },
				{ name: 'Current Streak', value: `${user.currentStreak}`, inline: true },
				{ name: 'Best Streak', value: `${user.maxStreak}`, inline: true }
			)
			.setImage('attachment://lirdle-share.png');

		await interaction.editReply({ embeds: [embed], files: [attachment] });

	} catch (error) {
		clog(console.error, '[apps/bot/interactions/share.js] Error:', error);
		await interaction.editReply({ content: 'Failed to share result.' });
	}
};