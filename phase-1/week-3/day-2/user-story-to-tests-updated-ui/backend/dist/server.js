"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const generate_1 = require("./routes/generate");
const jira_1 = require("./routes/jira");
const envPath = path_1.default.join(__dirname, '../../.env');
console.log(`Loading .env from: ${envPath}`);
dotenv_1.default.config({ path: envPath });
console.log('Environment variables loaded:');
console.log(`PORT: ${process.env.PORT}`);
console.log(`CORS_ORIGIN: ${process.env.CORS_ORIGIN}`);
console.log(`groq_API_BASE: ${process.env.groq_API_BASE}`);
console.log(`groq_API_KEY: ${process.env.groq_API_KEY ? 'SET' : 'NOT SET'}`);
console.log(`groq_MODEL: ${process.env.groq_MODEL}`);
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8080;
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
app.use('/api/generate-tests', generate_1.generateRouter);
app.use('/api/jira', jira_1.jiraRouter);
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
});
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found'
    });
});
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`🔍 Health check at http://localhost:${PORT}/api/health`);
});
//# sourceMappingURL=server.js.map