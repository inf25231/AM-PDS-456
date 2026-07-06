function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) {
    return '';
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ' [meta-unserializable]';
  }
}

/**
 * Creates a scoped logger that prefixes every line with a timestamp and scope name.
 * Output format: [ISO-timestamp] [scope] [level] message {optional JSON meta}
 *
 * Levels:
 * - info   — general lifecycle events (startup, shutdown)
 * - warn   — recoverable issues (sync failures, missing rooms)
 * - error  — unhandled errors surfaced to the user
 * - action — audit trail for intentional state changes (room created, deleted, etc.)
 *
 * @param {string} scope - Label for the log source, e.g. 'signaling-server'
 * @returns {{ info, warn, error, action }}
 */
export function createActionLogger(scope) {
  function log(level, message, meta) {
    const timestamp = new Date().toISOString();
    const details = formatMeta(meta);
    console.log(`[${timestamp}] [${scope}] [${level}] ${message}${details}`);
  }

  return {
    info(message, meta) {
      log('info', message, meta);
    },
    warn(message, meta) {
      log('warn', message, meta);
    },
    error(message, meta) {
      log('error', message, meta);
    },
    action(actionName, meta) {
      log('action', actionName, meta);
    }
  };
}
