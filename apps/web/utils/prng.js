import { WORDS } from "../public/words.js";

function xmur3(str) {
	for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
		h = h << 13 | h >>> 19;
	} return function () {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return (h ^= h >>> 16) >>> 0;
	}
}

function mulberry32(a) {
	return function () {
		var t = a += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
}

/**
 * Generates a unique, non-repeating target word for a specific user.
 * @param {string} userSeed - The UUID seed from the database User model
 * @param {number} gamesPlayed - The number of games the user has completed
 * @returns {string} The target word
 */
export function getUniqueWordForUser(userSeed, gamesPlayed) {
	const seedGen = xmur3(userSeed);
	const rand = mulberry32(seedGen());
	const indices = Array.from({ length: WORDS.length }, (_, i) => i);

	for (let i = indices.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[indices[i], indices[j]] = [indices[j], indices[i]];
	}

	const safeIndex = gamesPlayed % WORDS.length;
	return WORDS[indices[safeIndex]];
}

export function evaluateTrueScore(targetWord, guess) {
	const target = Array.from(targetWord);
	const myGuess = Array.from(guess);
	const scores = [0, 0, 0, 0, 0];

	for (let i = 0; i < 5; i++) {
		if (myGuess[i] === target[i]) {
			scores[i] = 2;
			myGuess[i] = target[i] = '#';
		}
	}
	for (let i = 0; i < 5; i++) {
		if (myGuess[i] === '#') continue;
		let letterPosition = target.indexOf(myGuess[i]);
		if (letterPosition !== -1) {
			scores[i] = 1;
			target[letterPosition] = "#";
		}
	}
	return scores;
}