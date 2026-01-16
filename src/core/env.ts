/**
 * Environment variable handling with validation
 * API keys are never logged or exposed
 */

export interface EnvConfig {
  finnhubApiKey: string;
  enableLlm: boolean;
  llmProvider: 'openai' | 'anthropic' | null;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  nodeEnv: 'development' | 'production' | 'test';
}

function getEnvVar(name: string, required: boolean = false): string | undefined {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadEnvConfig(): EnvConfig {
  const finnhubApiKey = getEnvVar('FINNHUB_API_KEY', true)!;
  const enableLlm = getEnvVar('ENABLE_LLM') === 'true';
  const llmProviderRaw = getEnvVar('LLM_PROVIDER');
  const llmProvider = llmProviderRaw === 'openai' || llmProviderRaw === 'anthropic'
    ? llmProviderRaw
    : null;

  const logLevelRaw = getEnvVar('LOG_LEVEL') || 'info';
  const logLevel = ['debug', 'info', 'warn', 'error'].includes(logLevelRaw)
    ? (logLevelRaw as EnvConfig['logLevel'])
    : 'info';

  const nodeEnvRaw = process.env.NODE_ENV || 'development';
  const nodeEnv = ['development', 'production', 'test'].includes(nodeEnvRaw)
    ? (nodeEnvRaw as EnvConfig['nodeEnv'])
    : 'development';

  return {
    finnhubApiKey,
    enableLlm,
    llmProvider,
    openaiApiKey: enableLlm && llmProvider === 'openai'
      ? getEnvVar('OPENAI_API_KEY', true)!
      : null,
    anthropicApiKey: enableLlm && llmProvider === 'anthropic'
      ? getEnvVar('ANTHROPIC_API_KEY', true)!
      : null,
    logLevel,
    nodeEnv,
  };
}

let cachedConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = loadEnvConfig();
  }
  return cachedConfig;
}

export function resetEnvConfig(): void {
  cachedConfig = null;
}
