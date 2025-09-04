import { messageManagerAPI } from "./messageManager.js";
import { llm } from "./llm/index.js";
import { PREFS, debugLog, debugError } from "./utils/prefs.js";
import { parseElement, escapeXmlAttribute } from "./utils/parse.js";
import { SettingsModal } from "./settings.js";

var markdownStylesInjected = false;
const injectMarkdownStyles = async () => {
  try {
    const { markedStyles } = await import("chrome://userscripts/content/engine/marked.js");
    const styleTag = parseElement(`<style>${markedStyles}<style>`);
    document.head.appendChild(styleTag);
    markdownStylesInjected = true;
    return true;
  } catch (e) {
    debugError(e);
    return false;
  }
};

function parseMD(markdown) {
  const markedOptions = { breaks: true, gfm: true };
  if (!markdownStylesInjected) {
    injectMarkdownStyles();
  }
  const content = window.marked ? window.marked.parse(markdown, markedOptions) : markdown;
  let htmlContent = parseElement(`<div class="markdown-body">${content}</div>`);

  return htmlContent;
}

PREFS.setInitialPrefs();
const browserBotfindbar = {
  findbar: null,
  expandButton: null,
  chatContainer: null,
  apiKeyContainer: null,
  _updateFindbar: null,
  _addKeymaps: null,
  _handleInputKeyPress: null,
  _handleFindFieldInput: null,
  _isExpanded: false,
  _updateContextMenuText: null,
  _godModeListener: null,
  _citationsListener: null,
  _contextMenuEnabledListener: null,
  _persistListener: null,
  _minimalListener: null,
  _dndListener: null,
  contextMenuItem: null,
  _matchesObserver: null,
  _isDragging: false,
  _startDrag: null,
  _stopDrag: null,
  _handleDrag: null,
  _initialContainerCoor: { x: null, y: null },
  _initialMouseCoor: { x: null, y: null },
  _startWidth: null,
  _resizeHandle: null,
  _isResizing: false,
  _startResize: null,
  _stopResize: null,
  _handleResize: null,
  _handleResizeEnd: null,
  _toolConfirmationDialog: null,

  get expanded() {
    return this._isExpanded;
  },
  set expanded(value) {
    const isChanged = value !== this._isExpanded;
    this._isExpanded = value;
    if (!this.findbar) return;
    this.findbar.expanded = value;

    if (value) {
      this.findbar.classList.add("ai-expanded");
      this.show();
      this.showAIInterface();
      if (isChanged) this.focusPrompt();
      const messagesContainer = this?.chatContainer?.querySelector("#chat-messages");
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    } else {
      this.findbar.classList.remove("ai-expanded");
      this.removeAIInterface();
      if (isChanged && !this.minimal) this.focusInput();
    }
  },
  toggleExpanded() {
    this.expanded = !this.expanded;
  },

  get enabled() {
    return PREFS.enabled;
  },
  set enabled(value) {
    if (typeof value === "boolean") PREFS.enabled = value;
  },
  toggleEnabled() {
    this.enabled = !this.enabled;
  },
  handleEnabledChange(enabled) {
    if (enabled.value) this.init();
    else this.destroy();
  },

  get minimal() {
    return PREFS.minimal;
  },
  set minimal(value) {
    if (typeof value === "boolean") PREFS.minimal = value;
  },

  handleMinimalPrefChange: function () {
    this.removeExpandButton();
    this.addExpandButton();
    this.removeAIInterface();
    this.showAIInterface();
  },

  createToolConfirmationDialog(toolNames) {
    return new Promise((resolve) => {
      const dialog = parseElement(`
        <div class="tool-confirmation-dialog">
          <div class="tool-confirmation-content">
            <p>Allow the following tools to run: ${toolNames?.join(", ")}?</p>
            <div class="buttons">
              <button class="not-again">Don't ask again</button>
              <div class="right-side-buttons">
                <button class="confirm-tool">Yes</button>
                <button class="cancel-tool">No</button>
              </div>
            </div>
          </div>
        </div>
      `);
      this._toolConfirmationDialog = dialog;

      const removeDilog = () => {
        dialog.remove();
        this._toolConfirmationDialog = null;
      };

      const confirmButton = dialog.querySelector(".confirm-tool");
      confirmButton.addEventListener("click", () => {
        removeDilog();
        resolve(true);
      });

      const cancelButton = dialog.querySelector(".cancel-tool");
      cancelButton.addEventListener("click", () => {
        removeDilog();
        resolve(false);
      });

      const notAgainButton = dialog.querySelector(".not-again");
      notAgainButton.addEventListener("click", () => {
        removeDilog();
        PREFS.conformation = false;
        resolve(true);
      });

      document.body.appendChild(dialog);
    });
  },

  updateFindbar() {
    SettingsModal.hide();
    this.removeExpandButton();
    this.removeAIInterface();
    this.disableResize();
    if (!PREFS.persistChat) {
      this.hide();
      this.expanded = false;
      this.clear();
    }
    gBrowser.getFindBar().then((findbar) => {
      this.findbar = findbar;
      this.addExpandButton();
      if (PREFS.persistChat) {
        if (this?.findbar?.history) {
          llm.history = this.findbar.history;
          if (
            this?.findbar?.aiStatus &&
            JSON.stringify(this.aiStatus) !== JSON.stringify(this.findbar.aiStatus)
          ) {
            llm.history = [];
            this.findbar.history = [];
          }
        } else llm.history = [];
        if (this?.findbar?.expanded && !this?.findbar?.hidden) {
          setTimeout(() => (this.expanded = true), 200);
        } else {
          this.hide();
          this.expanded = false;
        }
      } else {
        this.hide();
        this.expanded = false;
      }
      this.updateFindbarStatus();
      setTimeout(() => {
        if (PREFS.dndEnabled) this.enableResize();
      }, 0);
      setTimeout(() => this.updateFoundMatchesDisplay(), 0);
      this.findbar._findField.removeEventListener("keypress", this._handleInputKeyPress);
      this.findbar._findField.addEventListener("keypress", this._handleInputKeyPress);
      this.findbar._findField.removeEventListener("input", this._handleFindFieldInput);
      this.findbar._findField.addEventListener("input", this._handleFindFieldInput);

      const originalOnFindbarOpen = this.findbar.browser.finder.onFindbarOpen;
      const originalOnFindbarClose = this.findbar.browser.finder.onFindbarClose;

      //making sure this only runs one time
      if (!findbar?.openOverWritten) {
        //update placeholder when findbar is opened
        findbar.browser.finder.onFindbarOpen = (...args) => {
          originalOnFindbarOpen.apply(findbar.browser.finder, args); //making sure original function is called
          if (this.enabled) {
            debugLog("Findbar is being opened");
            setTimeout(
              () => (this.findbar._findField.placeholder = "Press Alt + Enter to ask AI"),
              100
            );
          }
        };
        findbar.browser.finder.onFindbarClose = (...args) => {
          originalOnFindbarClose.apply(findbar.browser.finder, args);
          if (this.enabled) {
            debugLog("Findbar is being closed");
          }
        };
        findbar.openOverWritten = true;
      }
    });
  },

  highlight(word) {
    if (!this.findbar) return;
    this.findbar._find(word);
    setTimeout(() => {
      this.findbar.browser.finder.highlight(false);
    }, 2000);
  },

  show() {
    if (!this.findbar) return false;
    this.findbar.open();
    this.focusInput();
    return true;
  },
  hide() {
    if (!this.findbar) return false;
    this.findbar.close();
    this.findbar.toggleHighlight(false);
    return true;
  },
  toggleVisibility() {
    if (!this.findbar) return;
    if (this.findbar.hidden) this.show();
    else this.hide();
  },

  clear() {
    llm.clearData();
    if (this.findbar) {
      this.findbar.history = null;
    }
    const messages = this?.chatContainer?.querySelector("#chat-messages");
    if (messages) messages.innerHTML = "";
  },

  aiStatus: {
    citationsEnabled: PREFS.citationsEnabled,
    godMode: PREFS.godMode,
  },
  updateFindbarStatus() {
    this.aiStatus = {
      godMode: PREFS.godMode,
      citationsEnabled: PREFS.citationsEnabled,
    };
    if (this.findbar) this.findbar.aiStatus = this.aiStatus;
  },

  createAPIKeyInterface() {
    const currentProviderName = llm.currentProvider.name;
    const menuItems = Object.entries(llm.AVAILABLE_PROVIDERS)
      .map(
        ([name, provider]) => `
                  <menuitem
                    value="${name}"
                    label="${escapeXmlAttribute(provider.label)}"
                    ${name === currentProviderName ? 'selected="true"' : ""}
                    ${provider.faviconUrl ? `image="${escapeXmlAttribute(provider.faviconUrl)}"` : ""}
                  />
                `
      )
      .join("");

    const menulistXul = `
        <menulist id="provider-selector" class="provider-selector" value="${currentProviderName}">
          <menupopup>
            ${menuItems}
          </menupopup>
        </menulist>`;

    const providerSelectorXulElement = parseElement(menulistXul, "xul");

    const html = `
        <div class="browse-bot-setup">
          <div class="ai-setup-content">
            <h3>AI Setup Required</h3>
            <p>To use AI features, you need to set up your API key and select a provider.</p>
            <div class="provider-selection-group">
              <label for="provider-selector">Select Provider:</label>
            </div>
            <div class="api-key-input-group">
              <input type="password" id="api-key" placeholder="Enter your API key" />
              <button id="save-api-key">Save</button>
            </div>
            <div class="api-key-links">
              <button id="get-api-key-link">Get API Key</button>
            </div>
          </div>
        </div>`;
    const container = parseElement(html);

    const providerSelectionGroup = container.querySelector(".provider-selection-group");
    // Insert the XUL menulist after the label within the group
    providerSelectionGroup.appendChild(providerSelectorXulElement);

    const providerSelector = container.querySelector("#provider-selector");
    const input = container.querySelector("#api-key");
    const saveBtn = container.querySelector("#save-api-key");
    const getApiKeyLink = container.querySelector("#get-api-key-link");

    // Initialize the input and link based on the currently selected provider
    input.value = llm.currentProvider.apiKey || "";
    getApiKeyLink.disabled = !llm.currentProvider.apiKeyUrl;
    getApiKeyLink.title = llm.currentProvider.apiKeyUrl
      ? "Get API Key"
      : "No API key link available for this provider.";

    // Use 'command' event for XUL menulist
    providerSelector.addEventListener("command", (e) => {
      const selectedProviderName = e.target.value;
      llm.setProvider(selectedProviderName); // This also updates PREFS.llmProvider internally
      input.value = llm.currentProvider.apiKey || "";
      getApiKeyLink.disabled = !llm.currentProvider.apiKeyUrl;
      getApiKeyLink.title = llm.currentProvider.apiKeyUrl
        ? "Get API Key"
        : "No API key link available for this provider.";
    });

    getApiKeyLink.addEventListener("click", () => {
      openTrustedLinkIn(llm.currentProvider.apiKeyUrl, "tab");
    });

    saveBtn.addEventListener("click", () => {
      const key = input.value.trim();
      if (key) {
        llm.currentProvider.apiKey = key; // This also updates PREFS.mistralApiKey/geminiApiKey internally
        this.showAIInterface(); // Refresh UI after saving key
      }
    });
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") saveBtn.click();
    });
    return container;
  },

  async sendMessage(prompt) {
    if (!prompt) return;

    this.show();
    this.expanded = true;

    const pageContext = {
      url: gBrowser.currentURI.spec,
      title: gBrowser.selectedBrowser.contentTitle,
    };

    this.addChatMessage({ answer: prompt }, "user");

    const loadingIndicator = this.createLoadingIndicator();
    const messagesContainer = this.chatContainer.querySelector("#chat-messages");
    if (messagesContainer) {
      messagesContainer.appendChild(loadingIndicator);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    try {
      const response = await llm.sendMessage(prompt, pageContext);
      if (response && response.answer) {
        this.addChatMessage(response, "ai");
      }
    } catch (e) {
      this.addChatMessage({ answer: `Error: ${e.message}` }, "error");
    } finally {
      loadingIndicator.remove();
      this.focusPrompt();
      if (PREFS.persistChat) this.findbar.history = llm.getHistory();
    }
  },

  createChatInterface() {
    const chatInputGroup = `<div class="ai-chat-input-group">
          <textarea id="ai-prompt" placeholder="Ask AI anything..." rows="2"></textarea>
          <button id="send-prompt" class="send-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path fill="currentColor" d="M17.991 6.01L5.399 10.563l4.195 2.428l3.699-3.7a1 1 0 0 1 1.414 1.415l-3.7 3.7l2.43 4.194L17.99 6.01Zm.323-2.244c1.195-.433 2.353.725 1.92 1.92l-5.282 14.605c-.434 1.198-2.07 1.344-2.709.241l-3.217-5.558l-5.558-3.217c-1.103-.639-.957-2.275.241-2.709z" />
            </svg>
          </button>
        </div>`;

    const container = parseElement(`
        <div class="browse-bot-chat">
          <div class="ai-chat-header">
            <div class="findbar-drag-handle"></div>
          </div>
          <div class="ai-chat-messages" id="chat-messages"></div>
          ${chatInputGroup}
        </div>`);

    const chatHeader = container.querySelector(".ai-chat-header");

    const clearBtn = parseElement(
      `
        <toolbarbutton 
          id="clear-chat" 
          class="clear-chat-btn" 
          image="chrome://global/skin/icons/delete.svg" 
          tooltiptext="Clear Chat"
        />`,
      "xul"
    );

    const settingsBtn = parseElement(
      `
        <toolbarbutton 
          id="open-settings-btn" 
          class="settings-btn" 
          image="chrome://global/skin/icons/settings.svg" 
          tooltiptext="Settings"
        />`,
      "xul"
    );

    const collapseBtn = parseElement(
      `
        <toolbarbutton 
          id="findbar-collapse-btn" 
          class="findbar-collapse-btn" 
          image="chrome://browser/skin/zen-icons/unpin.svg" 
          tooltiptext="Collapse"
        />`,
      "xul"
    );

    chatHeader.appendChild(clearBtn);
    chatHeader.appendChild(settingsBtn);
    chatHeader.appendChild(collapseBtn);

    const chatMessages = container.querySelector("#chat-messages");

    const promptInput = container.querySelector("#ai-prompt");
    const sendBtn = container.querySelector("#send-prompt");
    const handleSend = () => this.sendMessage(promptInput.value.trim());
    sendBtn.addEventListener("click", handleSend);
    promptInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    clearBtn.addEventListener("click", () => {
      this.clear();
      this.expanded = false;
    });

    settingsBtn.addEventListener("click", () => {
      SettingsModal.show();
    });

    collapseBtn.addEventListener("click", () => {
      this.expanded = false;
    });

    chatMessages.addEventListener("click", async (e) => {
      if (e.target.classList.contains("citation-link")) {
        const button = e.target;
        const citationId = button.dataset.citationId;
        const messageEl = button.closest(".chat-message[data-citations]");

        if (messageEl) {
          const citations = JSON.parse(messageEl.dataset.citations);
          const citation = citations.find((c) => c.id == citationId);
          if (citation && citation.source_quote) {
            debugLog(
              `Citation [${citationId}] clicked. Requesting highlight for:`,
              citation.source_quote
            );
            this.highlight(citation.source_quote);
          }
        }
      } else if (e.target?.href) {
        e.preventDefault();
        try {
          openTrustedLinkIn(e.target.href, "tab");
        } catch (e) {}
      }
    });

    return container;
  },

  createLoadingIndicator() {
    const messageDiv = parseElement(`<div class="chat-message chat-message-loading"></div>`);
    const contentDiv = parseElement(`<div class="message-content">Loading...</div>`);
    messageDiv.appendChild(contentDiv);
    return messageDiv;
  },

  addChatMessage(response, type) {
    const { answer, citations } = response;
    if (!this.chatContainer || !answer) return;
    const messagesContainer = this.chatContainer.querySelector("#chat-messages");
    if (!messagesContainer) return;

    const messageDiv = parseElement(`<div class="chat-message chat-message-${type}"></div>`);
    if (citations && citations.length > 0) {
      messageDiv.dataset.citations = JSON.stringify(citations);
    }

    const contentDiv = parseElement(`<div class="message-content"></div>`);
    const processedContent = answer.replace(
      /\[(\d+)\]/g,
      `<button class="citation-link" data-citation-id="$1">[$1]</button>`
    );
    contentDiv.appendChild(parseMD(processedContent));

    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  },

  showAIInterface() {
    if (!this.findbar) return;
    this.removeAIInterface(); // Removes API key, chat, and settings interfaces

    // Remove settings modal class from findbar as it's now a separate modal
    this.findbar.classList.remove("ai-settings-active");

    if (!llm.currentProvider.apiKey) {
      this.apiKeyContainer = this.createAPIKeyInterface();
      this.findbar.insertBefore(this.apiKeyContainer, this.findbar.firstChild);
    } else {
      this.chatContainer = this.createChatInterface();
      if (PREFS.dndEnabled) this.enableDND();
      const history = llm.getHistory();
      for (const message of history) {
        if (
          message?.role === "tool" ||
          (message?.parts && message?.parts.some((p) => p.functionCall))
        )
          continue;

        const isModel = message?.role === "model";
        const textContent = message?.parts[0]?.text;
        if (!textContent) continue;

        let responsePayload = { answer: "" };

        if (isModel && PREFS.citationsEnabled) {
          responsePayload = llm.parseModelResponseText(textContent);
        } else {
          responsePayload.answer = textContent.replace(/\[Current Page Context:.*?\]\s*/, "");
        }

        if (responsePayload.answer) {
          this.addChatMessage(responsePayload, isModel ? "ai" : "user");
        }
      }
      this.findbar.insertBefore(this.chatContainer, this.findbar.firstChild);
    }
  },

  focusInput() {
    if (this.findbar) setTimeout(() => this.findbar._findField.focus(), 10);
  },
  focusPrompt() {
    const promptInput = this.chatContainer?.querySelector("#ai-prompt");
    if (promptInput) setTimeout(() => promptInput.focus(), 10);
  },
  setPromptText(text) {
    const promptInput = this?.chatContainer?.querySelector("#ai-prompt");
    if (promptInput && text) promptInput.value = text;
  },
  async setPromptTextFromSelection() {
    let text = "";
    const selection = await messageManagerAPI.getSelectedText();
    if (!selection || !selection.hasSelection) text = this?.findbar?._findField?.value;
    else text = selection.selectedText;
    this.setPromptText(text);
  },

  removeAIInterface() {
    if (this.apiKeyContainer) {
      this.apiKeyContainer.remove();
      this.apiKeyContainer = null;
    }
    if (this.chatContainer) {
      this.chatContainer.remove();
      this.chatContainer = null;
    }
  },

  init() {
    if (!this.enabled) return;
    this.updateFindbar();
    this.addListeners();
    if (PREFS.contextMenuEnabled) {
      this.addContextMenuItem();
    }
  },
  destroy() {
    this.findbar = null;
    this.expanded = false;
    try {
      this.removeListeners();
    } catch {}
    this.removeExpandButton();
    this.removeContextMenuItem();
    this.removeAIInterface();
    this._toolConfirmationDialog?.remove();
    this._toolConfirmationDialog = null;
    SettingsModal.hide();
  },

  addExpandButton() {
    if (!this.findbar) return false;

    // Always remove both buttons before adding the correct one
    this.removeExpandButton();

    if (this.minimal) {
      const container = this.findbar.querySelector(".findbar-container");
      if (container && !container.querySelector("#findbar-ask")) {
        const askBtn = parseElement(`<button id="findbar-ask" anonid="findbar-ask">Ask</button>`);
        askBtn.addEventListener("click", () => {
          const inpText = this.findbar._findField.value.trim();
          this.sendMessage(inpText);
          this.findbar._findField.value = "";
          this.focusInput();
        });
        container.appendChild(askBtn);
        this.askButton = askBtn;
      }
    } else {
      const button_id = "findbar-expand";
      const button = parseElement(
        `<button id="${button_id}" anonid="${button_id}">Expand</button>`
      );
      button.addEventListener("click", () => this.toggleExpanded());
      button.textContent = "Expand";
      this.findbar.appendChild(button);
      this.expandButton = button;
    }
    return true;
  },

  removeExpandButton() {
    if (this.askButton) {
      this.askButton.remove();
      this.askButton = null;
    }
    if (this.expandButton) {
      this.expandButton.remove();
      this.expandButton = null;
    }
    return true;
  },

  handleInputKeyPress: function (e) {
    if (e?.key === "Enter" && e?.altKey) {
      e.preventDefault();
      const inpText = this.findbar._findField.value.trim();
      this.sendMessage(inpText);
      this.findbar._findField.value = "";
      this.focusInput();
    }
  },

  addContextMenuItem(retryCount = 0) {
    if (this.contextMenuItem) return; // Already added
    if (!PREFS.contextMenuEnabled) return;

    const contextMenu = document.getElementById("contentAreaContextMenu");

    if (!contextMenu) {
      if (retryCount < 5) {
        debugLog(`Context menu not found, retrying... (attempt ${retryCount + 1}/5)`);
        setTimeout(() => this.addContextMenuItem(retryCount + 1), 200);
      } else {
        debugError("Failed to add context menu item after 5 attempts: Context menu not found.");
      }
      return;
    }

    const menuItem = document.createXULElement("menuitem");
    menuItem.id = "browse-bot-context-menu-item";
    menuItem.setAttribute("label", "Ask AI");
    menuItem.setAttribute("accesskey", "A");

    menuItem.addEventListener("command", this.handleContextMenuClick.bind(this));
    this.contextMenuItem = menuItem;

    const searchSelectItem = contextMenu.querySelector("#context-searchselect");

    if (searchSelectItem) {
      // Insert right after the searchselect item
      if (searchSelectItem.nextSibling) {
        contextMenu.insertBefore(menuItem, searchSelectItem.nextSibling);
      } else {
        contextMenu.appendChild(menuItem);
      }
    } else {
      // Fallback: insert after context-sep-redo separator
      const redoSeparator = contextMenu.querySelector("#context-sep-redo");
      if (redoSeparator) {
        if (redoSeparator.nextSibling) {
          contextMenu.insertBefore(menuItem, redoSeparator.nextSibling);
        } else {
          contextMenu.appendChild(menuItem);
        }
      } else {
        // Final fallback: don't add the menu item if neither element is found
        return;
      }
    }

    this._updateContextMenuText = this.updateContextMenuText.bind(this);
    contextMenu.addEventListener("popupshowing", this._updateContextMenuText);
  },

  removeContextMenuItem: function () {
    this?.contextMenuItem?.remove();
    this.contextMenuItem = null;
    document
      ?.getElementById("contentAreaContextMenu")
      ?.removeEventListener("popupshowing", this._updateContextMenuText);
  },
  handleContextMenuClick: async function () {
    const selection = await messageManagerAPI.getSelectedText();
    let finalMessage = "";
    if (!selection.hasSelection) {
      finalMessage = "Summarize current page";
    } else {
      finalMessage += "Explain this in context of current page\n";
      const selectedTextFormatted = selection?.selectedText
        ?.split("\n")
        ?.map((line) => line.trim())
        ?.filter((line) => line.length > 0)
        ?.map((line) => "> " + line)
        ?.join("\n");

      finalMessage += selectedTextFormatted;
    }
    this.expanded = true;
    if (PREFS.contextMenuAutoSend) {
      this.sendMessage(finalMessage);
      this.focusPrompt();
    } else {
      this.setPromptText(finalMessage);
      this.show();
      this.focusPrompt();
    }
  },

  handleContextMenuPrefChange: function (pref) {
    if (pref.value) this.addContextMenuItem();
    else this.removeContextMenuItem();
  },
  updateContextMenuText() {
    if (!PREFS.contextMenuEnabled) return;
    if (!this.contextMenuItem) return;
    const hasSelection = gContextMenu?.isTextSelected === true;
    this.contextMenuItem.label = hasSelection ? "Ask AI" : "Summarize with AI";
  },

  enableResize() {
    if (!this.findbar) return;
    if (this._resizeHandle) return;
    const resizeHandle = parseElement(`<div class="findbar-resize-handle"></div>`);
    this.findbar.appendChild(resizeHandle);
    this._resizeHandle = resizeHandle;
    this._startResize = this.startResize.bind(this);
    this._resizeHandle.addEventListener("mousedown", this._startResize);
  },

  startResize(e) {
    if (e.button !== 0) return;
    if (!this.findbar) return;
    this._isResizing = true;
    this._initialMouseCoor = { x: e.clientX, y: e.clientY };
    const rect = this.findbar.getBoundingClientRect();
    this.startWidth = rect.width;
    this._handleResize = this.doResize.bind(this);
    this._stopResize = this.stopResize.bind(this);
    document.addEventListener("mousemove", this._handleResize);
    document.addEventListener("mouseup", this._stopResize);
  },

  doResize(e) {
    if (!this._isResizing) return;
    if (!this.findbar) return;
    const minWidth = 300;
    const maxWidth = 800;
    const directionFactor = PREFS.position.includes("right") ? -1 : 1;
    let newWidth = this.startWidth + (e.clientX - this._initialMouseCoor.x) * directionFactor;
    newWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
    this.findbar.style.width = `${newWidth}px`;
  },

  stopResize() {
    this._isResizing = false;
    document.removeEventListener("mousemove", this._handleResize);
    document.removeEventListener("mouseup", this._stopResize);
    this._handleResize = null;
    this._stopResize = null;
  },
  disableResize() {
    this._resizeHandle?.remove();
    this._resizeHandle = null;
    this.stopResize();
  },

  startDrag(e) {
    if (!this.chatContainer) return;
    if (e.button !== 0) return;
    this._isDragging = true;
    this._initialMouseCoor = { x: e.clientX, y: e.clientY };
    const rect = this.findbar.getBoundingClientRect();
    this._initialContainerCoor = { x: rect.left, y: rect.top };
    this._handleDrag = this.doDrag.bind(this);
    this._stopDrag = this.stopDrag.bind(this);
    document.addEventListener("mousemove", this._handleDrag);
    document.addEventListener("mouseup", this._stopDrag);
  },

  doDrag(e) {
    if (!this._isDragging) return;

    const minCoors = { x: 15, y: 35 };
    const rect = this.findbar.getBoundingClientRect();
    const maxCoors = {
      x: window.innerWidth - rect.width - 33,
      y: window.innerHeight - rect.height - 33,
    };
    const newCoors = {
      x: this._initialContainerCoor.x + (e.clientX - this._initialMouseCoor.x),
      y: this._initialContainerCoor.y + (e.clientY - this._initialMouseCoor.y),
    };

    if (
      gZenCompactModeManager &&
      !gZenCompactModeManager?.preference &&
      !gZenCompactModeManager.sidebarIsOnRight
    ) {
      newCoors.x -= gZenCompactModeManager.getAndApplySidebarWidth(); // deduct sidebar width if not sidebar is visible on right
    }
    newCoors.x = Math.max(minCoors.x, Math.min(newCoors.x, maxCoors.x));
    newCoors.y = Math.max(minCoors.y, Math.min(newCoors.y, maxCoors.y));

    this.findbar.style.setProperty("left", `${newCoors.x}px`, "important");
    this.findbar.style.setProperty("top", `${newCoors.y}px`, "important");
    this.findbar.style.setProperty("right", "unset", "important");
    this.findbar.style.setProperty("bottom", "unset", "important");
  },

  stopDrag() {
    this._isDragging = false;
    this.snapToClosestCorner();
    this._initialMouseCoor = { x: null, y: null };
    this._initialContainerCoor = { x: null, y: null };
    document.removeEventListener("mouseup", this._stopDrag);
    document.removeEventListener("mousemove", this._handleDrag);
    this._handleDrag = null;
    this._stopDrag = null;
  },

  snapToClosestCorner() {
    if (!this.findbar || !PREFS.dndEnabled) return;

    const rect = this.findbar.getBoundingClientRect();
    const currentX = rect.left;
    const currentY = rect.top;
    const findbarWidth = rect.width;
    const findbarHeight = rect.height;

    const snapPoints = {
      "top-left": { x: 0, y: 0 },
      "top-right": { x: window.innerWidth - findbarWidth, y: 0 },
      "bottom-left": { x: 0, y: window.innerHeight - findbarHeight },
      "bottom-right": {
        x: window.innerWidth - findbarWidth,
        y: window.innerHeight - findbarHeight,
      },
    };

    let closestPointName = PREFS.position;
    let minDistance = Infinity;

    for (const name in snapPoints) {
      const p = snapPoints[name];
      const distance = Math.sqrt(Math.pow(currentX - p.x, 2) + Math.pow(currentY - p.y, 2));

      if (distance < minDistance) {
        minDistance = distance;
        closestPointName = name;
      }
    }

    // Update preference if position changed
    if (closestPointName !== PREFS.position) {
      PREFS.position = closestPointName;
    }
    this.findbar.style.removeProperty("left");
    this.findbar.style.removeProperty("top");
    this.findbar.style.removeProperty("bottom");
    this.findbar.style.removeProperty("right");
    // this.applyFindbarPosition(closestPointName);
  },
  enableDND() {
    if (!this.chatContainer) return;
    const handle = this.chatContainer.querySelector(".findbar-drag-handle");
    if (!handle) return;
    this._startDrag = this.startDrag.bind(this);
    handle.addEventListener("mousedown", this._startDrag);
  },
  disableDND() {
    this._isDragging = false;
    if (!this.chatContainer) return;
    const handle = this.chatContainer.querySelector(".findbar-drag-handle");
    if (!handle) return;
    handle.removeEventListener("mousedown", this._startDrag);
    document.removeEventListener("mouseup", this._stopDrag);
    document.removeEventListener("mousemove", this._handleDrag);
    this._startDrag = null;
    this._stopDrag = null;
  },

  addKeymaps: function (e) {
    if (e.key && e.key.toLowerCase() === "f" && e.ctrlKey && e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      this.expanded = true;
      this.show();
      this.focusPrompt();
      this.setPromptTextFromSelection();
    }
    if (e.key?.toLowerCase() === "escape") {
      if (SettingsModal._modalElement && SettingsModal._modalElement.parentNode) {
        e.preventDefault();
        e.stopPropagation();
        SettingsModal.hide();
      } else if (this._toolConfirmationDialog) {
        const cancelButton = this._toolConfirmationDialog.querySelector(".cancel-tool");
        cancelButton?.click();
      } else if (this.expanded) {
        e.preventDefault();
        e.stopPropagation();
        this.expanded = false;
        this.focusInput();
      }
    }
  },

  addListeners() {
    this._updateFindbar = this.updateFindbar.bind(this);
    this._addKeymaps = this.addKeymaps.bind(this);
    this._handleInputKeyPress = this.handleInputKeyPress.bind(this);
    this._handleFindFieldInput = this.updateFoundMatchesDisplay.bind(this);
    const _clearLLMData = () => {
      this.updateFindbarStatus();
      this.clear();
    };
    const _handleContextMenuPrefChange = this.handleContextMenuPrefChange.bind(this);
    const _handleMinimalPrefChange = this.handleMinimalPrefChange.bind(this);

    gBrowser.tabContainer.addEventListener("TabSelect", this._updateFindbar);
    document.addEventListener("keydown", this._addKeymaps);
    this._godModeListener = UC_API.Prefs.addListener(PREFS.GOD_MODE, _clearLLMData);
    this._citationsListener = UC_API.Prefs.addListener(PREFS.CITATIONS_ENABLED, _clearLLMData);
    this._minimalListener = UC_API.Prefs.addListener(PREFS.MINIMAL, _handleMinimalPrefChange);
    this._contextMenuEnabledListener = UC_API.Prefs.addListener(
      PREFS.CONTEXT_MENU_ENABLED,
      _handleContextMenuPrefChange
    );
    this._persistListener = UC_API.Prefs.addListener(PREFS.PERSIST, (pref) => {
      if (!this.findbar) return;
      if (pref.value) this.findbar.history = llm.history;
      else this.findbar.history = null;
    });
    this._dndListener = UC_API.Prefs.addListener(PREFS.DND_ENABLED, (pref) => {
      if (pref.value) {
        this.enableDND();
        this.enableResize();
      } else {
        this.disableDND();
        this.disableResize();
      }
    });
  },

  removeListeners() {
    if (this.findbar) {
      this.findbar._findField.removeEventListener("keypress", this._handleInputKeyPress);
      this.findbar._findField.removeEventListener("input", this._handleFindFieldInput);
    }
    gBrowser.tabContainer.removeEventListener("TabSelect", this._updateFindbar);
    document.removeEventListener("keydown", this._addKeymaps);
    UC_API.Prefs.removeListener(this._godModeListener);
    UC_API.Prefs.removeListener(this._citationsListener);
    UC_API.Prefs.removeListener(this._contextMenuEnabledListener);
    UC_API.Prefs.removeListener(this._minimalListener);
    UC_API.Prefs.removeListener(this._persistListener);
    UC_API.Prefs.removeListener(this._dndListener);
    this.disableDND();

    // Disconnect the MutationObserver when listeners are removed
    if (this._matchesObserver) {
      this._matchesObserver.disconnect();
      this._matchesObserver = null;
    }

    this._handleInputKeyPress = null;
    this._handleFindFieldInput = null;
    this._updateFindbar = null;
    this._addKeymaps = null;
    this._godModeListener = null;
    this._citationsListener = null;
    this._contextMenuEnabledListener = null;
    this._minimalListener = null;
    this._dndListener = null;
  },

  updateFoundMatchesDisplay(retry = 0) {
    if (!this.findbar) return;
    const matches = this.findbar.querySelector(".found-matches");
    const status = this.findbar.querySelector(".findbar-find-status");
    const wrapper = this.findbar.querySelector('hbox[anonid="findbar-textbox-wrapper"]');
    if (!wrapper) {
      if (retry < 10) setTimeout(() => this.updateFoundMatchesDisplay(retry + 1), 100);
      return;
    }
    if (matches && matches.parentElement !== wrapper) wrapper.appendChild(matches);
    if (status && status.parentElement !== wrapper) wrapper.appendChild(status);

    if (status && status.getAttribute("status") === "notfound") {
      status.setAttribute("value", "0/0");
      status.textContent = "0/0";
    }

    if (matches) {
      const labelChild = matches.querySelector("label");
      let labelValue = labelChild
        ? labelChild.getAttribute("value")
        : matches.getAttribute("value");
      let newLabel = "";
      if (labelValue) {
        let normalized = labelValue.replace(/(\d+)\s+of\s+(\d+)(?:\s+match(?:es)?)?/i, "$1/$2");
        newLabel = normalized === "1/1" ? "1/1" : normalized;
      }
      if (labelChild) {
        if (labelChild.getAttribute("value") !== newLabel)
          labelChild.setAttribute("value", newLabel);
        if (labelChild.textContent !== newLabel) labelChild.textContent = newLabel;
      } else {
        if (matches.getAttribute("value") !== newLabel) matches.setAttribute("value", newLabel);
        if (matches.textContent !== newLabel) matches.textContent = newLabel;
      }

      // Disconnect existing observer before creating a new one
      if (this._matchesObserver) this._matchesObserver.disconnect();

      const observer = new MutationObserver(() => this.updateFoundMatchesDisplay());
      observer.observe(matches, {
        attributes: true,
        attributeFilter: ["value"],
      });
      if (labelChild)
        observer.observe(labelChild, {
          attributes: true,
          attributeFilter: ["value"],
        });
      if (status)
        observer.observe(status, {
          attributes: true,
          attributeFilter: ["status", "value"],
        });
      this._matchesObserver = observer;
    }
  },
};

UC_API.Runtime.startupFinished().then(() => {
  browserBotfindbar.init();
  UC_API.Prefs.addListener(
    PREFS.ENABLED,
    browserBotfindbar.handleEnabledChange.bind(browserBotfindbar)
  );
  window.browserBotFindbar = browserBotfindbar;
});
