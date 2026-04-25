import { DiscordSDK } from "./vendor/discord-sdk.js";

let discordSdk;
let discordUser = null;

async function authenticateWithRetry(clientId, maxRetries = 3) {
	let cachedToken = null;
	try {
		cachedToken = localStorage.getItem('discord_access_token');
	} catch (e) {
		// Browser blocked storage, proceed to normal auth
	}

	if (cachedToken) {
		try {
			const authResult = await discordSdk.commands.authenticate({ access_token: cachedToken });
			return authResult;
		} catch (err) {
			console.warn("Cached token was expired or invalid. Fetching a fresh code.");
			try { localStorage.removeItem('discord_access_token'); } catch (e) { }
		}
	}

	for (let i = 0; i < maxRetries; i++) {
		try {
			const { code } = await discordSdk.commands.authorize({
				client_id: clientId,
				response_type: "code",
				state: "",
				prompt: "none",
				scope: ["identify", "guilds"],
			});

			const response = await fetch('/api/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});

			const data = await response.json();
			if (!data.access_token) {
				throw new Error(`Backend token exchange failed. Discord API said: ${JSON.stringify(data)}`);
			}

			try {
				localStorage.setItem('discord_access_token', data.access_token);
			} catch (e) {
				// Browser blocked storage, ignore
			}

			return await discordSdk.commands.authenticate({ access_token: data.access_token });
		} catch (err) {
			console.warn(`Discord SDK Auth attempt ${i + 1} stumbled:`, err);
			if (i === maxRetries - 1) throw err;
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	}
}

async function setupDiscord() {
	try {
		const configRes = await fetch('/api/config');
		const { clientId } = await configRes.json();

		discordSdk = new DiscordSDK(clientId);
		await discordSdk.ready();

		await new Promise(resolve => setTimeout(resolve, 200));

		const authResult = await authenticateWithRetry(clientId);
		discordUser = authResult.user;

		window.DISCORD_USER_ID = discordUser.id;

		const today = new Date().toISOString().split('T')[0];
		const syncRes = await fetch(`/api/load-session?userId=${discordUser.id}&date=${today}`);

		if (syncRes.ok) {
			const syncData = await syncRes.json();
			window.LIRDLE_CLOUD_SAVE = syncData.session;

			if (!syncData.session) {
				try {
					localStorage.removeItem('saveableState');
					console.log("DB is empty for today. Local board wiped.");
				} catch (storageErr) {
					// Ignore browser security blocks
				}
			} else {
				try {
					if (syncData.session && syncData.session.guesses) {
						const guessesStr = typeof syncData.session.guesses === 'string'
							? syncData.session.guesses
							: JSON.stringify(syncData.session.guesses);
						localStorage.setItem('saveableState', guessesStr);
					}
					if (syncData.session && syncData.session.stats) {
						const statsStr = typeof syncData.session.stats === 'string'
							? syncData.session.stats
							: JSON.stringify(syncData.session.stats);
						localStorage.setItem('stats', statsStr);
					}
				} catch (storageErr) {
					console.warn("Browser blocked localStorage, relying purely on Memory Bypass.");
				}
			}
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