class VoiceChatbot {
  constructor() {
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recognition = null;
    this.recordingTimer = null;
    this.recordingStartTime = null;
    this.conversation = [];
    this.permissionStatus = "requesting"; // requesting, granted, denied
    this.settings = {
      apiKeys: {
        openai: "",
        perplexity: "",
        anthropic: "",
      },
      language: "en-US",
      audioFormat: "wav",
      sampleRate: 44100,
      theme: "system",
    };

    this.aiModels = {
      openai: {
        name: "OpenAI GPT-4",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4",
        description: "Advanced general-purpose AI model",
      },
      perplexity: {
        name: "Perplexity AI",
        endpoint: "https://api.perplexity.ai/chat/completions",
        model: "sonar-pro",
        description: "AI with real-time web search capabilities",
      },
      anthropic: {
        name: "Anthropic Claude",
        endpoint: "https://api.anthropic.com/v1/messages",
        model: "claude-3-sonnet-20240229",
        description: "Thoughtful and analytical AI assistant",
      },
    };

    this.initializeApp();
  }

  initializeApp() {
    this.loadSettings();
    this.setupEventListeners();
    this.initializeSpeechRecognition();
    this.updateUI();
    // Auto-request microphone permissions on startup
    this.requestMicrophonePermission();
  }

  loadSettings() {
    // Load settings from memory (no localStorage due to sandbox restrictions)
    // Settings will persist during the session but not between page reloads
    console.log("Settings loaded from memory");
  }

  saveSettings() {
    // Save settings to memory only
    console.log("Settings saved to memory");
    this.showToast("Settings saved successfully!", "success");
  }

  setupEventListeners() {
    // Text input handling
    const textInput = document.getElementById("textInput");
    const sendTextBtn = document.getElementById("sendTextBtn");
    const characterCount = document.getElementById("characterCount");

    textInput.addEventListener("input", () => this.updateCharacterCount());
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });
    sendTextBtn.addEventListener("click", () => this.sendTextMessage());

    // Grant permission button
    const grantPermissionBtn = document.getElementById("grantPermissionBtn");
    grantPermissionBtn.addEventListener("click", () =>
      this.requestMicrophonePermission()
    );

    // Recording button
    const recordBtn = document.getElementById("recordBtn");
    recordBtn.addEventListener("click", () => this.toggleRecording());

    // Settings modal
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settingsModal");
    const closeSettingsBtn = document.getElementById("closeSettingsBtn");
    const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
    const saveSettingsBtn = document.getElementById("saveSettingsBtn");

    settingsBtn.addEventListener("click", () => this.openSettings());
    closeSettingsBtn.addEventListener("click", () => this.closeSettings());
    cancelSettingsBtn.addEventListener("click", () => this.closeSettings());
    saveSettingsBtn.addEventListener("click", () =>
      this.saveSettingsFromModal()
    );

    // Send button
    const sendBtn = document.getElementById("sendBtn");
    sendBtn.addEventListener("click", () => this.sendToAI());

    // Export button
    const exportBtn = document.getElementById("exportBtn");
    exportBtn.addEventListener("click", () => this.exportConversation());

    // Clear conversation button
    const clearBtn = document.getElementById("clearBtn");
    clearBtn.addEventListener("click", () => this.clearConversation());

    // Error toast close
    const errorClose = document.getElementById("errorClose");
    errorClose.addEventListener("click", () => this.hideError());

    // Modal overlay click to close
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        this.closeSettings();
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      // Space bar to start/stop recording (when not in input fields)
      if (
        e.key === " " &&
        e.target.tagName !== "INPUT" &&
        e.target.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        if (this.permissionStatus === "granted") {
          this.toggleRecording();
        } else {
          this.showError("Microphone permission required for voice recording.");
        }
      }
      // Escape key to close modals and errors
      if (e.key === "Escape") {
        this.closeSettings();
        this.hideError();
        // Stop any current speech synthesis
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      }
    });
  }

  async requestMicrophonePermission() {
    this.updatePermissionUI("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      this.permissionStatus = "granted";
      this.updatePermissionUI("granted");
      console.log("Microphone permission granted");
    } catch (error) {
      this.permissionStatus = "denied";
      this.updatePermissionUI("denied");
      console.error("Microphone permission denied:", error);
    }
  }

  updatePermissionUI(status) {
    const permissionStatus = document.getElementById("permissionStatus");
    const permissionIcon = document.getElementById("permissionIcon");
    const permissionText = document.getElementById("permissionText");
    const grantPermissionBtn = document.getElementById("grantPermissionBtn");

    // Reset classes
    permissionStatus.className = "permission-status";

    switch (status) {
      case "granted":
        permissionStatus.classList.add("granted");
        permissionIcon.textContent = "🟢";
        permissionText.textContent = "Microphone Ready";
        grantPermissionBtn.style.display = "none";
        break;
      case "denied":
        permissionStatus.classList.add("denied");
        permissionIcon.textContent = "🔴";
        permissionText.textContent =
          "Microphone Blocked - You can still use text input";
        grantPermissionBtn.style.display = "block";
        break;
      case "requesting":
        permissionStatus.classList.add("requesting");
        permissionIcon.textContent = "🟡";
        permissionText.textContent = "Requesting microphone permissions...";
        grantPermissionBtn.style.display = "none";
        break;
    }
  }

  updateCharacterCount() {
    const textInput = document.getElementById("textInput");
    const characterCount = document.getElementById("characterCount");
    const currentLength = textInput.value.length;
    const maxLength = 2000;

    characterCount.textContent = `${currentLength} / ${maxLength}`;

    // Reset classes
    characterCount.className = "character-count";

    if (currentLength > maxLength * 0.9) {
      characterCount.classList.add("warning");
    }
    if (currentLength >= maxLength) {
      characterCount.classList.add("error");
    }
  }

  async sendTextMessage() {
    const textInput = document.getElementById("textInput");
    const message = textInput.value.trim();

    if (!message) {
      this.showError("Please type a message first.");
      return;
    }

    const selectedModel = document.getElementById("aiModelSelect").value;
    const apiKey = this.settings.apiKeys[selectedModel];

    if (!apiKey) {
      this.showError(
        `Please configure your ${this.aiModels[selectedModel].name} API key in settings.`
      );
      return;
    }

    // Add user message to conversation
    this.addMessage("user", message);

    // Clear text input
    textInput.value = "";
    this.updateCharacterCount();

    // Send to AI with enhanced error handling
    await this.sendToAIWithRetry(selectedModel, message, apiKey);
  }

  initializeSpeechRecognition() {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();

      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.settings.language;

      this.recognition.onstart = () => {
        console.log("Speech recognition started");
      };

      this.recognition.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const transcriptionDisplay = document.getElementById(
          "transcriptionDisplay"
        );
        transcriptionDisplay.textContent = finalTranscript + interimTranscript;

        if (finalTranscript) {
          const sendBtn = document.getElementById("sendBtn");
          sendBtn.disabled = false;
        }
      };

      this.recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        this.showError("Speech recognition error: " + event.error);
      };

      this.recognition.onend = () => {
        console.log("Speech recognition ended");
      };
    } else {
      this.showError(
        "Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari."
      );
    }
  }

  async toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    if (this.permissionStatus !== "granted") {
      await this.requestMicrophonePermission();
      if (this.permissionStatus !== "granted") {
        this.showError(
          "Microphone access is required for voice recording. Please grant permission or use text input."
        );
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.settings.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType:
          this.settings.audioFormat === "wav" ? "audio/webm" : "audio/mp3",
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: "audio/wav" });
        console.log("Audio recording completed:", audioBlob);
      };

      this.mediaRecorder.start();
      this.isRecording = true;

      // Start speech recognition
      if (this.recognition) {
        this.recognition.start();
      }

      // Update UI
      this.updateRecordingUI();
      this.startTimer();

      // Show transcription section
      const transcriptionSection = document.getElementById(
        "transcriptionSection"
      );
      transcriptionSection.classList.add("visible");
    } catch (error) {
      console.error("Error starting recording:", error);
      this.showError(
        "Could not start recording. Please check microphone permissions."
      );
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }

    if (this.recognition) {
      this.recognition.stop();
    }

    this.isRecording = false;
    this.stopTimer();
    this.updateRecordingUI();
  }

  updateRecordingUI() {
    const recordBtn = document.getElementById("recordBtn");
    const recordingStatus = document.getElementById("recordingStatus");
    const recordingIndicator = document.getElementById("recordingIndicator");

    if (this.isRecording) {
      recordBtn.classList.add("recording");
      recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
      recordingStatus.textContent = "⏹️ Stop Recording";
      recordingIndicator.style.display = "block";
    } else {
      recordBtn.classList.remove("recording");
      recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
      recordingStatus.textContent = "🎤 Start Recording";
      recordingIndicator.style.display = "none";
    }
  }

  startTimer() {
    this.recordingStartTime = Date.now();
    this.recordingTimer = setInterval(() => {
      const elapsed = Date.now() - this.recordingStartTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);

      const timerDisplay = document.getElementById("recordingTimer");
      timerDisplay.textContent = `${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }, 1000);
  }

  stopTimer() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    const timerDisplay = document.getElementById("recordingTimer");
    timerDisplay.textContent = "00:00";
  }

  async sendToAI() {
    const transcriptionDisplay = document.getElementById(
      "transcriptionDisplay"
    );
    const userMessage = transcriptionDisplay.textContent.trim();

    if (!userMessage) {
      this.showError("No message to send. Please record something first.");
      return;
    }

    const selectedModel = document.getElementById("aiModelSelect").value;
    const apiKey = this.settings.apiKeys[selectedModel];

    if (!apiKey) {
      this.showError(
        `Please configure your ${this.aiModels[selectedModel].name} API key in settings.`
      );
      return;
    }

    // Add user message to conversation
    this.addMessage("user", userMessage);

    // Clear transcription
    transcriptionDisplay.textContent = "";
    document.getElementById("sendBtn").disabled = true;

    // Send to AI with enhanced error handling
    await this.sendToAIWithRetry(selectedModel, userMessage, apiKey);
  }

  async sendToAIWithRetry(selectedModel, message, apiKey, attempt = 1) {
    const maxRetries = 3;
    const retryDelay = 1000 * attempt; // Progressive delay

    this.showLoading(
      true,
      `Sending your message to ${this.aiModels[selectedModel].name}...`
    );

    try {
      const response = await this.callAIAPIWithTimeout(
        selectedModel,
        message,
        apiKey
      );
      this.addMessage("assistant", response, selectedModel);
    } catch (error) {
      console.error(`AI API Error (attempt ${attempt}):`, error);

      if (attempt < maxRetries) {
        this.showLoading(true, `Retrying... (${attempt}/${maxRetries})`);
        setTimeout(() => {
          this.sendToAIWithRetry(selectedModel, message, apiKey, attempt + 1);
        }, retryDelay);
        return;
      }

      // All retries failed
      let errorMessage = "Failed to get AI response";

      if (error.message.includes("401") || error.message.includes("403")) {
        errorMessage = "Invalid API key. Please check your settings.";
      } else if (error.message.includes("429")) {
        errorMessage =
          "Rate limit exceeded. Please wait a moment and try again.";
      } else if (error.message.includes("timeout")) {
        errorMessage = "Request timed out. Please try again.";
      } else if (
        error.message.includes("NetworkError") ||
        error.message.includes("Failed to fetch")
      ) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      }

      this.showError(errorMessage + " (" + error.message + ")");
    } finally {
      this.showLoading(false);
    }
  }

  async callAIAPIWithTimeout(model, message, apiKey, timeout = 30000) {
    return Promise.race([
      this.callAIAPI(model, message, apiKey),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), timeout)
      ),
    ]);
  }

  async callAIAPI(model, message, apiKey) {
    const modelConfig = this.aiModels[model];

    if (model === "anthropic") {
      // Anthropic Claude API format
      const response = await fetch(modelConfig.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelConfig.model,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: message,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data.content[0].text;
    } else {
      // OpenAI and Perplexity use similar format
      const response = await fetch(modelConfig.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelConfig.model,
          messages: [
            {
              role: "user",
              content: message,
            },
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    }
  }

  addMessage(role, content, model = null) {
    const message = {
      role,
      content,
      model,
      timestamp: new Date().toISOString(),
    };

    this.conversation.push(message);
    this.updateConversationUI();
  }

  updateConversationUI() {
    const container = document.getElementById("conversationContainer");

    if (this.conversation.length === 0) {
      container.innerHTML = `
                <div class="conversation-placeholder">
                    <i class="fas fa-comments"></i>
                    <p>Start a conversation by typing a message or recording your voice</p>
                </div>
            `;
      return;
    }

    container.innerHTML = "";

    this.conversation.forEach((message, index) => {
      const messageDiv = document.createElement("div");
      messageDiv.className = "message";

      const roleIcon = message.role === "user" ? "fa-user" : "fa-robot";
      const roleName =
        message.role === "user"
          ? "You"
          : message.model
          ? this.aiModels[message.model].name
          : "Assistant";
      const timestamp = new Date(message.timestamp).toLocaleTimeString();

      messageDiv.innerHTML = `
                <div class="message-header">
                    <div class="message-role ${message.role}">
                        <i class="fas ${roleIcon}"></i>
                        ${roleName}
                    </div>
                    <div class="message-time">${timestamp}</div>
                </div>
                <div class="message-content">${message.content}</div>
                <div class="message-actions">
                    <button class="btn btn--outline btn-copy" onclick="chatbot.copyMessage(${index})">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    ${
                      message.role === "assistant"
                        ? `<button class="btn btn--outline btn-speak" onclick="chatbot.speakMessage(${index})">
                        <i class="fas fa-volume-up"></i> Speak
                    </button>`
                        : ""
                    }
                </div>
            `;

      container.appendChild(messageDiv);
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  copyMessage(index) {
    const message = this.conversation[index];
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(message.content)
        .then(() => {
          this.showToast("Message copied to clipboard!", "success");
        })
        .catch((err) => {
          console.error("Failed to copy message:", err);
          this.showError("Failed to copy message to clipboard.");
        });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = message.content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      this.showToast("Message copied to clipboard!", "success");
    }
  }

  speakMessage(index) {
    const message = this.conversation[index];

    if ("speechSynthesis" in window) {
      // Stop any current speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(message.content);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        this.showToast("Speaking response...", "info");
      };

      utterance.onend = () => {
        this.showToast("Speech completed!", "success");
      };

      utterance.onerror = (error) => {
        console.error("Speech synthesis error:", error);
        this.showError("Failed to speak the message.");
      };

      window.speechSynthesis.speak(utterance);
    } else {
      this.showError("Text-to-speech is not supported in this browser.");
    }
  }

  clearConversation() {
    if (this.conversation.length === 0) {
      return;
    }

    if (confirm("Are you sure you want to clear the conversation history?")) {
      this.conversation = [];
      this.updateConversationUI();
      this.showToast("Conversation cleared!", "success");
    }
  }

  exportConversation() {
    if (this.conversation.length === 0) {
      this.showError("No conversation to export.");
      return;
    }

    let exportText = "Voice AI Chatbot Conversation\n";
    exportText += "================================\n\n";

    this.conversation.forEach((message) => {
      const timestamp = new Date(message.timestamp).toLocaleString();
      const roleName =
        message.role === "user"
          ? "You"
          : message.model
          ? this.aiModels[message.model].name
          : "Assistant";

      exportText += `[${timestamp}] ${roleName}:\n`;
      exportText += `${message.content}\n\n`;
    });

    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voice-chat-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast("Conversation exported successfully!", "success");
  }

  openSettings() {
    // Populate settings form with current values
    document.getElementById("openaiKey").value = this.settings.apiKeys.openai;
    document.getElementById("perplexityKey").value =
      this.settings.apiKeys.perplexity;
    document.getElementById("anthropicKey").value =
      this.settings.apiKeys.anthropic;
    document.getElementById("languageSelect").value = this.settings.language;
    document.getElementById("audioFormat").value = this.settings.audioFormat;
    document.getElementById("sampleRate").value = this.settings.sampleRate;
    document.getElementById("themeSelect").value = this.settings.theme;

    const modal = document.getElementById("settingsModal");
    modal.classList.add("visible");
  }

  closeSettings() {
    const modal = document.getElementById("settingsModal");
    modal.classList.remove("visible");
  }

  saveSettingsFromModal() {
    // Get values from form
    this.settings.apiKeys.openai = document.getElementById("openaiKey").value;
    this.settings.apiKeys.perplexity =
      document.getElementById("perplexityKey").value;
    this.settings.apiKeys.anthropic =
      document.getElementById("anthropicKey").value;
    this.settings.language = document.getElementById("languageSelect").value;
    this.settings.audioFormat = document.getElementById("audioFormat").value;
    this.settings.sampleRate = parseInt(
      document.getElementById("sampleRate").value
    );
    this.settings.theme = document.getElementById("themeSelect").value;

    // Update speech recognition language
    if (this.recognition) {
      this.recognition.lang = this.settings.language;
    }

    this.saveSettings();
    this.closeSettings();
    this.updateUI();
  }

  updateUI() {
    // Update theme if needed
    // For now, we'll rely on system theme detection through CSS
    console.log("UI updated with current settings");
  }

  showLoading(show, customMessage = null) {
    const overlay = document.getElementById("loadingOverlay");
    const loadingText = document.querySelector(".loading-text");

    if (show) {
      if (customMessage) {
        loadingText.textContent = customMessage;
      } else {
        loadingText.textContent = "Processing your request...";
      }
      overlay.classList.add("visible");
    } else {
      overlay.classList.remove("visible");
    }
  }

  showError(message) {
    const errorToast = document.getElementById("errorToast");
    const errorMessage = document.getElementById("errorMessage");

    errorMessage.textContent = message;
    errorToast.classList.add("visible");

    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.hideError();
    }, 5000);
  }

  hideError() {
    const errorToast = document.getElementById("errorToast");
    errorToast.classList.remove("visible");
  }

  showToast(message, type = "info") {
    // Simple toast implementation using the error toast with different styling
    const errorToast = document.getElementById("errorToast");
    const errorMessage = document.getElementById("errorMessage");

    errorMessage.textContent = message;

    // Temporarily change color for success messages
    if (type === "success") {
      errorToast.style.background = "var(--color-success)";
    } else {
      errorToast.style.background = "var(--color-error)";
    }

    errorToast.classList.add("visible");

    setTimeout(() => {
      errorToast.classList.remove("visible");
      // Reset background color
      setTimeout(() => {
        errorToast.style.background = "var(--color-error)";
      }, 300);
    }, 3000);
  }
}

// Initialize the app when the page loads
let chatbot;

document.addEventListener("DOMContentLoaded", () => {
  chatbot = new VoiceChatbot();

  // Make chatbot globally accessible for inline event handlers
  window.chatbot = chatbot;

  console.log("Voice AI Chatbot initialized successfully!");
});

// Service worker registration for offline support (optional)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // We're not implementing a full service worker in this demo,
    // but this is where you would register it for offline functionality
    console.log("Service Worker support detected");
  });
}
