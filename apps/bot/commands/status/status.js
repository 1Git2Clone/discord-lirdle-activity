import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
	.setName('status')
	.setDescription('Check your current progress on today\'s Lirdle game');
