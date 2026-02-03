export type AIProvider = "cerebras" | "groq" | "openai" | "anthropic";

export const ALL_PROVIDERS: AIProvider[] = [
  "cerebras",
  "groq",
  "openai",
  "anthropic",
];

export interface ProviderConfig {
  apiKey: string;
}

export interface AISettings {
  providers: Record<AIProvider, ProviderConfig>;
  selectedModel: string; // "provider:modelId"
}

export interface ModelOption {
  provider: AIProvider;
  id: string;
  label: string;
}

export const PROVIDER_META: Record<
  AIProvider,
  { label: string; placeholder: string }
> = {
  cerebras: { label: "Cerebras", placeholder: "csk-..." },
  groq: { label: "Groq", placeholder: "gsk_..." },
  openai: { label: "OpenAI", placeholder: "sk-..." },
  anthropic: { label: "Anthropic", placeholder: "sk-ant-..." },
};

export const BUILTIN_MODELS: Record<AIProvider, ModelOption[]> = {
  cerebras: [
    { provider: "cerebras", id: "llama3.1-8b", label: "Llama 3.1 8B" },
    { provider: "cerebras", id: "llama-3.3-70b", label: "Llama 3.3 70B" },
    { provider: "cerebras", id: "gpt-oss-120b", label: "GPT-OSS 120B" },
    { provider: "cerebras", id: "qwen-3-32b", label: "Qwen 3 32B" },
    {
      provider: "cerebras",
      id: "qwen-3-235b-a22b-instruct-2507",
      label: "Qwen 3 235B Instruct",
    },
    { provider: "cerebras", id: "zai-glm-4.7", label: "ZAI GLM 4.7" },
  ],
  groq: [
    { provider: "groq", id: "gemma2-9b-it", label: "Gemma 2 9B" },
    { provider: "groq", id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { provider: "groq", id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    {
      provider: "groq",
      id: "deepseek-r1-distill-llama-70b",
      label: "DeepSeek R1 Distill 70B",
    },
    {
      provider: "groq",
      id: "meta-llama/llama-4-maverick-17b-128e-instruct",
      label: "Llama 4 Maverick",
    },
    {
      provider: "groq",
      id: "meta-llama/llama-4-scout-17b-16e-instruct",
      label: "Llama 4 Scout",
    },
    {
      provider: "groq",
      id: "moonshotai/kimi-k2-instruct-0905",
      label: "Kimi K2 Instruct",
    },
    { provider: "groq", id: "qwen/qwen3-32b", label: "Qwen 3 32B" },
    { provider: "groq", id: "llama3-70b-8192", label: "Llama 3 70B" },
    { provider: "groq", id: "llama3-8b-8192", label: "Llama 3 8B" },
    { provider: "groq", id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { provider: "groq", id: "qwen-qwq-32b", label: "Qwen QwQ 32B" },
    { provider: "groq", id: "qwen-2.5-32b", label: "Qwen 2.5 32B" },
    {
      provider: "groq",
      id: "deepseek-r1-distill-qwen-32b",
      label: "DeepSeek R1 Distill Qwen 32B",
    },
    { provider: "groq", id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
    { provider: "groq", id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
  ],
  openai: [
    { provider: "openai", id: "gpt-5.2", label: "GPT-5.2" },
    { provider: "openai", id: "gpt-5.1", label: "GPT-5.1" },
    { provider: "openai", id: "gpt-5", label: "GPT-5" },
    { provider: "openai", id: "gpt-5-mini", label: "GPT-5 Mini" },
    { provider: "openai", id: "gpt-5-nano", label: "GPT-5 Nano" },
    { provider: "openai", id: "gpt-4.1", label: "GPT-4.1" },
    { provider: "openai", id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { provider: "openai", id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { provider: "openai", id: "gpt-4o", label: "GPT-4o" },
  ],
  anthropic: [
    { provider: "anthropic", id: "claude-opus-4-5", label: "Claude Opus 4.5" },
    {
      provider: "anthropic",
      id: "claude-sonnet-4-5",
      label: "Claude Sonnet 4.5",
    },
    {
      provider: "anthropic",
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
    },
    {
      provider: "anthropic",
      id: "claude-sonnet-4-0",
      label: "Claude Sonnet 4",
    },
  ],
};

export type KeysFormValues = {
  providers: Record<AIProvider, { apiKey: string }>;
};

const STORAGE_KEY = "autoscene-settings";

const DEFAULT_PROVIDER_CONFIG: ProviderConfig = { apiKey: "" };

const DEFAULT_SETTINGS: AISettings = {
  providers: {
    cerebras: { ...DEFAULT_PROVIDER_CONFIG },
    groq: { ...DEFAULT_PROVIDER_CONFIG },
    openai: { ...DEFAULT_PROVIDER_CONFIG },
    anthropic: { ...DEFAULT_PROVIDER_CONFIG },
  },
  selectedModel: "cerebras:llama-3.3-70b",
};

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Migrate legacy api key if present
      const legacyKey = localStorage.getItem("autoscene-api-key");
      if (legacyKey) {
        const migrated: AISettings = {
          ...DEFAULT_SETTINGS,
          providers: {
            ...DEFAULT_SETTINGS.providers,
            cerebras: { apiKey: legacyKey },
          },
        };
        saveSettings(migrated);
        return migrated;
      }
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return {
      providers: {
        cerebras: {
          ...DEFAULT_PROVIDER_CONFIG,
          ...parsed.providers?.cerebras,
        },
        groq: { ...DEFAULT_PROVIDER_CONFIG, ...parsed.providers?.groq },
        openai: { ...DEFAULT_PROVIDER_CONFIG, ...parsed.providers?.openai },
        anthropic: {
          ...DEFAULT_PROVIDER_CONFIG,
          ...parsed.providers?.anthropic,
        },
      },
      selectedModel: parsed.selectedModel ?? DEFAULT_SETTINGS.selectedModel,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Get all models available based on which providers have API keys configured. */
export function getAvailableModels(settings: AISettings): ModelOption[] {
  const models: ModelOption[] = [];
  for (const p of ALL_PROVIDERS) {
    if (settings.providers[p].apiKey) {
      models.push(...BUILTIN_MODELS[p]);
    }
  }
  return models;
}

/** Parse a compound "provider:model" key into its parts. */
export function parseModelKey(key: string): {
  provider: AIProvider;
  model: string;
} {
  const idx = key.indexOf(":");
  if (idx === -1) return { provider: "cerebras", model: key };
  return {
    provider: key.slice(0, idx) as AIProvider,
    model: key.slice(idx + 1),
  };
}

/** Build the headers for a chat request based on current settings. */
export function buildRequestHeaders(
  settings: AISettings,
): Record<string, string> {
  const { provider, model } = parseModelKey(settings.selectedModel);
  const config = settings.providers[provider];
  const h: Record<string, string> = {};
  h["x-provider"] = provider;
  h["x-model"] = model;
  if (config.apiKey) h["x-api-key"] = config.apiKey;
  return h;
}
