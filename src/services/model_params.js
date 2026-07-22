import dotenv from 'dotenv';
dotenv.config();

const NUMBER_ALIASES = {
  temperature: ['OPENROUTER_TEMPERATURE', 'MODEL_TEMPERATURE'],
  top_k: ['OPENROUTER_TOP_K', 'MODEL_TOP_K'],
  top_p: ['OPENROUTER_TOP_P', 'MODEL_TOP_P'],
  max_tokens: ['OPENROUTER_MAX_TOKENS', 'MODEL_MAX_TOKENS'],
  presence_penalty: ['OPENROUTER_PRESENCE_PENALTY', 'MODEL_PRESENCE_PENALTY'],
  frequency_penalty: ['OPENROUTER_FREQUENCY_PENALTY', 'MODEL_FREQUENCY_PENALTY']
};

const DEFAULTS = {
  temperature: 0.7,
  top_p: 1,
  max_tokens: undefined,
  presence_penalty: undefined,
  frequency_penalty: undefined
};

function parseNumber(value, defaultValue = undefined) {
  if (value === undefined || value === null || value === '') return defaultValue;

  const parsed = Number(value);
  if (Number.isNaN(parsed)) return defaultValue;

  return parsed;
}

function parseInteger(value) {
  const parsed = parseNumber(value);
  if (parsed === undefined) return undefined;

  return Math.trunc(parsed);
}

function firstDefinedValue(names) {
  return names.map((name) => process.env[name]).find((value) => value !== undefined && value !== '');
}

function parseStringArray(value) {
  if (value === undefined || value === null || value === '') return undefined;

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function omitUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

export function getOpenRouterModelName() {
  return process.env.MODEL_NAME || 'google/gemini-2.5-flash-lite';
}

export function getOpenRouterVisionModelName() {
  return process.env.OPENROUTER_VISION_MODEL || 'google/gemini-2.5-flash';
}

export function getOpenRouterParams(extra = {}) {
  const params = { ...DEFAULTS };

  for (const [key, aliases] of Object.entries(NUMBER_ALIASES)) {
    const value = firstDefinedValue(aliases);
    if (value !== undefined) {
      params[key] = key === 'top_k' ? parseInteger(value) : parseNumber(value);
    }
  }

  const stop = parseStringArray(firstDefinedValue(['OPENROUTER_STOP', 'MODEL_STOP']));
  if (stop) params.stop = stop;

  return omitUndefined({ ...params, ...extra });
}

export function getOpenRouterParamsWithDefaultMaxTokens(defaultMaxTokens) {
  const params = getOpenRouterParams();
  params.max_tokens = params.max_tokens ?? defaultMaxTokens;
  return params;
}
