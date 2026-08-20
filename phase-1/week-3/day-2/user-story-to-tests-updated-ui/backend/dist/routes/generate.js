"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRouter = void 0;
const express_1 = __importDefault(require("express"));
const groqClient_1 = require("../llm/groqClient");
const schemas_1 = require("../schemas");
const prompt_1 = require("../prompt");
exports.generateRouter = express_1.default.Router();
exports.generateRouter.post('/', async (req, res) => {
    try {
        const validationResult = schemas_1.GenerateRequestSchema.safeParse(req.body);
        if (!validationResult.success) {
            res.status(400).json({
                error: `Validation error: ${validationResult.error.message}`
            });
            return;
        }
        const request = validationResult.data;
        const userPrompt = (0, prompt_1.buildPrompt)(request);
        const groqClient = new groqClient_1.GroqClient();
        try {
            const groqResponse = await groqClient.generateTests(prompt_1.SYSTEM_PROMPT, userPrompt);
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(groqResponse.content);
            }
            catch (parseError) {
                res.status(502).json({
                    error: 'LLM returned invalid JSON format'
                });
                return;
            }
            const responseValidation = schemas_1.GenerateResponseSchema.safeParse(parsedResponse);
            if (!responseValidation.success) {
                res.status(502).json({
                    error: 'LLM response does not match expected schema'
                });
                return;
            }
            const finalResponse = {
                ...responseValidation.data,
                model: groqResponse.model,
                promptTokens: groqResponse.promptTokens,
                completionTokens: groqResponse.completionTokens
            };
            res.json(finalResponse);
        }
        catch (llmError) {
            console.error('LLM error:', llmError);
            res.status(502).json({
                error: 'Failed to generate tests from LLM service'
            });
            return;
        }
    }
    catch (error) {
        console.error('Error in generate route:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});
//# sourceMappingURL=generate.js.map