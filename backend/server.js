const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ 
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Local File Database Connection
const dbPath = path.join(__dirname, 'database.json');
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([]));
}

function getMessages() {
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveMessages(messages) {
    fs.writeFileSync(dbPath, JSON.stringify(messages, null, 2));
}

function addMessage(conversationId, role, content) {
    const messages = getMessages();
    messages.push({
        conversationId,
        role,
        content,
        timestamp: new Date().toISOString()
    });
    saveMessages(messages);
}

// Initialize AI Providers
let groq = null;
if (process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log('Groq AI initialized');
}

let genAI = null;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('Gemini AI initialized');
}

const SYSTEM_PROMPT = `
You are EduAI, a specialized academic study assistant chatbot. 
Your goal is to help students learn engineering and general academic concepts.

RULES:
1. Only answer questions related to education, science, engineering, mathematics, and general academic topics.
2. If a user asks a non-academic question (e.g., about celebrities, movies, sports, personal life, or general chit-chat not related to learning), politely refuse and explain that you are an academic assistant.
3. Provide accurate, structured, and easy-to-understand explanations.
4. Use step-by-step breakdowns for complex topics.
5. You can summarize text and generate quiz questions when asked.
6. Maintain a helpful, professional, and encouraging tone.
7. Use Markdown for formatting (bolding, lists, code blocks, etc.).

Current focus: Engineering and general studies.
`;

// Route to get all unique conversations
app.get('/api/conversations', async (req, res) => {
    try {
        const messages = getMessages();
        const convMap = {};
        
        messages.forEach(msg => {
            if (!convMap[msg.conversationId]) {
                convMap[msg.conversationId] = {
                    _id: msg.conversationId,
                    title: msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : ''),
                    lastUpdated: msg.timestamp
                };
            } else {
                if (new Date(msg.timestamp) > new Date(convMap[msg.conversationId].lastUpdated)) {
                    convMap[msg.conversationId].lastUpdated = msg.timestamp;
                }
            }
        });
        
        const conversations = Object.values(convMap).sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Route to get chat history for a specific conversation
app.get('/api/history/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const history = getMessages().filter(m => m.conversationId === conversationId);
        res.json(history);
    } catch (error) {
        console.error('History fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Route to delete a specific conversation
app.delete('/api/history/:conversationId', async (req, res) => {
    try {
        let { conversationId } = req.params;
        let messages = getMessages();
        
        if (conversationId === 'null' || !conversationId) {
            messages = messages.filter(m => m.conversationId && m.conversationId !== 'null');
        } else {
            messages = messages.filter(m => m.conversationId !== conversationId);
        }
        
        saveMessages(messages);
        res.json({ success: true, message: 'Conversation deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
});

// Route to delete all history
app.delete('/api/history', async (req, res) => {
    try {
        saveMessages([]);
        res.json({ success: true, message: 'All history deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete all history' });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        let { message, history = [], conversationId } = req.body;
        
        if (!conversationId || conversationId === 'null') {
            conversationId = 'session-' + Date.now();
        }

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        addMessage(conversationId, 'user', message);

        let aiResponse = "";

        // Try Groq first if available
        if (groq) {
            try {
                const messages = [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...history.map(msg => ({
                        role: msg.role === 'user' ? 'user' : 'assistant',
                        content: msg.text
                    })),
                    { role: "user", content: message }
                ];

                const chatCompletion = await groq.chat.completions.create({
                    messages: messages,
                    model: "llama-3.3-70b-versatile",
                    temperature: 0.3,
                    max_tokens: 2048,
                });
                aiResponse = chatCompletion.choices[0]?.message?.content || "";
            } catch (groqErr) {
                console.error('Groq Error:', groqErr);
                // Fallback to Gemini if Groq fails and Gemini is available
                if (!genAI) throw groqErr;
            }
        }

        // Use Gemini if Groq failed or wasn't available
        if (!aiResponse && genAI) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const prompt = `${SYSTEM_PROMPT}\n\nContext: ${JSON.stringify(history)}\n\nUser: ${message}`;
                const result = await model.generateContent(prompt);
                const response = await result.response;
                aiResponse = response.text();
            } catch (geminiErr) {
                console.error('Gemini Error:', geminiErr);
                throw geminiErr;
            }
        }

        if (!aiResponse) {
            throw new Error('No AI provider available or all providers failed. Check your API keys in .env');
        }

        addMessage(conversationId, 'assistant', aiResponse);
        res.json({ text: aiResponse });

    } catch (error) {
        console.error('Chat Error:', error);
        res.status(500).json({ error: 'Failed to generate response', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`EduAI Server running on http://localhost:${port}`);
});

