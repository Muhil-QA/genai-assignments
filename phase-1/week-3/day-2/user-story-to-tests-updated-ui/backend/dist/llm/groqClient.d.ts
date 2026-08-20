interface GroqResponse {
    content: string;
    model?: string;
    promptTokens: number;
    completionTokens: number;
}
export declare class GroqClient {
    private apiKey;
    private baseUrl;
    private model;
    constructor();
    generateTests(systemPrompt: string, userPrompt: string): Promise<GroqResponse>;
}
export {};
//# sourceMappingURL=groqClient.d.ts.map