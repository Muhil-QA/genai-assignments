import { getPrompt } from '../scripts/prompts.js';

// Constants
const INITIAL_SYSTEM_MESSAGE = ``;

class ChatUI {
    constructor() {
        // Grab references
        this.messagesContainer     = document.getElementById('chatMessages');
        this.inputField            = document.getElementById('chatInput');
        this.sendButton            = document.getElementById('sendMessage');
        this.inspectorButton       = document.getElementById('inspectorButton');
        this.resetButton           = document.getElementById('resetChat');
        this.runTestButton         = document.getElementById('runTestButton');
        this.pushAndRunButton      = document.getElementById('pushAndRunButton');

        // Language / Browser dropdown

        // Language / Browser dropdown
        this.languageBindingSelect = document.getElementById('languageBinding');
        this.browserEngineSelect   = document.getElementById('browserEngine');

        // Additional states
        this.selectedDomContent    = null;
        this.isInspecting          = false;
        this.markdownReady         = false;
        this.codeGeneratorType     = 'SELENIUM_JAVA_PAGE_ONLY'; // default 
        this.tokenWarningThreshold = 10000;
        this.selectedModel         = '';
        this.selectedProvider      = '';
        this.generatedCode         = '';

        // Clear existing messages + add initial system message
        this.messagesContainer.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
            </div>
        `;
        this.addMessage(INITIAL_SYSTEM_MESSAGE, 'system');

        // Initialize everything
        this.initialize();
        this.initializeMarkdown();
        this.initializeTokenThreshold();
        this.initializeCodeGeneratorType();
    }

    initialize() {
        // Reset chat
        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => {
                this.messagesContainer.innerHTML = '';
                this.addMessage(INITIAL_SYSTEM_MESSAGE, 'system');
                this.selectedDomContent = null;
                this.generatedCode = '';
                this.inspectorButton.classList.remove('has-content','active');
                this.inspectorButton.innerHTML = `
                    <i class="fas fa-mouse-pointer"></i>
                    <span>Inspect</span>
                `;
                this.isInspecting = false;
                
                // Hide all action buttons
                if (this.runTestButton) this.runTestButton.style.display = 'none';
            });
        }

        // Load stored keys
        chrome.storage.sync.get(
          ['groqApiKey','openaiApiKey','testleafApiKey','selectedModel','selectedProvider'],
          (result) => {
            if (result.groqApiKey)   this.groqAPI   = new GroqAPI(result.groqApiKey);
            if (result.openaiApiKey) this.openaiAPI = new OpenAIAPI(result.openaiApiKey);
            if (result.testleafApiKey) this.testleafAPI = new TestleafAPI(result.testleafApiKey);

            this.selectedModel    = result.selectedModel    || '';
            this.selectedProvider = result.selectedProvider || '';
        });

        // Listen for changes
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.groqApiKey)       this.groqAPI   = new GroqAPI(changes.groqApiKey.newValue);
            if (changes.openaiApiKey)     this.openaiAPI = new OpenAIAPI(changes.openaiApiKey.newValue);
            if (changes.testleafApiKey)   this.testleafAPI = new TestleafAPI(changes.testleafApiKey.newValue);
            if (changes.selectedModel)    this.selectedModel = changes.selectedModel.newValue;
            if (changes.selectedProvider) this.selectedProvider = changes.selectedProvider.newValue;
        });

        // Listen for SELECTED_DOM_CONTENT from content.js
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'SELECTED_DOM_CONTENT') {
                this.selectedDomContent = msg.content;
                this.inspectorButton.classList.add('has-content');
            }
        });

        // Send button
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Inspector button
        this.inspectorButton.addEventListener('click', async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;
                if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                    console.log('Cannot use inspector on this page');
                    return;
                }
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['src/content/content.js']
                    });
                } catch (error) {
                    if (!error.message.includes('already been injected')) {
                        throw error;
                    }
                }
                const port = chrome.tabs.connect(tab.id);
                port.postMessage({ type: 'TOGGLE_INSPECTOR', reset: true });
                this.isInspecting = !this.isInspecting;
                this.updateInspectorButtonState();
            } catch (error) {
                console.error('Inspector error:', error);
                this.addMessage('Failed to activate inspector. Please refresh and try again.', 'system');
                this.isInspecting = false;
                this.updateInspectorButtonState();
            }
        });

        // Run Test button
        if (this.runTestButton) {
            this.runTestButton.addEventListener('click', () => this.runCucumberTest());
        }

    }

    // ===================
    // Markdown / Parsing
    // ===================
    initializeMarkdown() {
        const checkLibraries = setInterval(() => {
            if (window.marked && window.Prism) {
                
                window.marked.setOptions({
                    highlight: (code, lang) => {
                        // Normalize language name
                        let normalizedLang = lang?.toLowerCase().trim();
                        
                        // Map common language aliases
                        const languageMap = {
                            'feature': 'gherkin',
                            'cucumber': 'gherkin',
                            'bdd': 'gherkin'
                        };
                        
                        if (languageMap[normalizedLang]) {
                            normalizedLang = languageMap[normalizedLang];
                        }
                        
                        if (normalizedLang && Prism.languages[normalizedLang]) {
                            try {
                                return Prism.highlight(code, Prism.languages[normalizedLang], normalizedLang);
                            } catch (e) {
                                console.error('Prism highlight error:', e);
                                return code;
                            }
                        }
                        return code;
                    },
                    langPrefix: 'language-',
                    breaks: true,
                    gfm: true
                });
                const renderer = new marked.Renderer();
            renderer.code = (code, language) => {
                console.log('🎨 Rendering code block:', { language, codeLength: code?.length });
                
                if (typeof code === 'object') {
                    if (code.text) {
                        code = code.text;
                    } else if (code.raw) {
                        code = code.raw.replace(/^```[\\w]*\\n/, '').replace(/\\n```$/, '');
                    } else {
                        code = JSON.stringify(code, null, 2);
                    }
                }
                
                // Normalize language name
                let validLanguage = language?.toLowerCase().trim() || 'typescript';
                console.log('Original language:', language, '-> Normalized:', validLanguage);
                
                // Map common language aliases
                const languageMap = {
                    'feature': 'gherkin',
                    'cucumber': 'gherkin',
                    'bdd': 'gherkin',
                    'js': 'javascript',
                    'ts': 'typescript',
                    'py': 'python',
                    'cs': 'csharp'
                };
                
                if (languageMap[validLanguage]) {
                    console.log('Language mapped:', validLanguage, '->', languageMap[validLanguage]);
                    validLanguage = languageMap[validLanguage];
                }
                
                let highlighted = code;
                
                // Check if Prism language is available
                if (validLanguage && Prism.languages[validLanguage]) {
                    try {
                        console.log('Highlighting with Prism for language:', validLanguage);
                        highlighted = Prism.highlight(code, Prism.languages[validLanguage], validLanguage);
                        console.log('✅ Highlighting successful');
                    } catch (e) {
                        console.error('❌ Highlighting failed for', validLanguage, ':', e);
                        highlighted = code;
                    }
                } else {
                    console.warn('⚠️ Language not supported by Prism:', validLanguage);
                }
                
                const result = `<pre class=\"language-${validLanguage}\"><code class=\"language-${validLanguage}\">${highlighted}</code></pre>`;
                console.log('Final HTML classes:', `language-${validLanguage}`);
                return result;
            };
                window.marked.setOptions({ renderer });
                this.markdownReady = true;
                clearInterval(checkLibraries);
            }
        }, 100);
    }



    parseMarkdown(content) {
        if (!this.markdownReady) {
            return `<pre>${content}</pre>`;
        }
        let textContent;
        if (typeof content === 'string') {
            const match = content.match(/^```(\w+)/);
            textContent = content.replace(/^```\w+/, '```');
        } else if (typeof content === 'object') {
            textContent = content.content || 
                         content.message?.content ||
                         content.choices?.[0]?.message?.content ||
                         JSON.stringify(content, null, 2);
        } else {
            textContent = String(content);
        }
        let processedContent = textContent
            .replace(/&#x60;/g, '`')
            .replace(/&grave;/g, '`')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/```(\w*)/g, '\n```$1\n')
            .replace(/```\s*$/g, '\n```\n')
            .replace(/\n{3,}/g, '\n\n');
        try {
            const renderer = new marked.Renderer();
            renderer.code = (code, language) => {
                if (typeof code === 'object') {
                    if (code.text) {
                        code = code.text;
                    } else if (code.raw) {
                        code = code.raw.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
                    } else {
                        code = JSON.stringify(code, null, 2);
                    }
                }
                const validLanguage = language?.toLowerCase().trim() || 'typescript';
                let highlighted = code;
                if (validLanguage && Prism.languages[validLanguage]) {
                    try {
                        highlighted = Prism.highlight(code, Prism.languages[validLanguage], validLanguage);
                    } catch (e) {
                        console.error('Highlighting failed:', e);
                    }
                }
                return `<pre class="language-${validLanguage}"><code class="language-${validLanguage}">${highlighted}</code></pre>`;
            };
            window.marked.setOptions({ renderer });
            const parsed = window.marked.parse(processedContent);
            
            // Apply syntax highlighting after DOM is updated
            setTimeout(() => {
                const codeBlocks = document.querySelectorAll('pre code[class*="language-"]');
                console.log('📝 Post-parse highlighting for', codeBlocks.length, 'code blocks');
                
                codeBlocks.forEach((block, index) => {
                    // Standard Prism highlighting for all languages
                    try {
                        Prism.highlightElement(block);
                    } catch (e) {
                        console.error('Prism highlighting error:', e);
                    }
                });
            }, 100);
            
            return parsed;
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return `<pre>${textContent}</pre>`;
        }
    }



    // =============
    // Send Message
    // =============
    async sendMessage() {
        const userMsg = this.inputField.value.trim();
        let apiRef = null;
        this.isInspecting = false;
        this.updateInspectorButtonState();
      
        if (this.selectedProvider === 'groq') apiRef = this.groqAPI;
        else if (this.selectedProvider === 'openai') apiRef = this.openaiAPI;
        else apiRef = this.testleafAPI;
        if (!apiRef) {
          this.addMessage(`Please set your ${this.selectedProvider} API key in the Settings tab.`, 'system');
          return;
        }

        if (!this.selectedDomContent) {
            this.addMessage('Please select some DOM on the page first.', 'system');
            return;
        }

        // --- Retain only 3 <option> elements in <select> tags to simulate real data ---
        function stripExtraOptions(selectElement) {
            const options = selectElement.querySelectorAll('option');
            if (options.length > 3) {
                for (let i = 3; i < options.length; i++) {
                    options[i].remove();
                }
            }
        }

        let domContentProcessed = this.selectedDomContent;
        if (typeof domContentProcessed === 'string') {
            // Parse string to DOM
            const parser = new DOMParser();
            const doc = parser.parseFromString(domContentProcessed, 'text/html');
            const selects = doc.querySelectorAll('select');
            selects.forEach(stripExtraOptions);
            // Serialize back to string
            domContentProcessed = doc.body.innerHTML;
        } else if (domContentProcessed instanceof HTMLElement) {
            // Directly process if it's an HTMLElement
            const selects = domContentProcessed.querySelectorAll('select');
            selects.forEach(stripExtraOptions);
        }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const pageUrl = tab?.url || 'unknown';
            const lang = this.languageBindingSelect.value;
            const eng = this.browserEngineSelect.value;
            const promptKeys = this.getPromptKeys(lang, eng);

            const finalSnippet = typeof domContentProcessed === 'string'
                ? domContentProcessed
                : JSON.stringify(domContentProcessed, null, 2);

            this.sendButton.disabled = true;
            this.inputField.disabled = true;
            this.sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            this.addMessage(userMsg, 'user');
            this.inputField.value = '';

            let combinedContent = '';
            let totalInputTokens = 0;
            let totalOutputTokens = 0;

            for (const key of promptKeys) {
                const builtPrompt = getPrompt(key, {
                    domContent: finalSnippet,
                    pageUrl: pageUrl,
                    userAction: '',
                });

                const finalPrompt = builtPrompt + " Additional Instructions: " + userMsg;
                const resp = await apiRef.sendMessage(finalPrompt, this.selectedModel);
                const returned = resp?.content || resp;
                combinedContent += returned.trim() + '\n\n';

                totalInputTokens += resp.usage?.input_tokens || 0;
                totalOutputTokens += resp.usage?.output_tokens || 0;
            }

            const loader = this.messagesContainer.querySelector('.loading-indicator.active');
            if (loader) loader.remove();

            this.addMessageWithMetadata(combinedContent.trim(), 'assistant', {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens
            });

            this.selectedDomContent = null;
            this.inspectorButton.classList.remove('has-content','active');
            this.inspectorButton.innerHTML = `
                <i class="fas fa-mouse-pointer"></i>
                <span>Inspect</span>
            `;
            this.isInspecting = false;
            if (tab) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_SELECTION' });
                } catch (err) {
                    const port = chrome.tabs.connect(tab.id);
                    port.postMessage({ type: 'CLEAR_SELECTION' });
                    port.disconnect();
                }
            }
            this.generatedCode = combinedContent.trim();
        } catch (err) {
            const loader = this.messagesContainer.querySelector('.loading-indicator.active');
            if (loader) loader.remove();
            this.addMessage(`Error: ${err.message}`, 'system');
        } finally {
            this.sendButton.disabled = false;
            this.inputField.disabled = false;
            this.sendButton.innerHTML = 'Generate';
        }
    }
      

    // ==============
    // addMessage UI
    // ==============
    addMessage(content, type) {
        if (!content) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${type}-message`;
        if (type === 'system') {
            msgDiv.innerHTML = content;
        } else {
            const markdownDiv = document.createElement('div');
            markdownDiv.className = 'markdown-content';
            markdownDiv.innerHTML = this.parseMarkdown(content);
            msgDiv.appendChild(markdownDiv);
        }
        this.messagesContainer.appendChild(msgDiv);
        if (type === 'user') {
            const loader = document.createElement('div');
            loader.className = 'loading-indicator';
            const genType = this.codeGeneratorType.includes('PLAYWRIGHT') ? 'Playwright' : 'Selenium';
            loader.innerHTML = `
              <div class="loading-spinner"></div>
              <span class="loading-text">Generating ${genType} Code</span>
            `;
            this.messagesContainer.appendChild(loader);
            setTimeout(() => loader.classList.add('active'), 0);
        }
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        const msgCount = this.messagesContainer.querySelectorAll('.chat-message').length;
        if (msgCount > 1 && this.resetButton) {
            this.resetButton.classList.add('visible');
        }
    }

    addMessageWithMetadata(content, type, metadata) {
        if (type !== 'assistant') {
            this.addMessage(content, type);
            return;
        }
        const container = document.createElement('div');
        container.className = 'assistant-message';
        const mdDiv = document.createElement('div');
        mdDiv.className = 'markdown-content';
        mdDiv.innerHTML = this.parseMarkdown(content);
        container.appendChild(mdDiv);
        const metaContainer = document.createElement('div');
        metaContainer.className = 'message-metadata collapsed';
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'metadata-toggle';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'metadata-toggle';
        copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy`;
        copyBtn.onclick = () => {
            const codeBlocks = mdDiv.querySelectorAll('pre code');
            if (codeBlocks.length === 0) {
                copyBtn.innerHTML = `<i class="fas fa-times"></i> No content found`;
                setTimeout(() => { copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy`; }, 2000);
                return;
            }
            let combinedCode = Array.from(codeBlocks).map(block => block.textContent.trim()).join('\n\n');
            combinedCode = combinedCode.replace(/^```[\w-]*\n/, '').replace(/\n```$/, '');
            navigator.clipboard.writeText(combinedCode)
                .then(() => {
                    copyBtn.innerHTML = `<i class="fas fa-check"></i> Copied!`;
                    setTimeout(() => { copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy code`; }, 2000);
                })
                .catch(err => {
                    console.error('Copy failed:', err);
                    copyBtn.innerHTML = `<i class="fas fa-times"></i> Failed to copy`;
                    setTimeout(() => { copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy code`; }, 2000);
                });
        };
        actions.appendChild(toggleBtn);
        actions.appendChild(copyBtn);
        metaContainer.appendChild(actions);
        const details = document.createElement('div');
        details.className = 'metadata-content';
        details.innerHTML = `
          <div class="metadata-row"><span>Input Tokens:</span><span>${metadata.inputTokens}</span></div>
          <div class="metadata-row"><span>Output Tokens:</span><span>${metadata.outputTokens}</span></div>
        `;
        metaContainer.appendChild(details);
        container.appendChild(metaContainer);
        this.messagesContainer.appendChild(container);
        // Add a copy button to each generated code block
        this.addCodeBlockCopyButtons(mdDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        if (this.resetButton) {
            this.resetButton.classList.add('visible');
        }
    }

    // Adds a floating "Copy" button to each generated code block
    addCodeBlockCopyButtons(container) {
        // Wait for markdown/Prism to finish rendering the <pre> blocks
        setTimeout(() => {
            const preBlocks = container.querySelectorAll('pre[class*="language-"]');
            preBlocks.forEach((pre) => {
                // Skip if already wrapped/decorated
                if (pre.parentElement && pre.parentElement.classList.contains('code-block-wrapper')) return;

                // Wrap the <pre> and add a sticky header bar with a copy button
                const wrapper = document.createElement('div');
                wrapper.className = 'code-block-wrapper';
                pre.parentNode.insertBefore(wrapper, pre);

                const header = document.createElement('div');
                header.className = 'code-block-header';

                const btn = document.createElement('button');
                btn.className = 'code-copy-btn';
                btn.type = 'button';
                btn.innerHTML = `<i class="fas fa-copy"></i><span>Copy</span>`;
                btn.addEventListener('click', () => {
                    const codeEl = pre.querySelector('code');
                    const code = (codeEl ? codeEl.textContent : pre.textContent).trim();
                    navigator.clipboard.writeText(code)
                        .then(() => {
                            btn.classList.add('copied');
                            btn.innerHTML = `<i class="fas fa-check"></i><span>Copied!</span>`;
                            setTimeout(() => {
                                btn.classList.remove('copied');
                                btn.innerHTML = `<i class="fas fa-copy"></i><span>Copy</span>`;
                            }, 2000);
                        })
                        .catch((err) => {
                            console.error('Code copy failed:', err);
                            btn.innerHTML = `<i class="fas fa-times"></i><span>Failed</span>`;
                            setTimeout(() => {
                                btn.innerHTML = `<i class="fas fa-copy"></i><span>Copy</span>`;
                            }, 2000);
                        });
                });
                header.appendChild(btn);
                wrapper.appendChild(header);
                wrapper.appendChild(pre);
            });
        }, 150);
    }
    
    updateInspectorButtonState() {
        if (this.isInspecting) {
            this.inspectorButton.classList.add('active');
            this.inspectorButton.innerHTML = `
                <i class="fas fa-circle-stop"></i>
                <span>Stop</span>
            `;
        } else {
            this.inspectorButton.classList.remove('active');
            if (!this.selectedDomContent) {
                this.inspectorButton.classList.remove('has-content');
            }
            this.inspectorButton.innerHTML = `
                <i class="fas fa-mouse-pointer"></i>
                <span>Inspect</span>
            `;
        }
    }

    getPromptKeys(language, engine) {
        const checkboxes = Array.from(document.querySelectorAll('input[name="javaGenerationMode"]:checked'));
        const promptKeys = [];
        const lang = language?.toLowerCase() || '';
        const eng = engine?.toLowerCase() || '';

        // Handle the Playwright + TypeScript path first because it is the new supported mode.
        if (this.isTypeScriptPlaywright(lang, eng)) {
            if (checkboxes.length === 0) {
                console.warn('No generation mode selected. Defaulting to Playwright TypeScript generation.');
            }
            promptKeys.push('PLAYWRIGHT_TS_SPEC');
            return promptKeys;
        }

        // Extract selected generation modes
        const isFeatureChecked = checkboxes.some(box => box.value === 'FEATURE');
        const isPageChecked = checkboxes.some(box => box.value === 'PAGE');

        // Validate that at least one option is selected
        if (!isFeatureChecked && !isPageChecked) {
            console.warn('No generation mode selected. Defaulting to Page Object generation.');
            // Default fallback to page object generation
            if (this.isJavaSelenium(lang, eng)) {
                promptKeys.push('SELENIUM_JAVA_PAGE_ONLY');
            }
            return promptKeys;
        }

        // Generate appropriate prompt keys based on selections and language/engine combination
        if (isFeatureChecked && isPageChecked) {
            // Both feature and page selected - generate combined output
            if (this.isJavaSelenium(lang, eng)) {
                promptKeys.push('CUCUMBER_WITH_SELENIUM_JAVA_STEPS');
            } else {
                // For non-Java/Selenium combinations, generate separately
                promptKeys.push('CUCUMBER_ONLY');
                this.addUnsupportedLanguageMessage(lang, eng);
            }
        } else if (isFeatureChecked) {
            // Feature file only
            promptKeys.push('CUCUMBER_ONLY');
        } else if (isPageChecked) {
            // Page object only
            if (this.isJavaSelenium(lang, eng)) {
                promptKeys.push('SELENIUM_JAVA_PAGE_ONLY');
            } else {
                this.addUnsupportedLanguageMessage(lang, eng);
            }
        }

        return promptKeys;
    }

    /**
     * Helper method to check if the combination is Java + Selenium
     */
    isJavaSelenium(language, engine) {
        return language === 'java' && engine === 'selenium';
    }

    isTypeScriptPlaywright(language, engine) {
        return language === 'ts' && engine === 'playwright';
    }

    isCSharpSelenium(language, engine) {
        return language === 'csharp' && engine === 'selenium';
    }

    isPythonSelenium(language, engine) {
        return language === 'python' && engine === 'selenium';
    }

    /**
     * Helper method to show unsupported language/engine combination message
     */
    addUnsupportedLanguageMessage(language, engine) {
        const message = `⚠️ ${language}/${engine} combination is not yet supported. Supported combinations include Java/Selenium and TypeScript/Playwright.`;
        this.addMessage(message, 'system');
    }

    async initializeCodeGeneratorType() {
        const { codeGeneratorType } = await chrome.storage.sync.get(['codeGeneratorType']);
        if (codeGeneratorType) {
            this.codeGeneratorType = codeGeneratorType;
            const codeGenDrop = document.getElementById('codeGeneratorType');
            if (codeGenDrop) codeGenDrop.value = this.codeGeneratorType;
        }
    }

    async initializeTokenThreshold() {
        const { tokenWarningThreshold } = await chrome.storage.sync.get(['tokenWarningThreshold']);
        if (tokenWarningThreshold) {
            this.tokenWarningThreshold = tokenWarningThreshold;
        }
        const threshInput = document.getElementById('tokenThreshold');
        if (threshInput) {
            threshInput.value = this.tokenWarningThreshold;
            threshInput.addEventListener('change', async (e) => {
                const val = parseInt(e.target.value,10);
                if (val >= 100) {
                    this.tokenWarningThreshold = val;
                    await chrome.storage.sync.set({ tokenWarningThreshold: val });
                } else {
                    e.target.value = this.tokenWarningThreshold;
                }
            });
        }
    }







    async resetChat() {
        try {
            this.messagesContainer.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                </div>
            `;
            this.selectedDomContent = null;
            this.isInspecting       = false;
            this.markdownReady      = false;
            this.inspectorButton.classList.remove('has-content','active');
            this.inspectorButton.innerHTML = `
                <i class="fas fa-mouse-pointer"></i>
                <span>Inspect</span>
            `;
            this.inputField.value = '';
            this.sendButton.disabled = false;
            this.sendButton.textContent = 'Generate';
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && !tab.url.startsWith('chrome://')) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'CLEANUP' });
                } catch (err) {
                    console.log('Cleanup error:', err);
                }
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['src/content/content.js']
                    });
                } catch (err) {
                    if (!err.message.includes('already been injected')) {
                        console.error('Re-inject error:', err);
                    }
                }
            }
            if (this.resetButton) {
                this.resetButton.classList.remove('visible');
            }
            if (this.runTestButton) {
                this.runTestButton.style.display = 'none';
            }
            this.addMessage(INITIAL_SYSTEM_MESSAGE, 'system');
        } catch (err) {
            console.error('Error resetting chat:', err);
            this.addMessage('Error resetting chat. Please close and reopen.', 'system');
        }
    }
}


// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new ChatUI();
});
