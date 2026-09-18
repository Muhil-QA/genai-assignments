"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jiraRouter = void 0;
const express_1 = __importDefault(require("express"));
const node_fetch_1 = __importDefault(require("node-fetch"));
exports.jiraRouter = express_1.default.Router();
exports.jiraRouter.post('/connect', async (req, res) => {
    try {
        const { baseUrl, email, token } = req.body ?? {};
        if (!baseUrl || !email || !token) {
            res.status(400).json({
                error: 'Base URL, Email ID, and Jira API Token are required.'
            });
            return;
        }
        const normalizedBaseUrl = String(baseUrl).trim().replace(/\/+$/, '');
        if (!normalizedBaseUrl || !/^https?:\/\//i.test(normalizedBaseUrl)) {
            res.status(400).json({
                error: 'Base URL must be a valid Jira site URL like https://your-company.atlassian.net'
            });
            return;
        }
        const jiraAuthHeader = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${String(email).trim()}:${String(token).trim()}`).toString('base64')}`
        };
        const jiraUrl = new URL('/rest/api/3/search/jql', normalizedBaseUrl).toString();
        const issues = [];
        let nextPageToken;
        let metadata = {};
        do {
            const jiraPayload = {
                jql: 'issuetype = Story ORDER BY created DESC',
                maxResults: 50,
                fields: ['*all'],
                expand: 'names,schema',
                ...(nextPageToken ? { nextPageToken } : {})
            };
            const jiraResponse = await (0, node_fetch_1.default)(jiraUrl, {
                method: 'POST',
                headers: jiraAuthHeader,
                body: JSON.stringify(jiraPayload)
            });
            if (!jiraResponse.ok) {
                const errorText = await jiraResponse.text().catch(() => '');
                res.status(400).json({
                    error: errorText || `Jira request failed. Check the base URL, email, and token.`
                });
                return;
            }
            const data = await jiraResponse.json();
            issues.push(...(Array.isArray(data.issues) ? data.issues : []));
            metadata = {
                names: data.names || metadata.names || {},
                schema: data.schema || metadata.schema || {}
            };
            nextPageToken = data.isLast ? undefined : data.nextPageToken;
        } while (nextPageToken);
        res.json({ ...metadata, issues });
    }
    catch (error) {
        console.error('Jira proxy error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to connect to Jira from the server.'
        });
    }
});
//# sourceMappingURL=jira.js.map