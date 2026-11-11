/**
 * Unified Multi-LLM Service
 * 
 * Supports:
 * - Groq (llama-3.3-70b-versatile, llama-3.2-3b-preview, qwen/qwen3.6-27b, openai/gpt-oss-120b, etc.)
 * - OpenAI (gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo, etc.)
 * - Claude / Anthropic (claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-3-opus-20240229)
 * - Gemini / Google (gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash, gemini-2.5-flash)
 * - Mistral AI (mistral-large-latest, mistral-small-latest, codestral-latest)
 * 
 * Features:
 * - Dynamic configuration via environment variables or runtime overrides
 * - Automatic Fallback on rate limit (429, 8k token limits, TPM limits), timeouts, or errors
 * - Document reranking, summarization, and question answering
 * - Connection testing for all providers
 */

import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Provider Presets & Default Models
export const PROVIDER_PRESETS = {
  groq: {
    name: 'Groq AI',
    defaultModel: 'openai/gpt-oss-120b',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B (High Capability / Default)' },
      { id: 'qwen/qwen3.6-27b', name: 'Qwen 3.6 27B (Fast & Accurate)' },
      { id: 'openai/gpt-oss-20b', name: 'OpenAI GPT-OSS 20B (Ultra Fast / Lightweight)' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (8k Fast)' },
      { id: 'allam-2-7b', name: 'ALLaM 2 7B' },
      { id: 'groq/compound', name: 'Groq Compound' },
      { id: 'groq/compound-mini', name: 'Groq Compound Mini' }
    ],
    keyEnv: 'GROQ_API_KEY',
    requiresKey: true
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cost Efficient)' },
      { id: 'gpt-4o', name: 'GPT-4o (High Intelligence / Multimodal)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ],
    keyEnv: 'OPENAI_API_KEY',
    requiresKey: true
  },
  claude: {
    name: 'Anthropic Claude',
    defaultModel: 'claude-3-5-haiku-20241022',
    models: [
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fast & Precise)' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (State of the Art QA)' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Deep Reasoning)' }
    ],
    keyEnv: 'ANTHROPIC_API_KEY',
    requiresKey: true
  },
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-1.5-flash',
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Ultra Fast & Generous Limits)' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Large 2M Context)' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next Gen)' }
    ],
    keyEnv: 'GEMINI_API_KEY',
    requiresKey: true
  },
  mistral: {
    name: 'Mistral AI',
    defaultModel: 'mistral-small-latest',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small (Fast & Efficient)' },
      { id: 'mistral-large-latest', name: 'Mistral Large (High Capability)' },
      { id: 'codestral-latest', name: 'Codestral (Code & Test Generation)' }
    ],
    keyEnv: 'MISTRAL_API_KEY',
    requiresKey: true
  },
  nvidia: {
    name: 'NVIDIA NIM / Integrate API',
    defaultModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [
      { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', name: 'NVIDIA Nemotron 3.5 Lightning 30B (Primary: Fast RAG & Reasoning)' },
      { id: 'meta/llama-3.3-70b-instruct', name: 'Meta Llama 3.3 70B Instruct (Fallback 1: Stable General-Purpose)' },
      { id: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'NVIDIA Nemotron 3 Ultra 550B (Fallback 2: Deep Reasoning)' }
    ],
    keyEnv: 'NVIDIA_API_KEY',
    requiresKey: true
  }
};

/**
 * Get active configuration from environment variables
 */
export function getLLMConfig() {
  try {
    dotenv.config({ override: true });
  } catch (e) {}

  const provider = (process.env.LLM_PROVIDER || process.env.GENERATION_PROVIDER || 'groq').toLowerCase().trim();
  const model = process.env.LLM_MODEL || process.env.GENERATION_MODEL || PROVIDER_PRESETS[provider]?.defaultModel || 'openai/gpt-oss-120b';

  const rerankProvider = (process.env.RERANK_PROVIDER || process.env.LLM_PROVIDER || 'groq').toLowerCase().trim();
  const rerankModel = process.env.RERANK_MODEL || process.env.GROQ_RERANK_MODEL || PROVIDER_PRESETS[rerankProvider]?.defaultModel || 'openai/gpt-oss-120b';

  const summarizationProvider = (process.env.SUMMARIZATION_PROVIDER || process.env.LLM_PROVIDER || 'groq').toLowerCase().trim();
  const summarizationModel = process.env.SUMMARIZATION_MODEL || process.env.GROQ_SUMMARIZATION_MODEL || PROVIDER_PRESETS[summarizationProvider]?.defaultModel || 'openai/gpt-oss-120b';

  const enableFallback = process.env.ENABLE_FALLBACK === 'true' || process.env.ENABLE_FALLBACK === true;
  const fallbackProvider = (process.env.FALLBACK_LLM_PROVIDER || (provider === 'nvidia' ? 'nvidia' : 'mistral')).toLowerCase().trim();
  const fallbackModel = process.env.FALLBACK_LLM_MODEL || (provider === 'nvidia' ? 'nvidia/nemotron-3-super-120b-a12b' : (PROVIDER_PRESETS[fallbackProvider]?.defaultModel || 'mistral-small-latest'));

  // 2nd Tier Fallback Configuration
  const fallbackProvider2 = (process.env.FALLBACK_LLM_PROVIDER_2 || (provider === 'nvidia' ? 'nvidia' : '')).toLowerCase().trim();
  const fallbackModel2 = process.env.FALLBACK_LLM_MODEL_2 || (provider === 'nvidia' ? 'nvidia/nemotron-3-ultra-550b-a55b' : '');

  const enableTokenOptimization = process.env.ENABLE_TOKEN_OPTIMIZATION !== 'false';
  const maxTotalTokens = parseInt(process.env.MAX_TOTAL_TOKENS || '8000', 10);
  const maxGenerationTokens = parseInt(process.env.MAX_GENERATION_TOKENS || '3000', 10);
  const maxSummaryTokens = parseInt(process.env.MAX_SUMMARY_TOKENS || '400', 10);

  return {
    provider,
    model,
    generation: { provider, model },
    rerank: { provider: rerankProvider, model: rerankModel },
    summarization: { provider: summarizationProvider, model: summarizationModel },
    enableFallback,
    fallbackProvider,
    fallbackModel,
    fallbackProvider2,
    fallbackModel2,
    enableTokenOptimization,
    maxTotalTokens,
    maxGenerationTokens,
    maxSummaryTokens,
    tokenOptimization: {
      enabled: enableTokenOptimization,
      maxTotalTokens,
      maxGenerationTokens,
      maxSummaryTokens
    },
    groqApiKey: process.env.GROQ_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    mistralApiKey: process.env.MISTRAL_API_KEY,
    nvidiaApiKey: process.env.NVIDIA_API_KEY,
    nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'
  };
}

/**
 * Get the API key for a specific provider
 */
export function getApiKeyForProvider(provider, config = null) {
  const cfg = config || getLLMConfig();
  switch (provider.toLowerCase()) {
    case 'groq':
      return cfg.groqApiKey || process.env.GROQ_API_KEY;
    case 'openai':
      return cfg.openaiApiKey || process.env.OPENAI_API_KEY;
    case 'claude':
    case 'anthropic':
      return cfg.anthropicApiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    case 'gemini':
    case 'google':
      return cfg.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    case 'mistral':
      return cfg.mistralApiKey || process.env.MISTRAL_API_KEY;
    case 'nvidia':
      return cfg.nvidiaApiKey || process.env.NVIDIA_API_KEY;
    default:
      return null;
  }
}

/**
 * Check if an error is a rate limit or resource exhaustion error
 */
export function isRateLimitOrRecoverableError(error) {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  const status = error.status || error.statusCode || error.response?.status;
  const code = (error.code || error.cause?.code || '').toLowerCase();

  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 500) {
    return true;
  }

  const rateLimitKeywords = [
    'rate limit',
    'rate_limit_exceeded',
    'tokens per minute',
    'requests per minute',
    'tpm',
    'rpm',
    'quota',
    'resource exhausted',
    'overloaded',
    'capacity',
    'token limit',
    'context length exceeded',
    'maximum context length',
    'context_length_exceeded',
    'model_not_found',
    '8000',
    '8192',
    'timeout',
    'timed out',
    'connection error',
    'econnreset',
    'etimedout',
    'esockettimedout',
    'socket hang up',
    'fetch failed',
    'network error'
  ];

  return rateLimitKeywords.some(kw => message.includes(kw) || code.includes(kw));
}

/**
 * Internal helper to execute a single LLM chat completion on a specific provider
 */
async function executeProviderCall({
  provider,
  model,
  messages,
  systemPrompt,
  temperature = 0.2,
  maxTokens = 3000,
  apiKeyOverride = null,
  baseUrlOverride = null
}) {
  const p = (provider || 'groq').toLowerCase().trim();
  const apiKey = apiKeyOverride || getApiKeyForProvider(p);

  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error(`API key for provider '${p}' is not configured. Please set ${PROVIDER_PRESETS[p]?.keyEnv || p.toUpperCase() + '_API_KEY'} in Settings.`);
  }

  // Format messages if systemPrompt was given separately
  let formattedMessages = [];
  if (messages && messages.length > 0) {
    formattedMessages = [...messages];
  } else if (systemPrompt) {
    formattedMessages = [{ role: 'system', content: systemPrompt }];
  }

  const mName = model || PROVIDER_PRESETS[p]?.defaultModel || 'openai/gpt-oss-120b';
  const cfg = getLLMConfig();

  // Estimate prompt tokens (~3.8 characters per token average in JSON / English)
  const promptCharCount = formattedMessages.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
  const estimatedPromptTokens = Math.ceil(promptCharCount / 3.8);

  // Safe Token Budget Clamping
  let safeMaxTokens = maxTokens;
  const isTokenOptimizationActive = cfg.enableTokenOptimization;
  const tokenBudgetCap = cfg.maxTotalTokens || 8000;

  if (p === 'groq' || isTokenOptimizationActive) {
    // Determine context ceiling (Groq context cap is 8192 for most models; other models respect user budget ceiling)
    const contextCeiling = p === 'groq' ? Math.min(tokenBudgetCap, 8192) : tokenBudgetCap;
    const availableRemainingTokens = Math.max(400, contextCeiling - estimatedPromptTokens - 150);
    safeMaxTokens = Math.min(maxTokens, availableRemainingTokens);
  }

  switch (p) {
    case 'groq': {
      const groqClient = new Groq({
        apiKey,
        baseURL: baseUrlOverride || undefined
      });

      const response = await groqClient.chat.completions.create({
        messages: formattedMessages,
        model: mName,
        temperature,
        max_tokens: safeMaxTokens
      });

      const content = response.choices[0]?.message?.content || '';
      return {
        content,
        provider: 'groq',
        model: mName,
        usage: {
          promptTokens: response.usage?.prompt_tokens || estimatedPromptTokens,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || (estimatedPromptTokens + (response.usage?.completion_tokens || 0))
        },
        raw: response
      };
    }

    case 'openai': {
      const openaiClient = new OpenAI({
        apiKey,
        baseURL: baseUrlOverride || undefined
      });

      const response = await openaiClient.chat.completions.create({
        messages: formattedMessages,
        model: mName,
        temperature,
        max_tokens: maxTokens
      });

      const content = response.choices[0]?.message?.content || '';
      return {
        content,
        provider: 'openai',
        model: mName,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        },
        raw: response
      };
    }

    case 'claude':
    case 'anthropic': {
      const anthropic = new Anthropic({
        apiKey,
        baseURL: baseUrlOverride || undefined
      });

      // Separate system messages for Anthropic
      const systemMsgs = formattedMessages.filter(m => m.role === 'system');
      const nonSystemMsgs = formattedMessages.filter(m => m.role !== 'system');
      const systemText = systemMsgs.map(m => m.content).join('\n\n') || undefined;

      const response = await anthropic.messages.create({
        model: mName,
        system: systemText,
        messages: nonSystemMsgs.length > 0 ? nonSystemMsgs : [{ role: 'user', content: 'Hi' }],
        max_tokens: Math.min(maxTokens, 4096),
        temperature
      });

      const content = response.content.map(c => c.text || '').join('\n');
      return {
        content,
        provider: 'claude',
        model: mName,
        usage: {
          promptTokens: response.usage?.input_tokens || 0,
          completionTokens: response.usage?.output_tokens || 0,
          totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        },
        raw: response
      };
    }

    case 'gemini':
    case 'google': {
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Extract system instructions and convert messages to Gemini history
      const systemMsgs = formattedMessages.filter(m => m.role === 'system');
      const systemInstruction = systemMsgs.map(m => m.content).join('\n\n') || undefined;
      const userAndModelMsgs = formattedMessages.filter(m => m.role !== 'system');

      const modelInstance = genAI.getGenerativeModel({
        model: mName,
        systemInstruction
      });

      // Construct prompt or multi-turn content
      if (userAndModelMsgs.length === 1 && userAndModelMsgs[0].role === 'user') {
        const textContent = userAndModelMsgs[0].content;
        const result = await modelInstance.generateContent({
          contents: [{ role: 'user', parts: [{ text: textContent }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens
          }
        });
        const response = await result.response;
        const content = response.text();
        const usageMetadata = response.usageMetadata;

        return {
          content,
          provider: 'gemini',
          model: mName,
          usage: {
            promptTokens: usageMetadata?.promptTokenCount || Math.ceil(textContent.length / 4),
            completionTokens: usageMetadata?.candidatesTokenCount || Math.ceil(content.length / 4),
            totalTokens: usageMetadata?.totalTokenCount || (Math.ceil(textContent.length / 4) + Math.ceil(content.length / 4))
          },
          raw: response
        };
      } else {
        // Multi-message conversation
        const contents = userAndModelMsgs.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

        const result = await modelInstance.generateContent({
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens
          }
        });
        const response = await result.response;
        const content = response.text();
        const usageMetadata = response.usageMetadata;

        return {
          content,
          provider: 'gemini',
          model: mName,
          usage: {
            promptTokens: usageMetadata?.promptTokenCount || 0,
            completionTokens: usageMetadata?.candidatesTokenCount || 0,
            totalTokens: usageMetadata?.totalTokenCount || 0
          },
          raw: response
        };
      }
    }

    case 'mistral': {
      const mistralUrl = baseUrlOverride || 'https://api.mistral.ai/v1';
      const response = await axios.post(
        `${mistralUrl}/chat/completions`,
        {
          model: mName,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 60000
        }
      );

      const content = response.data?.choices?.[0]?.message?.content || '';
      return {
        content,
        provider: 'mistral',
        model: mName,
        usage: {
          promptTokens: response.data?.usage?.prompt_tokens || 0,
          completionTokens: response.data?.usage?.completion_tokens || 0,
          totalTokens: response.data?.usage?.total_tokens || 0
        },
        raw: response.data
      };
    }

    case 'nvidia': {
      const nvidiaClient = new OpenAI({
        apiKey,
        baseURL: baseUrlOverride || cfg.nvidiaBaseUrl || 'https://integrate.api.nvidia.com/v1',
        timeout: 120000,
        maxRetries: 1
      });

      // NVIDIA NIM buffers complete responses in its edge proxy before transmission.
      // Requesting 4000-8000 tokens causes the proxy to buffer beyond its idle window, triggering ECONNRESET.
      // Clamping to a safe limit of 2500 output tokens ensures fast completion in ~20-30s.
      const nvidiaSafeTokens = Math.min(Math.max(safeMaxTokens, 1200), 2500);

      const response = await nvidiaClient.chat.completions.create({
        messages: formattedMessages,
        model: mName,
        temperature,
        max_tokens: nvidiaSafeTokens
      });

      const choice = response.choices[0];
      const message = choice?.message;
      let content = message?.content || '';
      if (!content && message?.reasoning_content) {
        content = message.reasoning_content;
      }

      return {
        content,
        provider: 'nvidia',
        model: mName,
        usage: {
          promptTokens: response.usage?.prompt_tokens || estimatedPromptTokens,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || (estimatedPromptTokens + (response.usage?.completion_tokens || 0))
        },
        raw: response
      };
    }

    default:
      throw new Error(`Unsupported LLM provider: '${p}'. Supported: groq, openai, claude, gemini, mistral, nvidia`);
  }
}

/**
 * Main Chat Completion function with automatic fallback failover
 */
export async function chatCompletion(arg1 = {}, options = {}) {
  let opts = {};
  if (Array.isArray(arg1)) {
    opts = { ...options, messages: arg1 };
  } else if (typeof arg1 === 'string') {
    opts = { ...options, prompt: arg1 };
  } else {
    opts = { ...arg1, ...options };
  }

  const {
    messages = [],
    prompt = null,
    systemPrompt = null,
    temperature = 0.2,
    maxTokens = 4000,
    provider = null,
    model = null,
    baseUrl = null,
    apiKey = null,
    enableFallbackOverride = null
  } = opts;

  const config = getLLMConfig();
  const primaryProvider = (provider || config.provider).toLowerCase();
  const primaryModel = model || (provider ? PROVIDER_PRESETS[provider]?.defaultModel : config.model);
  const primaryBaseUrl = baseUrl || (provider ? null : config.baseUrl);
  const isFallbackEnabled = enableFallbackOverride !== null ? enableFallbackOverride : config.enableFallback;

  // Build messages array
  let requestMessages = [];
  if (messages && messages.length > 0) {
    requestMessages = [...messages];
    if (systemPrompt && !requestMessages.some(m => m.role === 'system')) {
      requestMessages.unshift({ role: 'system', content: systemPrompt });
    }
  } else if (prompt) {
    if (systemPrompt) {
      requestMessages.push({ role: 'system', content: systemPrompt });
    }
    requestMessages.push({ role: 'user', content: prompt });
  }

  const startTime = Date.now();
  console.log(`\n================================================================`);
  console.log(`🤖 [LLM INVOCATION] Provider: [${primaryProvider.toUpperCase()}] | Model: [${primaryModel}]`);
  if (prompt) console.log(`📥 Prompt: "${prompt.substring(0, 120)}${prompt.length > 120 ? '...' : ''}"`);
  console.log(`================================================================`);

  try {
    const result = await executeProviderCall({
      provider: primaryProvider,
      model: primaryModel,
      messages: requestMessages,
      systemPrompt,
      temperature,
      maxTokens,
      apiKeyOverride: apiKey,
      baseUrlOverride: primaryBaseUrl
    });

    const duration = Date.now() - startTime;
    console.log(`✅ [LLM COMPLETED] Provider: [${primaryProvider.toUpperCase()}] | Time: ${duration}ms | Tokens: ${result.usage?.totalTokens || 0}\n`);

    const usageObj = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    return {
      ...result,
      tokens: {
        prompt: usageObj.promptTokens,
        completion: usageObj.completionTokens,
        total: usageObj.totalTokens
      },
      fallbackUsed: false,
      primaryProvider,
      primaryModel
    };
  } catch (primaryError) {
    console.error(`⚠️ Primary LLM [${primaryProvider}] failed:`, primaryError.message);

    // Check if fallback is eligible
    if (isFallbackEnabled) {
      // Build candidate fallback tiers
      const fallbackTiers = [];

      // Tier 1: config.fallbackProvider & config.fallbackModel
      const tier1Provider = (config.fallbackProvider || (primaryProvider === 'nvidia' ? 'nvidia' : (primaryProvider === 'groq' ? 'gemini' : 'groq'))).toLowerCase().trim();
      const tier1Model = config.fallbackModel || (tier1Provider === 'nvidia' ? 'nvidia/nemotron-3-ultra-550b-a55b' : (PROVIDER_PRESETS[tier1Provider]?.defaultModel || 'mistral-small-latest'));
      
      if (tier1Provider !== primaryProvider || tier1Model !== primaryModel) {
        fallbackTiers.push({
          tier: 1,
          name: 'Fallback Tier 1',
          provider: tier1Provider,
          model: tier1Model,
          baseUrl: config.fallbackBaseUrl
        });
      }

      // Tier 2: config.fallbackProvider2 & config.fallbackModel2
      const tier2Provider = (config.fallbackProvider2 || (primaryProvider === 'nvidia' ? 'nvidia' : '')).toLowerCase().trim();
      const tier2Model = config.fallbackModel2 || (tier2Provider === 'nvidia' ? 'nvidia/nemotron-3-ultra-550b-a55b' : '');

      if (tier2Provider && tier2Model) {
        const isDuplicateOfPrimary = tier2Provider === primaryProvider && tier2Model === primaryModel;
        const isDuplicateOfTier1 = fallbackTiers.some(t => t.provider === tier2Provider && t.model === tier2Model);
        if (!isDuplicateOfPrimary && !isDuplicateOfTier1) {
          fallbackTiers.push({
            tier: 2,
            name: 'Fallback Tier 2',
            provider: tier2Provider,
            model: tier2Model,
            baseUrl: config.fallbackBaseUrl2 || config.fallbackBaseUrl
          });
        }
      }

      const fallbackErrors = [];

      for (const target of fallbackTiers) {
        console.warn(`\n================================================================`);
        console.warn(`⚠️ [AUTOMATIC FALLBACK TRIGGERED - ${target.name.toUpperCase()}]`);
        console.warn(`🔴 Failed Tier: [${(fallbackErrors.length === 0 ? primaryProvider : fallbackErrors[fallbackErrors.length - 1].provider).toUpperCase()}]`);
        console.warn(`   Reason: ${(fallbackErrors.length === 0 ? primaryError.message : fallbackErrors[fallbackErrors.length - 1].error).substring(0, 150)}`);
        console.warn(`🔄 Auto-Failover to: [${target.provider.toUpperCase()}] | Model: [${target.model}]`);
        console.warn(`================================================================\n`);

        try {
          const fallbackStartTime = Date.now();
          const fallbackResult = await executeProviderCall({
            provider: target.provider,
            model: target.model,
            messages: requestMessages,
            systemPrompt,
            temperature,
            maxTokens,
            baseUrlOverride: target.baseUrl
          });

          const fallbackDuration = Date.now() - fallbackStartTime;
          console.log(`✅ [${target.name.toUpperCase()} COMPLETED] Provider: [${target.provider.toUpperCase()}] | Time: ${fallbackDuration}ms | Tokens: ${fallbackResult.usage?.totalTokens || 0}\n`);

          const fbUsage = fallbackResult.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

          return {
            ...fallbackResult,
            tokens: {
              prompt: fbUsage.promptTokens,
              completion: fbUsage.completionTokens,
              total: fbUsage.totalTokens
            },
            fallbackUsed: true,
            fallbackTier: target.tier,
            primaryError: primaryError.message,
            primaryProvider,
            primaryModel,
            fallbackProvider: target.provider,
            fallbackModel: target.model,
            fallbackChain: [
              { tier: 0, provider: primaryProvider, model: primaryModel, error: primaryError.message },
              ...fallbackErrors,
              { tier: target.tier, provider: target.provider, model: target.model, status: 'success' }
            ]
          };
        } catch (fallbackError) {
          console.error(`❌ ${target.name} [${target.provider}: ${target.model}] failed:`, fallbackError.message);
          fallbackErrors.push({
            tier: target.tier,
            provider: target.provider,
            model: target.model,
            error: fallbackError.message
          });
        }
      }

      if (fallbackTiers.length > 0) {
        const errorSummary = [
          `Primary [${primaryProvider}: ${primaryModel} - ${primaryError.message}]`,
          ...fallbackErrors.map(e => `Tier ${e.tier} [${e.provider}: ${e.model} - ${e.error}]`)
        ].join('; ');
        throw new Error(`All LLM tiers failed. ${errorSummary}`);
      }
    }

    // Re-throw if fallback was disabled or not applicable
    throw primaryError;
  }
}

/**
 * Test Connection for a given provider and API key
 */
export async function testLLMConnection({
  provider,
  apiKey,
  model = null,
  baseUrl = null
}) {
  const p = (provider || 'groq').toLowerCase();
  const testModel = model || PROVIDER_PRESETS[p]?.defaultModel;

  try {
    const startTime = Date.now();
    const result = await executeProviderCall({
      provider: p,
      model: testModel,
      messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
      temperature: 0.1,
      maxTokens: 10,
      apiKeyOverride: apiKey,
      baseUrlOverride: baseUrl
    });
    const elapsed = Date.now() - startTime;

    return {
      success: true,
      provider: p,
      model: testModel,
      response: result.content.trim(),
      latencyMs: elapsed,
      message: `Connection successful to ${PROVIDER_PRESETS[p]?.name || p} (${elapsed}ms)`
    };
  } catch (error) {
    return {
      success: false,
      provider: p,
      model: testModel,
      error: error.message || 'Connection failed',
      message: `Failed to connect to ${PROVIDER_PRESETS[p]?.name || p}: ${error.message}`
    };
  }
}

/**
 * Parse LLM Reranking response cleanly
 */
export function parseRerankResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];

  // 1. Strip reasoning traces and markdown code blocks
  let cleaned = responseText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // If reasoning model output contains an "Output:" marker, slice from it
  const outputIdx = cleaned.lastIndexOf('Output:');
  if (outputIdx !== -1) {
    const candidateJson = cleaned.substring(outputIdx + 7).trim();
    if (candidateJson.includes('{') || candidateJson.includes('[')) {
      cleaned = candidateJson;
    }
  }

  // 2. Try standard JSON.parse
  try {
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const list = parsed.rankings || parsed.scores || parsed.results || (Array.isArray(parsed) ? parsed : null);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (e) {
    // Continue to regex extraction
  }

  // 3. Fallback Regex Extraction (index then score)
  const scores = [];
  const regex = /\{[^{}]*?(?:index|docIndex|id)[\"':\s]+(\d+)[^{}]*?(?:score|relevance|relevanceScore)[\"':\s]+(\d+(?:\.\d+)?)[^{}]*?\}/gi;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    scores.push({
      index: parseInt(match[1], 10),
      score: parseFloat(match[2])
    });
  }

  if (scores.length > 0) return scores;

  // Alternate regex (score then index)
  const regexAlt = /\{[^{}]*?(?:score|relevance|relevanceScore)[\"':\s]+(\d+(?:\.\d+)?)[^{}]*?(?:index|docIndex|id)[\"':\s]+(\d+)[^{}]*?\}/gi;
  while ((match = regexAlt.exec(cleaned)) !== null) {
    scores.push({
      index: parseInt(match[2], 10),
      score: parseFloat(match[1])
    });
  }

  return scores;
}

/**
 * Compute fallback lexical/semantic relevance score if LLM fails
 */
function computeFallbackRerankScores(query, documents) {
  const queryWords = (query || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  const qSet = new Set(queryWords);

  return documents.map((doc, idx) => {
    const title = (doc.title || doc.testCaseTitle || doc.userStoryTitle || doc.name || '').toLowerCase();
    const desc = (doc.description || doc.testCaseDescription || doc.userStoryDescription || '').toLowerCase();
    const full = `${title} ${desc}`;

    let titleMatches = 0;
    let fullMatches = 0;
    qSet.forEach(w => {
      if (title.includes(w)) titleMatches++;
      if (full.includes(w)) fullMatches++;
    });

    const titleScore = qSet.size > 0 ? (titleMatches / qSet.size) : 0.5;
    const fullScore = qSet.size > 0 ? (fullMatches / qSet.size) : 0.5;
    const baseScore = doc.score || doc.vectorScore || doc.bm25Score || 0.5;

    const blended = (0.5 * titleScore) + (0.3 * fullScore) + (0.2 * Math.min(1, baseScore));
    const scoreVal = Math.min(Math.max(parseFloat(blended.toFixed(4)), 0.05), 0.99);

    return {
      ...doc,
      rerankScore: scoreVal,
      originalRank: doc.originalRank || idx + 1,
      newRank: idx + 1,
      rerankModel: 'Lexical-Semantic Fallback',
      rerankProvider: 'local-hybrid',
      fallbackUsed: true
    };
  }).sort((a, b) => b.rerankScore - a.rerankScore).map((d, i) => ({ ...d, newRank: i + 1 }));
}

/**
 * Semantic document reranking with multi-provider + fallback support
 */
export async function rerankDocuments(query, documents, topK = 10, options = {}) {
  try {
    if (!documents || documents.length === 0) {
      return [];
    }

    const cfg = getLLMConfig();
    const rerankProvider = (options.provider || cfg.rerank.provider || 'groq').toLowerCase().trim();
    let rerankModel = options.model || cfg.rerank.model || PROVIDER_PRESETS[rerankProvider]?.defaultModel || 'openai/gpt-oss-120b';

    // For Groq reranking, ensure non-reasoning direct JSON model
    if (rerankProvider === 'groq' && (rerankModel.includes('qwen') || rerankModel.includes('deepseek') || rerankModel.includes('llama-3.3-70b'))) {
      rerankModel = 'openai/gpt-oss-120b';
    }

    const maxCandidates = Math.min(documents.length, options.rerankTopK || 50);
    const candidatesToScore = documents.slice(0, maxCandidates);

    console.log(`\n================================================================`);
    console.log(`🔄 [SEMANTIC RERANKING]`);
    console.log(`🏷️ Provider: [${rerankProvider.toUpperCase()}] | Model: [${rerankModel}]`);
    console.log(`🔍 Query: "${query}" | Candidate Pool: ${documents.length} | Scoring: ${candidatesToScore.length}`);
    console.log(`================================================================`);

    const BATCH_SIZE = 25;
    const scoredMap = new Map();
    let lastCompletion = null;

    const batches = [];
    for (let bStart = 0; bStart < candidatesToScore.length; bStart += BATCH_SIZE) {
      batches.push({
        bStart,
        batchDocs: candidatesToScore.slice(bStart, bStart + BATCH_SIZE)
      });
    }

    // Score batches concurrently to optimize latency
    await Promise.all(batches.map(async ({ bStart, batchDocs }) => {
      const docTexts = batchDocs.map((doc, localIdx) => {
        const text = formatDocumentForRerank(doc);
        return `[${localIdx}] ${text}`;
      }).join('\n\n');

      const prompt = `You are an expert search relevance evaluator. You must evaluate and assign a relevance score (0-100) to EVERY SINGLE document listed below based on how well it satisfies the search query.

CRITICAL INSTRUCTIONS:
1. You MUST assign a score (0-100) for EVERY document from index 0 to index ${batchDocs.length - 1}.
2. There are exactly ${batchDocs.length} documents. Your "rankings" array MUST contain exactly ${batchDocs.length} elements. Do NOT stop early.
3. Scoring criteria:
   - 85-100: Highly relevant, direct match to query purpose, workflows, or actions.
   - 55-84: Partially relevant, related module/domain or peripheral match.
   - 0-54: Weak match, different domain or irrelevant.
4. Differentiate scores carefully so the most relevant documents stand out.
5. Return ONLY a valid JSON object:
{"rankings": [{"index": 0, "score": 85}, {"index": 1, "score": 92}]}
Include all ${batchDocs.length} documents. Sort by score highest first.

Query: "${query}"

Documents to score (${batchDocs.length} total):
${docTexts}`;

      const systemPrompt = `You are a JSON-only search reranker. Return ONLY a valid JSON object with the "rankings" array containing scores for all ${batchDocs.length} documents. No markdown, no conversational text.`;

      try {
        const completion = await chatCompletion({
          provider: rerankProvider,
          model: rerankModel,
          systemPrompt,
          prompt,
          temperature: 0.0,
          maxTokens: 3000
        });
        lastCompletion = completion;

        const scores = parseRerankResponse(completion?.content || '');
        if (Array.isArray(scores)) {
          scores.forEach(item => {
            if (!item) return;
            const localIdx = typeof item.index === 'number' ? item.index : parseInt(item.index ?? item.docIndex ?? item.id, 10);
            const scoreVal = typeof item.score === 'number' ? item.score : parseFloat(item.score ?? item.relevance ?? item.relevanceScore ?? 50);
            if (!isNaN(localIdx) && localIdx >= 0 && localIdx < batchDocs.length) {
              const globalIdx = bStart + localIdx;
              scoredMap.set(globalIdx, isNaN(scoreVal) ? 50 : scoreVal);
            }
          });
        }
      } catch (batchErr) {
        console.warn(`⚠️ Batch scoring error [${bStart}..${bStart + batchDocs.length}]:`, batchErr.message);
      }
    }));

    if (scoredMap.size === 0) {
      console.warn('⚠️ No LLM scores obtained, applying intelligent fallback');
      return computeFallbackRerankScores(query, candidatesToScore).slice(0, topK);
    }

    const rerankedDocs = candidatesToScore.map((doc, idx) => {
      let rerankScore;
      if (scoredMap.has(idx)) {
        rerankScore = Math.min(Math.max(scoredMap.get(idx) / 100, 0.01), 1.0);
      } else {
        const base = doc.score || doc.fusedScore || doc.vectorScore || 0.4;
        rerankScore = parseFloat((Math.min(base * 0.8, 0.65)).toFixed(4));
      }

      return {
        ...doc,
        rerankScore,
        originalRank: doc.originalRank || (idx + 1),
        rerankModel: lastCompletion?.model || rerankModel,
        rerankProvider: lastCompletion?.provider || rerankProvider,
        fallbackUsed: lastCompletion?.fallbackUsed || false
      };
    });

    // Sort by rerankScore descending
    rerankedDocs.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));

    // Assign newRank and return topK
    const finalReranked = rerankedDocs.map((doc, rankIdx) => ({
      ...doc,
      newRank: rankIdx + 1
    })).slice(0, topK);

    console.log(`✅ [SEMANTIC RERANKING COMPLETED] Top-${finalReranked.length} documents scored & re-ordered successfully (Scored: ${scoredMap.size}/${candidatesToScore.length})\n`);
    return finalReranked;
  } catch (error) {
    console.error('⚠️ Reranking error:', error.message);
    return computeFallbackRerankScores(query, documents).slice(0, topK);
  }
}

/**
 * Summarize search results using configured LLM + fallback
 */
export async function summarizeResults(query, documents, options = {}) {
  try {
    const {
      maxLength = 500,
      style = 'concise',
      includeMetrics = false,
      provider: requestedProvider,
      model: requestedModel
    } = options;

    if (!documents || documents.length === 0) {
      return 'No results found.';
    }

    const cfg = getLLMConfig();
    const sumProvider = (requestedProvider || cfg.summarization.provider || 'groq').toLowerCase().trim();
    const sumModel = requestedModel || cfg.summarization.model || PROVIDER_PRESETS[sumProvider]?.defaultModel || 'openai/gpt-oss-120b';

    console.log(`\n================================================================`);
    console.log(`📝 [SUMMARIZATION & DEDUPLICATION]`);
    console.log(`🏷️ Provider: [${sumProvider.toUpperCase()}] | Model: [${sumModel}]`);
    console.log(`🔍 Query: "${query}" | Style: ${style} | Input Documents: ${documents.length}`);
    console.log(`================================================================`);

    // In token optimization mode, cap the input documents to top 8 to save prompt tokens
    const maxDocs = cfg.enableTokenOptimization ? Math.min(documents.length, 8) : documents.length;
    const docsToSummarize = documents.slice(0, maxDocs);

    const docTexts = docsToSummarize.map((doc, idx) => `${idx + 1}. ${formatDocumentForSummary(doc)}`).join('\n\n');

    let formatInstruction = '';
    if (style === 'bullet') {
      formatInstruction = `Format your summary using:
1. A bullet-point list of each key test case (ID, Title, Module, Relevance).
2. Key takeaways and common workflows.`;
    } else if (style === 'detailed') {
      formatInstruction = `Format your summary using:
1. A clean Markdown table summarizing the test cases:
| # | Test-Case ID | Title (key action) | Module | Core Purpose | Relevance |
2. Detailed analysis of the workflows, edge cases, and module interactions.`;
    } else {
      formatInstruction = `Format your summary using:
1. A clean Markdown table summarizing each test case:
| # | Test-Case ID | Title (key action) | Module | Core Purpose | Relevance |
2. A brief executive summary (2-3 sentences) highlighting primary modules covered, key actions, and test scenarios.`;
    }

    const prompt = `You are an expert QA and test case search analyst.

Query: "${query}"

Search Results:
${docTexts}

Instructions:
${formatInstruction}
${includeMetrics ? 'Include statistics like number of results, common themes, and relevance insights.' : ''}
Keep the response clear, professional, and well-structured.

Summary:`;

    const systemPrompt = "You are an expert search and QA analyst. When summarizing test cases, always present results in a clean, professional Markdown table followed by key analytical insights.";

    const maxSummaryTokens = options.maxTokens || cfg.maxSummaryTokens || Math.max(maxLength * 2, 1200);

    const result = await chatCompletion({
      provider: sumProvider,
      model: sumModel,
      systemPrompt,
      prompt,
      temperature: 0.2,
      maxTokens: maxSummaryTokens
    });

    const cleanSummary = (result.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    console.log(`✅ [SUMMARIZATION COMPLETED] Summary generated (${cleanSummary.length} chars)\n`);
    return cleanSummary;
  } catch (error) {
    console.error('❌ Summarization error:', error.message);
    return `Error generating summary: ${error.message}`;
  }
}

/**
 * Generate answer based on retrieved documents
 */
export async function generateAnswer(query, documents, options = {}) {
  try {
    const {
      maxTokens = 1000,
      includeReferences = true,
      temperature = 0.2
    } = options;

    if (!documents || documents.length === 0) {
      return {
        answer: "I couldn't find relevant information to answer your question.",
        references: [],
        confidence: 0
      };
    }

    const context = documents.map((doc, idx) => `[${idx + 1}] ${formatDocumentForSummary(doc)}`).join('\n\n');

    const prompt = `Answer the following question based ONLY on the provided context. If the answer cannot be found in the context, say so.

Context:
${context}

Question: ${query}

Instructions:
1. Provide a direct, accurate answer based on the context
2. ${includeReferences ? 'Cite source numbers [1], [2], etc. when referencing specific information' : 'Do not include citations'}
3. Be concise but complete
4. If uncertain or if information is not in context, acknowledge it

Answer:`;

    const systemPrompt = "You are a helpful assistant that answers questions accurately based on provided context. Never make up information.";

    const result = await chatCompletion({
      systemPrompt,
      prompt,
      temperature,
      maxTokens
    });

    const answer = result.content.trim();
    const references = [];

    if (includeReferences) {
      const refMatches = answer.matchAll(/\[(\d+)\]/g);
      const refIndices = new Set([...refMatches].map(m => parseInt(m[1]) - 1));
      refIndices.forEach(idx => {
        if (idx >= 0 && idx < documents.length) {
          references.push({ index: idx + 1, document: documents[idx] });
        }
      });
    }

    return {
      answer,
      references,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed || false,
      tokensUsed: result.usage?.totalTokens || 0
    };
  } catch (error) {
    console.error('❌ Answer generation error:', error.message);
    return {
      answer: `Error generating answer: ${error.message}`,
      references: [],
      confidence: 0
    };
  }
}

// Helpers
function formatDocumentForRerank(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const id = doc.id || doc.testCaseId || doc.testcase_id || doc.userStoryId || doc.storyId || doc.key || (doc._id ? String(doc._id) : '');
  const title = doc.title || doc.testCaseTitle || doc.userStoryTitle || doc.name || doc.summary || '';
  const description = doc.description || doc.testCaseDescription || doc.userStoryDescription || doc.storyDescription || doc.acceptanceCriteria || '';
  const module = doc.module || doc.category || '';
  const priority = doc.priority || '';
  return `ID: ${id} | Title: ${title}${module ? ` | Module: ${module}` : ''}${priority ? ` | Priority: ${priority}` : ''} | Description: ${description.substring(0, 300)}`;
}

function formatDocumentForSummary(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const id = doc.id || doc.testCaseId || doc.testcase_id || doc.userStoryId || doc.storyId || doc.key || (doc._id ? String(doc._id) : '');
  const title = doc.title || doc.testCaseTitle || doc.userStoryTitle || doc.name || doc.summary || 'N/A';
  const description = doc.description || doc.testCaseDescription || doc.userStoryDescription || doc.storyDescription || doc.acceptanceCriteria || '';
  const parts = [
    `ID: ${id}`,
    `Title: ${title}`,
    doc.module ? `Module: ${doc.module}` : null,
    description ? `Description: ${description.substring(0, 150)}` : null,
    doc.score ? `Relevance: ${(doc.score * 100).toFixed(1)}%` : null
  ].filter(Boolean);
  return parts.join(' | ');
}

export function extractAllTestCases(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  const getField = (blockStr, name) => {
    const reg = new RegExp(`"${name}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"|\\s*})`);
    const m = blockStr.match(reg);
    return m ? m[1].replace(/\\r\\n/g, '\n').replace(/\\"/g, '"') : null;
  };

  const getArrayField = (blockStr, name) => {
    const reg = new RegExp(`"${name}"\\s*:\\s*\\[([\\s\\S]*?)\\]`);
    const m = blockStr.match(reg);
    if (!m) return [];
    try {
      return JSON.parse(`[${m[1]}]`);
    } catch (e) {
      return m[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    }
  };

  const tcMarker = rawText.indexOf('"newTestCases"');
  const targetText = tcMarker !== -1 ? rawText.substring(tcMarker) : rawText;

  const tcBlocks = [];
  const regex = /\{\s*"testCaseId"\s*:\s*"([^"]+)"([\s\S]*?)(?=\s*,\s*\{\s*"testCaseId"|\s*\]\s*,|\s*\]\s*\}|\s*\]|$)/g;

  let match;
  while ((match = regex.exec(targetText)) !== null) {
    const fullBlock = match[0];
    try {
      let clean = fullBlock.trim();
      if (!clean.endsWith('}')) clean += '}';
      const parsed = JSON.parse(clean);
      if (parsed.testCaseTitle || parsed.title || parsed.testCaseDescription) {
        tcBlocks.push({
          testCaseId: parsed.testCaseId,
          module: parsed.module || 'General',
          testCaseTitle: parsed.testCaseTitle || parsed.title || 'Untitled Test Case',
          testCaseDescription: parsed.testCaseDescription || '',
          preconditions: parsed.preconditions || '',
          testSteps: parsed.testSteps || '',
          expectedResults: parsed.expectedResults || '',
          priority: parsed.priority || 'P2',
          testType: parsed.testType || 'Functional',
          riskLevel: parsed.riskLevel || 'Medium',
          linkedUserStories: parsed.linkedUserStories || [],
          sourceCitations: parsed.sourceCitations || [],
          complianceNotes: parsed.complianceNotes || '',
          estimatedExecutionTime: parsed.estimatedExecutionTime || ''
        });
        continue;
      }
    } catch (e) {}

    // Robust field extraction fallback
    const title = getField(fullBlock, 'testCaseTitle') || getField(fullBlock, 'title');
    if (title) {
      tcBlocks.push({
        testCaseId: getField(fullBlock, 'testCaseId') || match[1] || 'TC_GEN',
        module: getField(fullBlock, 'module') || 'General',
        testCaseTitle: title,
        testCaseDescription: getField(fullBlock, 'testCaseDescription') || getField(fullBlock, 'description') || '',
        preconditions: getField(fullBlock, 'preconditions') || getField(fullBlock, 'precondition') || '',
        testSteps: getField(fullBlock, 'testSteps') || getField(fullBlock, 'steps') || '',
        expectedResults: getField(fullBlock, 'expectedResults') || getField(fullBlock, 'expectedResult') || '',
        priority: getField(fullBlock, 'priority') || 'P2',
        testType: getField(fullBlock, 'testType') || 'Functional',
        riskLevel: getField(fullBlock, 'riskLevel') || 'Medium',
        linkedUserStories: getArrayField(fullBlock, 'linkedUserStories'),
        sourceCitations: getArrayField(fullBlock, 'sourceCitations'),
        complianceNotes: getField(fullBlock, 'complianceNotes') || '',
        estimatedExecutionTime: getField(fullBlock, 'estimatedExecutionTime') || ''
      });
    }
  }

  return tcBlocks;
}

export function parseAndRepairLlmOutput(raw) {
  if (!raw) return { newTestCases: [] };
  if (typeof raw === 'object') {
    if (raw.newTestCases && Array.isArray(raw.newTestCases) && raw.newTestCases.length > 0) return raw;
    if (raw.testCases && Array.isArray(raw.testCases)) return { ...raw, newTestCases: raw.testCases };
    if (Array.isArray(raw)) return { newTestCases: raw };
    if (raw.overallVerdict || raw.dimensionScores || raw.keyDifferences || raw.learnerTakeaways) return raw;
    if (raw.raw && typeof raw.raw === 'string') raw = raw.raw;
  }

  let text = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fence) {
    text = fence[1].trim();
  }

  // 1. Direct JSON.parse
  try {
    const direct = JSON.parse(text);
    if (direct) {
      if (direct.newTestCases || direct.testCases || Array.isArray(direct)) {
        return {
          analysis: direct.analysis || {},
          newTestCases: direct.newTestCases || direct.testCases || (Array.isArray(direct) ? direct : []),
          rationale: direct.rationale || [],
          recommendations: direct.recommendations || ''
        };
      }
      if (direct.overallVerdict || direct.dimensionScores || direct.keyDifferences || direct.learnerTakeaways) {
        return direct;
      }
      if (typeof direct === 'object' && Object.keys(direct).length > 0) {
        return direct;
      }
    }
  } catch (e) {}

  // 2. Intelligent JSON balance & auto-repair
  try {
    let inString = false;
    let escape = false;
    const stack = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (!inString) {
        if (ch === '{') stack.push('}');
        else if (ch === '[') stack.push(']');
        else if (ch === '}' || ch === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === ch) {
            stack.pop();
          }
        }
      }
    }

    let balanced = text.trim();
    if (inString) balanced += '"';
    balanced = balanced.replace(/,\s*$/, '');
    while (stack.length > 0) {
      balanced += stack.pop();
    }

    const parsed = JSON.parse(balanced);
    if (parsed) {
      if (parsed.newTestCases || parsed.testCases || Array.isArray(parsed)) {
        return {
          analysis: parsed.analysis || {},
          newTestCases: parsed.newTestCases || parsed.testCases || (Array.isArray(parsed) ? parsed : []),
          rationale: parsed.rationale || [],
          recommendations: parsed.recommendations || ''
        };
      }
      if (parsed.overallVerdict || parsed.dimensionScores || parsed.keyDifferences || parsed.learnerTakeaways) {
        return parsed;
      }
      if (typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  // 3. Fallback: Check for comparison structure
  try {
    const verdictMatch = text.match(/"overallVerdict"\s*:\s*\{([\s\S]*?)\}/);
    if (verdictMatch) {
      const parsedObj = {};
      parsedObj.overallVerdict = JSON.parse(`{${verdictMatch[1]}}`);
      const dimMatch = text.match(/"dimensionScores"\s*:\s*\[([\s\S]*?)\]/);
      if (dimMatch) {
        parsedObj.dimensionScores = JSON.parse(`[${dimMatch[1]}]`);
      }
      const keyDiffMatch = text.match(/"keyDifferences"\s*:\s*\[([\s\S]*?)\]/);
      if (keyDiffMatch) {
        parsedObj.keyDifferences = JSON.parse(`[${keyDiffMatch[1]}]`);
      }
      const takeMatch = text.match(/"learnerTakeaways"\s*:\s*\[([\s\S]*?)\]/);
      if (takeMatch) {
        parsedObj.learnerTakeaways = JSON.parse(`[${takeMatch[1]}]`);
      }
      return parsedObj;
    }
  } catch (e) {}

  // 4. Fallback: Robust block extraction
  const extractedCases = extractAllTestCases(text);
  let analysis = {};
  const analysisMatch = text.match(/"analysis"\s*:\s*\{([\s\S]*?)\}/);
  if (analysisMatch) {
    try {
      analysis = JSON.parse(`{${analysisMatch[1]}}`);
    } catch (e) {}
  }

  return {
    analysis,
    newTestCases: extractedCases,
    rationale: [],
    recommendations: ''
  };
}

export function extractJsonObject(text) {
  if (!text) return null;
  const repaired = parseAndRepairLlmOutput(text);
  if (repaired && repaired.newTestCases && repaired.newTestCases.length > 0) {
    return repaired;
  }
  return null;
}

export default {
  PROVIDER_PRESETS,
  getLLMConfig,
  getApiKeyForProvider,
  chatCompletion,
  rerankDocuments,
  summarizeResults,
  generateAnswer,
  testLLMConnection,
  parseAndRepairLlmOutput,
  extractAllTestCases
};
