require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const strings = require('./strings');

const token = process.env.BOT_TOKEN;

if (!token) {
    console.error("BOT_TOKEN is not defined in .env file.");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// Express setup for Web App Dashboard
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the static React WebApp build
app.use(express.static(path.join(__dirname, 'webapp/dist')));

app.get('/', (req, res) => {
    res.send('<h2>Bot Backend Server 🟢 Onlayn</h2><p>Maxsus API yo\'llar orqali kiring.</p>');
});

app.get('/api/stats', async (req, res) => {
    const { chatId } = req.query;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });

    try {
        const todayObj = new Date();
        const today = todayObj.toISOString().split('T')[0];
        const thisMonth = today.substring(0, 7);

        const balance = await db.getUserBalance(chatId);
        const dailyStats = await db.getStatsByDate(chatId, today);
        const monthlyStats = await db.getStatsByDate(chatId, thisMonth);
        const recentTransactions = await db.getRecentTransactions(chatId, 10);
        const expensesByCategory = await db.getExpensesByCategory(chatId, thisMonth);
        const incomesByCategory = await db.getIncomesByCategory(chatId, thisMonth);

        // Fetch last 7 days data for charts
        const weeklyData = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const stats = await db.getStatsByDate(chatId, dateStr);
            weeklyData.push({
                name: dateStr.substring(5).replace('-', '/'), // e.g. "02/26"
                income: stats?.income || 0,
                expense: stats?.expense || 0
            });
        }

        res.json({
            balance,
            dailyStats,
            monthlyStats,
            weeklyData,
            recentTransactions,
            expensesByCategory,
            incomesByCategory
        });
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/transactions', async (req, res) => {
    const { chatId } = req.query;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });

    try {
        await db.deleteAllData(chatId);
        res.json({ success: true });
    } catch (error) {
        console.error("Delete All Error:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Express API running on port ${PORT}`);
});

// Cache the exchange rate to avoid spamming the API on every message
let exchangeRateCache = {
    usdToUzs: null,
    lastUpdate: null
};

async function getUsdRate() {
    const now = new Date();
    // Refresh cache if it's older than 1 hour or empty
    if (!exchangeRateCache.usdToUzs || !exchangeRateCache.lastUpdate || (now - exchangeRateCache.lastUpdate) > 3600000) {
        try {
            const response = await axios.get('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/');
            if (response.data && response.data.length > 0) {
                exchangeRateCache.usdToUzs = parseFloat(response.data[0].Rate);
                exchangeRateCache.lastUpdate = now;
                console.log(`Updated USD Rate from CBU: ${exchangeRateCache.usdToUzs}`);
            }
        } catch (error) {
            console.error("Error fetching currency rate:", error.message);
            // Fallback rate if API fails
            return exchangeRateCache.usdToUzs || 12500;
        }
    }
    return exchangeRateCache.usdToUzs || 12500;
}

// Initialize Database
db.initDb().then(() => {
    console.log("Database initialized successfully.");
}).catch(err => {
    console.error("Database initialization failed:", err);
});

// Command: /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const user = await db.getUser(chatId);

        // If user is already registered, show the full menu including WebApp
        if (user && user.phone && user.name) {
            const lang = user.lang || 'uz';
            const s = strings[lang];
            const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';

            const menuKeyboard = [
                [{ text: s.dashboardBtn, web_app: { url: webAppUrl } }],
                [{ text: s.balanceBtn }, { text: s.reportBtn }],
                [{ text: s.limitsBtn }, { text: s.adviceBtn }],
                [{ text: s.helpBtn }]
            ];

            bot.sendMessage(chatId, s.welcomeText(user.name), {
                reply_markup: {
                    keyboard: menuKeyboard,
                    resize_keyboard: true
                }
            });
            return;
        }
    } catch (e) {
        console.error("Error during /start Check:", e);
    }

    const langOptions = {
        reply_markup: {
            keyboard: [
                [{ text: "🇺🇿 Uz" }, { text: "🇷🇺 Rus" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };

    bot.sendMessage(chatId, "🇺🇿: Assalomu alaykum. Iltimos, bot tilini tanlang.\n\n🇷🇺: Здравствуйте. Пожалуйста, выберите язык бота.", langOptions);
});

// Command: /help
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const lang = await db.getUserLang(chatId) || 'uz';
        bot.sendMessage(chatId, strings[lang].helpText);
    } catch (error) {
        console.error(error);
    }
});

// Command: /balance
bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const lang = await db.getUserLang(chatId) || 'uz';
        const balance = await db.getUserBalance(chatId);
        bot.sendMessage(chatId, strings[lang].balance(balance), { parse_mode: 'Markdown' });
    } catch (error) {
        const lang = await db.getUserLang(chatId).catch(() => 'uz') || 'uz';
        bot.sendMessage(chatId, strings[lang].error);
        console.error(error);
    }
});

// Command: /stats
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;

    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7); // 'YYYY-MM'

    try {
        const lang = await db.getUserLang(chatId) || 'uz';
        const s = strings[lang];

        const dailyStats = await db.getStatsByDate(chatId, today);
        const monthlyStats = await db.getStatsByDate(chatId, thisMonth);
        const balance = await db.getUserBalance(chatId);

        const statsText = `${s.statsTitle}\n
${s.todayTitle}
${s.incomeLabel}: ${dailyStats.income.toLocaleString()}
${s.expenseLabel}: ${dailyStats.expense.toLocaleString()}

${s.monthTitle(thisMonth)}
${s.incomeLabel}: ${monthlyStats.income.toLocaleString()}
${s.expenseLabel}: ${monthlyStats.expense.toLocaleString()}

${s.overallBalanceTitle} ${balance.toLocaleString()}`;

        bot.sendMessage(chatId, statsText, { parse_mode: 'Markdown' });
    } catch (error) {
        const lang = await db.getUserLang(chatId).catch(() => 'uz') || 'uz';
        bot.sendMessage(chatId, strings[lang].statsFetchingError);
        console.error(error);
    }
});

// Handle incoming contacts
bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const phone = msg.contact.phone_number;

    try {
        const lang = await db.getUserLang(chatId) || 'uz';
        await db.setUserPhone(chatId, phone);
        await db.setUserName(chatId, null);

        bot.sendMessage(chatId, strings[lang].askName, {
            reply_markup: { remove_keyboard: true }
        });
    } catch (error) {
        console.error(error);
    }
});

// Helper Function to parse the transaction string
const parseTransaction = async (inputText) => {
    if (!ai) {
        // Fallback simple parsing if Gemini is not configured
        let amount = 0; let type = 'expense'; let description = ''; let category = 'Boshqa';
        inputText = inputText.replace(/(\d)\s+(?=\d)/g, '$1');
        const basicMatch = inputText.match(/^([\+\-]?)\s*(\d+)\s+(.*)$/);
        if (basicMatch) {
            let sign = basicMatch[1] || '-';
            amount = parseInt(basicMatch[2], 10);
            description = basicMatch[3].trim();
            type = sign === '+' ? 'income' : 'expense';
            return { amount, type, description, category };
        }
        return null; // Simplified fallback for brevity
    }

    try {
        const USD_RATE = await getUsdRate();
        const prompt = `
You are a financial transaction analyzer for a Telegram bot in Uzbekistan.
Analyze this user text and return strictly a pure JSON object (do not use Markdown blocks like \`\`\`json).
If the transaction is in USD dollars, convert it to UZS using the rate ${USD_RATE}.
Types: "income" or "expense".
Expense Categories: "Oziq-ovqat", "Transport", "Kommunal", "Aloqa", "Kiyim-kechak", "Sog'liqni saqlash", "Ta'lim", "Hordiq", "Boshqa xarajat".
Income Categories: "Oylik", "Biznes", "Sotuv", "Mukofot", "Qund", "Qarz qaytishi", "Boshqa daromad".
Format: {"amount": Number, "type": "income" | "expense", "category": "String", "description": "String"}
Text to analyze: "${inputText}"
`;

        const genResult = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        let jsonRaw = genResult.text.trim();
        if (jsonRaw.startsWith('```json')) {
            jsonRaw = jsonRaw.substring(7, jsonRaw.length - 3);
        } else if (jsonRaw.startsWith('```')) {
            jsonRaw = jsonRaw.substring(3, jsonRaw.length - 3);
        }
        const parsedData = JSON.parse(jsonRaw);
        return {
            amount: Number(parsedData.amount),
            type: parsedData.type,
            category: parsedData.category || 'Boshqa',
            description: parsedData.description || 'Amaliyot'
        };
    } catch (error) {
        console.error("AI Parse Error:", error);
        return null;
    }
};

// Helper Function to process transaction text and respond
const processTransactionText = async (chatId, text, lang) => {
    const s = strings[lang];
    try {
        const parsedData = await parseTransaction(text);

        if (parsedData) {
            const { amount, type, description, category } = parsedData;

            await db.addTransaction(chatId, amount, type, category, description);
            const balance = await db.getUserBalance(chatId);

            const typeText = type === 'income' ? s.incomeWord : s.expenseWord;
            bot.sendMessage(chatId, s.transactionSuccess(typeText, amount, description, balance) + `\n📌 Toifa: ${category}`);
        } else {
            bot.sendMessage(chatId, s.invalidFormat);
        }
    } catch (error) {
        bot.sendMessage(chatId, s.transactionSavingError);
        console.error(error);
    }
};

// Handle incoming text transactions
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Check for language selection
    if (text.includes("Uz") || text.includes("Rus") || text.includes("O'zbekcha") || text.includes("Русский")) {
        const lang = (text.includes("Uz") || text.includes("O'zbekcha")) ? 'uz' : 'ru';
        try {
            await db.setUserLang(chatId, lang);
            const responseText = strings[lang].welcomeText(msg.from.first_name);

            const phoneOptions = {
                reply_markup: {
                    keyboard: [
                        [{ text: strings[lang].requestPhoneBtn, request_contact: true }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            };

            bot.sendMessage(chatId, responseText, phoneOptions);
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, "Xatolik / Ошибка");
        }
        return;
    }

    try {
        const user = await db.getUser(chatId);
        const lang = user?.lang || 'uz';
        const s = strings[lang];

        // Handle Dashboard Buttons Menu Actions
        if (text === s.balanceBtn) {
            const balance = await db.getUserBalance(chatId);
            bot.sendMessage(chatId, s.balance(balance), { parse_mode: 'Markdown' });
            return;
        }

        if (text === s.reportBtn) {
            const today = new Date().toISOString().split('T')[0];
            const thisMonth = today.substring(0, 7);
            try {
                const dailyStats = await db.getStatsByDate(chatId, today);
                const monthlyStats = await db.getStatsByDate(chatId, thisMonth);
                const balance = await db.getUserBalance(chatId);

                const statsText = `${s.statsTitle}\n
${s.todayTitle}
${s.incomeLabel}: ${dailyStats.income.toLocaleString()}
${s.expenseLabel}: ${dailyStats.expense.toLocaleString()}

${s.monthTitle(thisMonth)}
${s.incomeLabel}: ${monthlyStats.income.toLocaleString()}
${s.expenseLabel}: ${monthlyStats.expense.toLocaleString()}

${s.overallBalanceTitle} ${balance.toLocaleString()}`;

                bot.sendMessage(chatId, statsText, { parse_mode: 'Markdown' });
            } catch (error) {
                bot.sendMessage(chatId, s.statsFetchingError);
                console.error(error);
            }
            return;
        }

        if (text === s.helpBtn) {
            bot.sendMessage(chatId, s.helpText);
            return;
        }

        if (text === s.limitsBtn || text === s.adviceBtn) {
            bot.sendMessage(chatId, lang === 'uz' ? "Bu funksiya tez orada qo'shiladi! 🚀" : "Эта функция скоро появится! 🚀");
            return;
        }

        // Check if we are in the "ask for name" state
        if (user && user.phone && !user.name) {
            await db.setUserName(chatId, text);

            const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';

            const menuKeyboard = [
                [{ text: s.dashboardBtn, web_app: { url: webAppUrl } }],
                [{ text: s.balanceBtn }, { text: s.reportBtn }],
                [{ text: s.limitsBtn }, { text: s.adviceBtn }],
                [{ text: s.helpBtn }]
            ];

            bot.sendMessage(chatId, s.regSuccess(text), {
                reply_markup: {
                    keyboard: menuKeyboard,
                    resize_keyboard: true
                }
            });

            // Send the onboarding prompt immediately after
            bot.sendMessage(chatId, s.onboardingPrompt, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: s.btnTryOut, callback_data: 'try_out' }],
                        [{ text: s.btnAlreadyKnow, callback_data: 'already_know' }]
                    ]
                }
            });

            return;
        }

        // Process transaction
        await processTransactionText(chatId, text, lang);

    } catch (error) {
        console.error(error);
    }
});

// Handle incoming voice messages
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;

    try {
        const user = await db.getUser(chatId);
        const lang = user?.lang || 'uz';
        const s = strings[lang];

        if (!ai) {
            bot.sendMessage(chatId, s.voiceNotConfigured || "Ovozli tizim hozircha sozlanmagan. Iltimos matn shaklida yuboring.");
            return;
        }

        // Send 'listening' status
        const listeningMsg = await bot.sendMessage(chatId, s.voiceListening || "⏳ Ovozli xabar tinglanmoqda...");

        // Download the voice file from Telegram
        const fileId = msg.voice.file_id;
        const fileLink = await bot.getFileLink(fileId);

        const voicePath = path.resolve(__dirname, `voice_${fileId}.oga`);
        const response = await axios({
            url: fileLink,
            method: 'GET',
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(voicePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Upload the audio file to Google GenAI File API
        const uploadResult = await ai.files.upload({
            file: voicePath,
            mimeType: 'audio/ogg'
        });

        const promptLang = lang === 'uz' ? 'Uzbek' : 'Russian';
        const prompt = `Please transcribe this short audio note into exactly the original words but written as a ${promptLang} text. Do not reply or add extra conversational words. Just the pure transcription.`;

        // Transcribe with Gemini 2.5 Flash
        const genResult = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: 'user',
                    parts: [
                        { fileData: { mimeType: uploadResult.mimeType, fileUri: uploadResult.uri } },
                        { text: prompt }
                    ]
                }
            ]
        });

        // Clean up temp file
        fs.unlinkSync(voicePath);

        const transcribedText = genResult.text;
        await bot.editMessageText((s.voiceTranslated || "Sizning ovozingiz:") + `\n_"${transcribedText}"_`, {
            chat_id: chatId,
            message_id: listeningMsg.message_id,
            parse_mode: 'Markdown'
        });

        // Treat transcribed text exactly like normal text
        await processTransactionText(chatId, transcribedText, lang);

    } catch (error) {
        console.error("Voice processing error:", error.message);
        const lang = await db.getUserLang(chatId).catch(() => 'uz') || 'uz';
        bot.sendMessage(chatId, strings[lang].transactionSavingError || "Xatolik yuz berdi");
    }
});

// Handle callback queries from inline keyboards
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
        const lang = await db.getUserLang(chatId) || 'uz';
        const s = strings[lang];

        if (data === 'try_out') {
            bot.sendMessage(chatId, s.promptTryOutTarget);
        } else if (data === 'already_know') {
            bot.sendMessage(chatId, s.promptAlreadyKnowTarget);
        }

        bot.answerCallbackQuery(query.id);
    } catch (error) {
        console.error(error);
        bot.answerCallbackQuery(query.id);
    }
});

console.log("Bot server is running...");
