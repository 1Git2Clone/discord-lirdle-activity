// Copyright (C) 2023 Bovination Productions, MIT License

/**
 * @constructor
 * Stats tracking for player game history. Tracks finished and unfinished
 * games, total guesses, best/worst scores, and five-green fake-out events.
 */
export default function Stats() {}

Stats.prototype = {
  /**
   * Initialize or reinitialize stats from saved data.
   * Runs migration on old stat formats. Resets everything to zero
   * if the loaded stats indicate no games have been played.
   * @param {Object|null} currentStats - Previously saved stats object
   */
  initialize(currentStats) {
    let reinit = true;
    try {
      if (currentStats) {
        Object.assign(this, this.migrate(currentStats));
        reinit = this.totalFinishedGames === 0 && this.totalUnfinishedGames === 0;
      }
    } catch {
      // ignore
    }
    if (reinit) {
      this.totalFinishedGuesses = 0;
      this.totalFinishedGames = 0;
      this.lowestScore = 1000000;
      this.highestScore = -1;
      this.totalUnfinishedGuesses = 0;
      this.totalUnfinishedGames = 0;
      this.numFiveGreenFakeOuts = 0;
    }
  },
  /**
   * Migrate stats from older version formats to the current schema.
   * Handles v2 (legacy with .data wrapper) and v3 (current) formats.
   * Corrects known bugs where finished games exceeded total guesses.
   * @param {Object} oldStats - Stats object in any version format
   * @returns {Object} Migrated stats at the latest version
   */
  migrate(oldStats) {
    if ('data' in oldStats || 'totalGames' in oldStats) {
      oldStats = {
        version: 2,
        totalFinishedGames: oldStats.data.totalFinishedGames || 0,
        totalFinishedGuesses: oldStats.data['totalGuesses'] || 0,
        totalUnfinishedGames: oldStats.data.totalUnfinishedGames || 0,
        totalUnfinishedGuesses: oldStats.data.totalUnfinishedGuesses || 0,
        lowestScore: oldStats.data.lowestScore || 0,
        highestScore: oldStats.data.highestScore || 0,
        numFiveGreenFakeOuts: oldStats.data.numFiveGreenFakeOuts || 0,
      };
    }
    if (!('version' in oldStats)) {
      oldStats.version = 2;
    }
    if (oldStats.version === 2) {
      oldStats.version = 3;
      if (oldStats.totalFinishedGames > oldStats.totalFinishedGuesses) {
        // Got this wrong
        oldStats.totalFinishedGames = oldStats.totalFinishedGuesses = 0;
      }
      if (
        oldStats.totalUnfinishedGames > 0 &&
        (oldStats.totalUnfinishedGuesses * 1.0) / oldStats.totalUnfinishedGames <= 5.0
      ) {
        // Doesn't really make sense either
        oldStats.totalUnfinishedGames = oldStats.totalUnfinishedGuesses = 0;
      }
    }
    return oldStats;
  },
  /** @param {number} numGuesses - How many guesses the player took */
  addFinishedGame(numGuesses) {
    this.totalFinishedGuesses += numGuesses;
    this.totalFinishedGames += 1;
    if (this.lowestScore > numGuesses) {
      this.lowestScore = numGuesses;
    }
    if (this.highestScore < numGuesses) {
      this.highestScore = numGuesses;
    }
  },
  /** @param {number} numGuesses - How many guesses before stopping */
  addUnfinishedGame(numGuesses) {
    this.totalUnfinishedGuesses += numGuesses;
    this.totalUnfinishedGames += 1;
  },
  addFiveGreenFakeOut() {
    this.numFiveGreenFakeOuts += 1;
  },
  /**
   * Generate an HTML summary of all stats for display.
   * @returns {string} HTML string with stats lines joined by <br> tags
   */
  getStatsSummary() {
    const lines = ['<h3>Current Stats</h3>'];
    if (this.totalFinishedGames > 0) {
      lines.push(`Games finished: ${this.totalFinishedGames}`);
      lines.push(
        `Average #tries: ${this.round2(this.totalFinishedGuesses / this.totalFinishedGames)}`,
      );
      lines.push(`Fewest tries needed: ${this.lowestScore}`);
      lines.push(`Most tries needed: ${this.highestScore}`);
      if (this.numFiveGreenFakeOuts > 0) {
        lines.push(`Number of Five-Green Fake-Outs: ${this.numFiveGreenFakeOuts}`);
      }
    } else {
      lines.push(`No games finished yet`);
    }
    lines.push('<hr>');
    if (this.totalUnfinishedGames > 0) {
      lines.push(`Games you forgot to finish: ${this.totalUnfinishedGames}`);
      lines.push(
        `Average #tries before stopping: ${this.round2(this.totalUnfinishedGuesses / this.totalUnfinishedGames)}`,
      );
    } else {
      lines.push(`Congratulations! You've gotten them all so far!`);
    }
    lines.push('');
    lines.push('<hr>');
    lines.push('Stats are now from mid-July, 2023');
    return lines.join(' <br> \n');
  },
  /**
   * Round a number to 2 decimal places, unless it's already an integer.
   * @param {number} n - Number to round
   * @returns {number} Rounded value
   */
  round2(n) {
    return Math.floor(n) === n ? n : Math.round(n * 100) / 100;
  },
};
