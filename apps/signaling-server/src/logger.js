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

