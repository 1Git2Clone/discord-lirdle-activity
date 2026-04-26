const logWithTime = process.env.LOG_WITH_TIME !== 'false';
const logTimezone = process.env.LOG_TIMEZONE || 'UTC';

/**
 * Format current time as YYYY-MM-DD HH:mm:ss.SSS in the configured timezone.
 * Uses Intl.DateTimeFormat with en-GB locale for zero-padded date parts.
 * Timezone defaults to UTC if LOG_TIMEZONE env var is not set.
 * @returns {string} Formatted timestamp string
 */
function timestamp() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: logTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  });

  const parts = formatter.formatToParts(now).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});

  return (
    `${parts.year}-${parts.month}-${parts.day} ` +
    `${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`
  );
}

const LEVELS = new Map([
  [console.error, { label: '[ERROR]', color: '\x1b[31m' }], // red
  [console.warn, { label: '[WARN]', color: '\x1b[33m' }], // yellow
  [console.log, { label: '[INFO]', color: '\x1b[34m' }], // blue
]);

/**
 * Global logging helper
 *
 * @param {Function} fn console.log / console.warn / console.error
 * @param {...any} args first arg is a string with tag already included (e.g. "[EVENT] Something"),
 *	               subsequent args can be error objects or other values
 */
export function clog(fn, ...args) {
  if (!args.length) return;

  const [first, ...rest] = args;
  const level = LEVELS.get(fn) || { label: '[INFO]', color: '\x1b[0m' };
  const prefix = logWithTime
    ? `${timestamp()} ${level.color}${level.label}\x1b[0m`
    : `${level.color}${level.label}\x1b[0m`;

  if (typeof first === 'string') {
    fn(`${prefix}${first}`, ...rest);
  } else {
    fn(prefix, first, ...rest);
  }
}
