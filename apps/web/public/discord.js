import { DiscordSDK } from "./vendor/discord-sdk.js";

let discordSdk;
let discordUser = null;

async function setupDiscord() {
	try {
		const configRes = await fetch('/api/config');
		const { clientId } = await configRes.json();

		discordSdk = new DiscordSDK(clientId);
		await discordSdk.ready();

		const { code } = await discordSdk.commands.authorize({
			client_id: clientId, response_type: "code", state: "", prompt: "none", scope: ["identify", "guilds"],
		});

		const response = await fetch('/api/token', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
		});

		const { access_token } = await response.json();
		const authResult = await discordSdk.commands.authenticate({ access_token });
		discordUser = authResult.user;

		const today = new Date().toISOString().split('T')[0];
		const syncRes = await fetch(`/api/load-session?userId=${discordUser.id}&date=${today}`);
		const syncData = await syncRes.json();

		if (syncData.session && syncData.session.guesses) {
			localStorage.setItem('gameState', syncData.session.guesses);
		}
		if (syncData.session && syncData.session.stats) {
			localStorage.setItem('stats', JSON.stringify(syncData.session.stats));
		}
	} catch (err) {
		console.error("Cloud sync failed. Proceeding with local state.", err);
	} finally {
		const loadingScreen = document.getElementById('loading-screen');
		if (loadingScreen) loadingScreen.classList.remove('active');

		if (window.startLirdle) window.startLirdle();
	}
}

window.saveLirdleSession = async function (targetWord, fullStateObject, statsObject, won) {
	if (!discordUser) return;
	const payload = {
		userId: discordUser.id,
		date: new Date().toISOString().split('T')[0],
		targetWord: targetWord,
		guesses: fullStateObject,
		won: won,
		stats: statsObject
	};
	try {
		await fetch('/api/save-session', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
		});
	} catch (err) {
		console.error("Failed to save to cloud", err);
	}
};

setupDiscord();