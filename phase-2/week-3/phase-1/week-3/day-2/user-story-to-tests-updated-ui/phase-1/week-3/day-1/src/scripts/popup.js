// Initialize app configuration first
import { initializeAppConfig } from '../config/configUtils.js';
initializeAppConfig();

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Ensure config is applied
    
    // Initialize connection with content script
    const initializeConnection = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
          console.log('Cannot inject scripts into chrome:// pages');
          return;
        }

        // Inject content scripts if not already injected
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/content/content.js']
          });
        } catch (error) {
          // Ignore if scripts are already injected
          if (!error.message.includes('The content script has already been injected')) {
            console.error('Error injecting scripts:', error);
          }
        }

        // Establish connection with retry mechanism
        let port = null;
        let retryCount = 0;
        const maxRetries = 3;

        const connectWithRetry = async () => {
          try {
            port = chrome.tabs.connect(tab.id, { name: 'inspector-connection' });
            
            port.onDisconnect.addListener((p) => {
              const error = chrome.runtime.lastError;
              if (error) {
                console.log('Connection lost:', error.message);
                // If it's a bfcache error, attempt to reconnect
                if (error.message.includes('back/forward cache')) {
                  if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`Attempting to reconnect (${retryCount}/${maxRetries})...`);
                    setTimeout(connectWithRetry, 1000); // Wait 1 second before retrying
                  }
                }
              }
            });

            // Reset retry count on successful connection
            retryCount = 0;
            return port;
          } catch (error) {
            console.error('Error establishing connection:', error);
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`Attempting to reconnect (${retryCount}/${maxRetries})...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              return connectWithRetry();
            }
            throw error;
          }
        };

        return connectWithRetry();
      } catch (error) {
        console.error('Error in initializeConnection:', error);
      }
    };

    // Initialize connection and store the port
    const port = await initializeConnection();

    // Add event listener for page visibility changes
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        console.log('Page became visible, reinitializing connection...');
        await initializeConnection();
      }
    });

    // Add event listener for tab activation
    chrome.tabs.onActivated.addListener(async () => {
      console.log('Tab activated, reinitializing connection...');
      await initializeConnection();
    });

    // Initialize storage access
    const storage = chrome.storage?.sync || chrome.storage?.local;
    if (!storage) {
      console.error('Chrome storage is not available');
      return;
    }

    const providerSelect = document.getElementById('providerSelect');
    const modelSelect = document.getElementById('modelSelect');
    const groqApiKeyInput = document.getElementById('groqApiKey');
    const openaiApiKeyInput = document.getElementById('openaiApiKey');
    const testleafApiKeyInput = document.getElementById('testleafApiKey');

    // Model options by provider
    const modelsByProvider = {
      groq: [
        { value: 'deepseek-r1-distill-llama-70b', label: 'deepseek-r1-distill-llama-70b' },
        { value: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' },
        { value: 'openai/gpt-oss-120b', label: 'GPT-OSS-120B' },

      ],
      openai: [
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },

      ] 
    };
    
    // Function to update model options based on selected provider
    function updateModelOptions(provider) {
      modelSelect.innerHTML = '<option value="" disabled selected>Select the model...</option>';
      
      if (provider) {
        modelSelect.disabled = false;
        const models = modelsByProvider[provider] || [];
        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model.value;
          option.textContent = model.label;
          modelSelect.appendChild(option);
        });
      } else {
        modelSelect.disabled = true;
      }
    }
    
    // Handle provider selection
    if (providerSelect) {
      providerSelect.addEventListener('change', (e) => {
        const provider = e.target.value;
        storage.set({ selectedProvider: provider });
        updateModelOptions(provider);
        modelSelect.value = '';  // Reset model selection
        storage.set({ selectedModel: '' });  // Clear stored model selection
        updateApiKeyVisibility('');  // Hide API key inputs until model is selected
      });
    }
    
    // Save API keys when entered
    if (groqApiKeyInput) {
      groqApiKeyInput.addEventListener('change', (e) => {
        storage.set({ groqApiKey: e.target.value });
      });
    }
    
    if (openaiApiKeyInput) {
      openaiApiKeyInput.addEventListener('change', (e) => {
        storage.set({ openaiApiKey: e.target.value });
      });
    }

    if (testleafApiKeyInput) {
      testleafApiKeyInput.addEventListener('change', (e) => {
        storage.set({ testleafApiKey: e.target.value });
      });
    }
    
    if (modelSelect) {
      modelSelect.addEventListener('change', (e) => {
        storage.set({ selectedModel: e.target.value });
        updateApiKeyVisibility(e.target.value);
      });
    }

   
   
    
    // Function to update API key input visibility
    function updateApiKeyVisibility(selectedModel) {
      const groqContainer = document.getElementById('groqKeyContainer');
      const openaiContainer = document.getElementById('openaiKeyContainer');
      const testleafContainer = document.getElementById('testleafKeyContainer');

      if (providerSelect.value === 'groq') {
        groqContainer.style.display = 'block';
        openaiContainer.style.display = 'none';
        testleafContainer.style.display = 'none';

      } else  if (providerSelect.value === 'openai') {
        groqContainer.style.display = 'none';
        openaiContainer.style.display = 'block';
        testleafContainer.style.display = 'none';
      } else  {
        groqContainer.style.display = 'none';
        openaiContainer.style.display = 'none';
        testleafContainer.style.display = 'block';
      }
    }
    
    // Load saved values
    const result = await new Promise(resolve => {
      storage.get(['groqApiKey', 'openaiApiKey','testleafApiKey', 'selectedModel', 'selectedProvider'], resolve);
    });
    
    if (result.selectedProvider && providerSelect) {
      providerSelect.value = result.selectedProvider;
      updateModelOptions(result.selectedProvider);
    }
    
    if (result.groqApiKey && groqApiKeyInput) {
      groqApiKeyInput.value = result.groqApiKey;
    }
    if (result.openaiApiKey && openaiApiKeyInput) {
      openaiApiKeyInput.value = result.openaiApiKey;
    }
    if (result.testleafApiKey && testleafApiKeyInput) {
      testleafApiKeyInput.value = result.testleafApiKey;
    }
    if (result.selectedModel && modelSelect) {
      modelSelect.value = result.selectedModel;
      updateApiKeyVisibility(result.selectedModel);
    }


    // DOM copy functionality
    const getDomButton = document.getElementById('getDom');
    const toggleInspectorButton = document.getElementById('toggleInspector');
    const copySelectedDomButton = document.getElementById('copySelectedDom');
    
    let isInspectorActive = false;
    let currentPort = null;
    
    if (toggleInspectorButton) {
      toggleInspectorButton.addEventListener('click', async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
            console.log('Cannot use inspector on this page');
            return;
          }

          // Reinject scripts if needed
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['src/content/content.js']
            });
          } catch (error) {
            console.error('Error injecting scripts:', error);
          }

          // Establish new connection
          if (currentPort) {
            try {
              currentPort.disconnect();
            } catch (error) {
              console.log('Error disconnecting old port:', error);
            }
          }
          
          currentPort = chrome.tabs.connect(tab.id, { name: 'inspector-connection' });
          currentPort.onDisconnect.addListener(() => {
            console.log('Inspector connection lost');
            isInspectorActive = false;
            toggleInspectorButton.textContent = 'Toggle Inspector';
          });
          
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INSPECTOR' });
          isInspectorActive = response.isActive;
          toggleInspectorButton.textContent = isInspectorActive ? 'Stop Inspector' : 'Toggle Inspector';
        } catch (error) {
          console.error('Error toggling inspector:', error);
          isInspectorActive = false;
          toggleInspectorButton.textContent = 'Toggle Inspector';
        }
      });
    }
    
    if (copySelectedDomButton) {
      copySelectedDomButton.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTED_DOM' });
        const domContent = document.getElementById('domContent');
        if (domContent && response.dom.length > 0) {
          domContent.value = response.dom.join('\n\n');
        }
      });
    }
    
    // Listen for element selection updates
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'ELEMENTS_SELECTED' && copySelectedDomButton) {
        copySelectedDomButton.disabled = message.count === 0;
      }
    });

    if (getDomButton) {
      getDomButton.addEventListener('click', async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
              // Create a clone of the document
              const clone = document.documentElement.cloneNode(true);
              
              // Remove all script tags
              const scripts = clone.getElementsByTagName('script');
              while (scripts.length > 0) {
                scripts[0].parentNode.removeChild(scripts[0]);
              }

              // Remove all event handlers and inline scripts
              const allElements = clone.getElementsByTagName('*');
              for (let i = 0; i < allElements.length; i++) {
                const element = allElements[i];
                // Remove all event handlers
                const attrs = element.attributes;
                for (let j = attrs.length - 1; j >= 0; j--) {
                  const attrName = attrs[j].name;
                  // Remove on* event handlers
                  if (attrName.startsWith('on')) {
                    element.removeAttribute(attrName);
                  }
                }
              }

              // Remove noscript tags
              const noscripts = clone.getElementsByTagName('noscript');
              while (noscripts.length > 0) {
                noscripts[0].parentNode.removeChild(noscripts[0]);
              }

              // Clean up style tags (optional, uncomment if you want to remove styles)
              // const styles = clone.getElementsByTagName('style');
              // while (styles.length > 0) {
              //   styles[0].parentNode.removeChild(styles[0]);
              // }

              // Clean up link tags (optional, uncomment if you want to remove external resources)
              // const links = clone.getElementsByTagName('link');
              // while (links.length > 0) {
              //   links[0].parentNode.removeChild(links[0]);
              // }

              // Format the output with proper indentation
              const serializer = new XMLSerializer();
              const cleanHtml = serializer.serializeToString(clone)
                .replace(/><(?!\/)/g, '>\n<') // Add newlines between elements
                .replace(/</g, '  <'); // Add indentation

              return cleanHtml;
            }
          });
          
          const domContent = document.getElementById('domContent');
          if (domContent) {
            domContent.value = result[0].result;
          }
        } catch (error) {
          console.error('Error copying DOM:', error);
        }
      });
    }

    // Clipboard copy functionality
    const copyButton = document.getElementById('copyToClipboard');
    if (copyButton) {
      copyButton.addEventListener('click', () => {
        const domContent = document.getElementById('domContent');
        if (domContent) {
          domContent.select();
          document.execCommand('copy');
        }
      });
    }

    // Handle DOM changes
    const domChangesTextarea = document.getElementById('domChanges');
    if (domChangesTextarea) {
        // Listen for changes from background script
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'UPDATE_CHANGES') {
                const formattedChanges = message.changes
                    .map(change => {
                        return `[${change.timestamp}] ${change.type.toUpperCase()}\n` +
                               `Target: ${change.target.tagName} (${change.target.path})\n` +
                               (change.added ? `Added: ${change.added.length} nodes\n` : '') +
                               (change.removed ? `Removed: ${change.removed.length} nodes\n` : '') +
                               (change.attributeName ? `Attribute: ${change.attributeName} changed from "${change.oldValue}" to "${change.newValue}"\n` : '') +
                               '-------------------\n';
                    })
                    .join('\n');
                
                domChangesTextarea.value = formattedChanges;
                // Auto-scroll to bottom
                domChangesTextarea.scrollTop = domChangesTextarea.scrollHeight;
            }
        });
    }

    // Cleanup when window is closed
    window.addEventListener('unload', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'CLEANUP' });
          } catch (error) {
            // Ignore connection errors during cleanup
            console.log('Cleanup message not sent:', error);
          }
        }
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    });
  } catch (error) {
    console.error('Error initializing extension:', error);
  }
}); 