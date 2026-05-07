const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const clearChatBtn = document.getElementById('clear-chat');
const activeActionBadge = document.getElementById('active-action-badge');
const actionText = document.getElementById('action-text');
const historyList = document.getElementById('history-list');

let chatHistory = [];
let currentAction = null;
let currentHistoryConversationId = localStorage.getItem('currentConversationId');
let currentConversationId = (currentHistoryConversationId && currentHistoryConversationId !== 'null') ? currentHistoryConversationId : generateUUID();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadConversations();
    if (currentConversationId) {
        loadHistory(currentConversationId);
    }
});

function generateUUID() {
    return 'chat-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
}

async function loadConversations() {
    try {
        const response = await fetch('http://localhost:5000/api/conversations');
        const conversations = await response.json();
        
        historyList.innerHTML = '';
        conversations.forEach(conv => {
            const item = document.createElement('div');
            item.className = `history-item ${conv._id === currentConversationId ? 'active' : ''}`;
            item.dataset.id = conv._id;
            item.innerHTML = `<i class="fas fa-comment-alt"></i> ${conv.title || 'New Chat'}`;
            item.onclick = () => switchConversation(conv._id);
            historyList.appendChild(item);
        });
        updateActiveHistoryItem();
    } catch (error) {
        console.error('Failed to load conversations:', error);
    }
}

async function loadHistory(id) {
    try {
        const response = await fetch(`http://localhost:5000/api/history/${id}`);
        const history = await response.json();
        
        chatMessages.innerHTML = ''; // Clear current view
        chatHistory = [];
        
        if (history.length === 0) {
            addWelcomeMessage();
        } else {
            history.forEach(msg => {
                const role = msg.role === 'user' ? 'user' : 'ai';
                addMessage(role, msg.content);
                chatHistory.push({ role: role, text: msg.content });
            });
        }
        
        currentConversationId = id;
        localStorage.setItem('currentConversationId', id);
        updateActiveHistoryItem();
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

function switchConversation(id) {
    if (id === currentConversationId) return;
    loadHistory(id);
}

function updateActiveHistoryItem() {
    document.querySelectorAll('.history-item').forEach(item => {
        if (item.dataset.id === currentConversationId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function addWelcomeMessage() {
    addMessage('ai', "Hello! I am **EduAI**, your dedicated study assistant. How can I help you with your academic concepts today?");
}

// Configure Marked options
marked.setOptions({
    breaks: true,
    gfm: true
});

// Auto-resize textarea
userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
});

// Handle Chat Submission
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    if (!message) return;

    // Process message based on action
    let processedMessage = message;
    if (currentAction === 'explain') {
        processedMessage = `[ACTION: EXPLAIN STEP-BY-STEP] ${message}`;
    } else if (currentAction === 'summarize') {
        processedMessage = `[ACTION: SUMMARIZE CONCISELY] ${message}`;
    } else if (currentAction === 'quiz') {
        processedMessage = `[ACTION: GENERATE QUIZ] ${message}`;
    }

    addMessage('user', message);
    userInput.value = '';
    userInput.style.height = 'auto';
    
    // Show typing indicator
    const typingId = addTypingIndicator();
    
    try {
        const response = await fetch('http://localhost:5000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: processedMessage, 
                history: chatHistory,
                conversationId: currentConversationId
            })
        });

        const data = await response.json();
        removeTypingIndicator(typingId);

        if (data.error) {
            addMessage('ai', "Sorry, I encountered an error: " + (data.details || data.error));
        } else {
            addMessage('ai', data.text);
            chatHistory.push({ role: 'user', text: processedMessage });
            chatHistory.push({ role: 'ai', text: data.text });
            
            // Refresh conversation list after first message
            if (chatHistory.length <= 2) {
                loadConversations();
            }
        }
    } catch (error) {
        if (typeof typingId !== 'undefined') removeTypingIndicator(typingId);
        addMessage('ai', "Error connecting to the server. Please ensure the backend is running and MongoDB is accessible.");
        console.error('Fetch Error:', error);
    }
});

function addMessage(role, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    const icon = role === 'ai' ? 'fa-robot' : 'fa-user';
    const content = role === 'ai' ? marked.parse(text) : `<p>${text}</p>`;

    messageDiv.innerHTML = `
        <div class="avatar"><i class="fas ${icon}"></i></div>
        <div class="message-content">
            ${content}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addTypingIndicator() {
    const id = 'typing-' + Date.now();
    const indicatorDiv = document.createElement('div');
    indicatorDiv.className = 'message ai-message';
    indicatorDiv.id = id;
    indicatorDiv.innerHTML = `
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(indicatorDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// Action Handlers
window.setAction = function(action) {
    currentAction = action;
    activeActionBadge.style.display = 'flex';
    
    switch(action) {
        case 'explain':
            actionText.innerText = 'Explain Mode';
            userInput.placeholder = 'Which concept should I explain?';
            break;
        case 'summarize':
            actionText.innerText = 'Summarize Mode';
            userInput.placeholder = 'Paste the text you want summarized...';
            break;
        case 'quiz':
            actionText.innerText = 'Quiz Mode';
            userInput.placeholder = 'Topic for the quiz?';
            break;
    }
    
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
};

window.clearAction = function() {
    currentAction = null;
    activeActionBadge.style.display = 'none';
    userInput.placeholder = 'Ask an academic question...';
};

window.suggestQuery = function(text) {
    userInput.value = text;
    userInput.focus();
    userInput.style.height = userInput.scrollHeight + 'px';
};

// "New Chat" functionality
document.getElementById('btn-chat').addEventListener('click', () => {
    const newId = generateUUID();
    switchConversation(newId);
});

// Settings Modal Logic
const settingsBtn = document.querySelector('.icon-btn[title="Settings"]');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const currentSessionIdEl = document.getElementById('current-session-id');

settingsBtn.addEventListener('click', () => {
    currentSessionIdEl.innerText = currentConversationId;
    settingsModal.classList.add('show');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('show');
});

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('show');
    }
});

// Delete Current Chat
clearChatBtn.addEventListener('click', async (e) => {
    if (confirm('Permanently delete this conversation from history?')) {
        try {
            const response = await fetch(`http://localhost:5000/api/history/${currentConversationId}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            
            if (data.success) {
                chatMessages.innerHTML = '';
                chatHistory = [];
                addWelcomeMessage();
                
                // Start a fresh session first
                const newId = generateUUID();
                currentConversationId = newId;
                localStorage.setItem('currentConversationId', newId);
                
                // Then refresh list
                await loadConversations();
            }
        } catch (error) {
            console.error('Failed to delete chat:', error);
            alert('Error: Could not connect to server to delete chat.');
        }
    }
});

// Reset All Data
const clearAllDataBtn = document.getElementById('clear-all-data');
clearAllDataBtn.addEventListener('click', async () => {
    if (confirm('CRITICAL: This will permanently delete ALL chat history from the database. Are you sure?')) {
        try {
            const response = await fetch('http://localhost:5000/api/history', {
                method: 'DELETE'
            });
            const data = await response.json();
            
            if (data.success) {
                chatMessages.innerHTML = '';
                chatHistory = [];
                addWelcomeMessage();
                loadConversations();
                const newId = generateUUID();
                currentConversationId = newId;
                localStorage.setItem('currentConversationId', newId);
                settingsModal.classList.remove('show');
                alert('Database wiped successfully.');
            }
        } catch (error) {
            console.error('Failed to wipe database:', error);
            alert('Failed to connect to server.');
        }
    }
});

