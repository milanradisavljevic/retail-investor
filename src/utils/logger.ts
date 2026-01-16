/**
 * Logging with Pino - API keys are redacted
 */

import pino from 'pino';

const redactPaths = [
  'apiKey',
  'api_key',
  'finnhubApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'authorization',
  'Authorization',
  'password',
  'secret',
  'token',
  '*.apiKey',
  '*.api_key',
  'headers.authorization',
  'headers.Authorization',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export function createChildLogger(name: string) {
  return logger.child({ module: name });
}
