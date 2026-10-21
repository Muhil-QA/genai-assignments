export async function createLangChainChatModel({
  provider,
  model,
  apiKey,
  baseUrl = null,
  temperature = 0.2,
  maxTokens = 3000
}) {
  const commonOptions = { model, temperature };

  switch ((provider || '').toLowerCase()) {
    case 'groq': {
      const { ChatGroq } = await import('@langchain/groq');
      return new ChatGroq({ ...commonOptions, apiKey, maxTokens, ...(baseUrl ? { baseUrl } : {}) });
    }
    case 'openai': {
      const { ChatOpenAI } = await import('@langchain/openai');
      return new ChatOpenAI({ ...commonOptions, apiKey, maxTokens, ...(baseUrl ? { configuration: { baseURL: baseUrl } } : {}) });
    }
    case 'claude':
    case 'anthropic': {
      const { ChatAnthropic } = await import('@langchain/anthropic');
      return new ChatAnthropic({ ...commonOptions, apiKey, maxTokens, ...(baseUrl ? { clientOptions: { baseURL: baseUrl } } : {}) });
    }
    case 'gemini':
    case 'google': {
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
      return new ChatGoogleGenerativeAI({ ...commonOptions, apiKey, maxOutputTokens: maxTokens, ...(baseUrl ? { baseUrl } : {}) });
    }
    case 'mistral': {
      const { ChatMistralAI } = await import('@langchain/mistralai');
      return new ChatMistralAI({ ...commonOptions, apiKey, maxTokens, ...(baseUrl ? { endpoint: baseUrl } : {}) });
    }
    case 'nvidia': {
      const { ChatOpenAI } = await import('@langchain/openai');
      return new ChatOpenAI({
        ...commonOptions,
        apiKey,
        maxTokens,
        configuration: { baseURL: baseUrl || 'https://integrate.api.nvidia.com/v1' }
      });
    }
    default:
      throw new Error(`Unsupported LangChain provider: '${provider}'`);
  }
}
