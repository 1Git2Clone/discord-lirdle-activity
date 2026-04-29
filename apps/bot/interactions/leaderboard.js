import { EmbedBuilder } from 'discord.js';
import { clog } from '@lirdle/logger';
import { getLeaderboard } from '@lirdle/db/leaderboard.js';

const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'];

export const run = async (client, interaction) => {
  try {
    await interaction.deferReply();

    const period = interaction.options.getString('period') || 'daily';
    const guildId = interaction.guildId;

    if (!guildId) {
      return await interaction.editReply({ content: 'This command can only be used in a server.' });
    }

    const entries = await getLeaderboard(guildId, period);

    if (entries.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor('#6b7280')
        .setTitle(`📊 Lirdle ${capitalize(period)} Leaderboard`)
        .setDescription('No games played yet for this period!')
        .setFooter({ text: 'Use /lirdle to start playing' });
      return await interaction.editReply({ embeds: [emptyEmbed] });
    }

    const memberMap = new Map();
    try {
      const members = await interaction.guild.members.fetch({ user: entries.map((e) => e.userId) });
      for (const [id, member] of members) {
        memberMap.set(id, member.user.username);
      }
    } catch {
      /* fallback: show userId */
    }

    const periodLabel =
      period === 'daily' ? 'Daily' : period === 'monthly' ? 'Monthly' : 'All-Time';

    const lines = [];
    const topShown = Math.min(entries.length, 20);

    for (let i = 0; i < topShown; i++) {
      const e = entries[i];
      const username = memberMap.get(e.userId) || e.userId.slice(0, 8);
      const medal = i < 3 ? MEDAL_EMOJIS[i] : `${i + 1}.`;
      const winRate = e.gamesPlayed > 0 ? Math.round((e.wins / e.gamesPlayed) * 100) : 0;

      if (e.wins > 0) {
        lines.push(
          `${medal} **${username}** — ${e.wins} win${e.wins !== 1 ? 's' : ''} · avg ${e.avgTries.toFixed(1)} tries · ${winRate}% win rate`,
        );
      } else {
        lines.push(
          `${medal} **${username}** — ${e.gamesPlayed} game${e.gamesPlayed !== 1 ? 's' : ''} · best ${e.bestTries || '-'} tries`,
        );
      }
    }

    if (entries.length > 20) {
      lines.push(`\n*...and ${entries.length - 20} more players*`);
    }

    const title =
      period === 'daily'
        ? `📊 Lirdle Daily Leaderboard — ${new Date().toISOString().split('T')[0]}`
        : `📊 Lirdle ${periodLabel} Leaderboard`;

    const embed = new EmbedBuilder()
      .setColor('#eab308')
      .setTitle(title)
      .setDescription(lines.join('\n'))
      .setFooter({
        text: `${entries.length} player${entries.length !== 1 ? 's' : ''} • ${periodLabel} period`,
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    clog(console.error, '[apps/bot/interactions/leaderboard.js] Error:', error);
    await interaction.editReply({ content: 'Failed to fetch leaderboard.' });
  }
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
