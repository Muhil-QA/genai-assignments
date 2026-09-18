"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqClient = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
class GroqClient {
    apiKey;
    baseUrl;
    model;
    constructor() {
        this.apiKey = process.env.groq_API_KEY || '';
        this.baseUrl = process.env.groq_API_BASE || 'https://api.groq.com/openai/v1';
        this.model = process.env.groq_MODEL || 'llama3-8b-8192';
        if (!this.apiKey) {
            console.warn('groq_API_KEY not found in environment variables');
        }
        else {
            console.log('Groq API key configured successfully');
            console.log(`Using model: ${this.model}`);
            console.log(`API endpoint: ${this.baseUrl}/chat/completions`);
        }
    }
    async generateTests(systemPrompt, userPrompt) {
        const endpoint = `${this.baseUrl}/chat/completions`;
        const requestBody = {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.2
        };
        console.log('🚀 Making Groq API call:');
        console.log(`📍 Endpoint: ${endpoint}`);
        console.log(`🤖 Model: ${this.model}`);
        console.log(`🔑 API Key: ${this.apiKey.substring(0, 10)}...${this.apiKey.substring(this.apiKey.length - 4)}`);
        console.log(`📝 Request body:`, JSON.stringify(requestBody, null, 2));
        try {
            const response = await (0, node_fetch_1.default)(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            console.log(`📊 Response status: ${response.status} ${response.statusText}`);
            console.log(`📋 Response headers:`, Object.fromEntries(response.headers.entries()));
            if (!response.ok) {
                const errorText = await response.text();
                console.log(`❌ Error response body:`, errorText);
                throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            const data = await response.json();
            console.log(`✅ Success response:`, JSON.stringify(data, null, 2));
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('No content received from Groq API');
            }
            let parsedContent;
            try {
                parsedContent = JSON.parse(content);
            }
            catch (parseError) {
                throw new Error(`Invalid JSON response from Groq API: ${parseError}`);
            }
            return {
                content,
                model: data.model,
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0
            };
        }
        catch (error) {
            console.error('❌ Error calling Groq API:', error);
            throw error;
        }
    }
}
exports.GroqClient = GroqClient;
//# sourceMappingURL=groqClient.js.map