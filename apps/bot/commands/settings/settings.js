import { SlashCommandBuilder } from 'discord.js';

/**
 * Slash command definition for /settings.
 * Manages guild-level settings for Lirdle.
 * Subcommands:
 *   monthly_stats <enable> — enables/disables auto monthly stats
 *   channel-default [channel] — sets default channel for auto leaderboard posts
 * @type {import('discord.js').SlashCommandBuilder}
 */
export const data = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Manage Lirdle guild settings')
  .addSubcommand((sub) =>
    sub
      .setName('monthly_stats')
      .setDescription('Enable or disable automatic monthly statistics')
      .addBooleanOption((opt) =>
        opt.setName('enable').setDescription('True to enable, False to disable').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('channel-default')
      .setDescription('Set the default channel for automatic leaderboard messages')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('The channel to post leaderboard messages to (omit to clear)')
          .setRequired(false),
      ),
  );
