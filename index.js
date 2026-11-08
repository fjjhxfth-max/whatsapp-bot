const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const pino = require('pino');
const http = require('http');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const ALLOWED_KEYWORDS = ['play.google.com', 'yourappdomain.com'];

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Chrome"),
        auth: state
    });

    if (!sock.authState.creds.registered) {
        const phoneNumber = "8801618151051";
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n🔑 পেয়ারিং কোড: ${code}\n`);
            } catch (err) {
                console.log('Pairing error:', err);
            }
        }, 8000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteId;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        if (from.endsWith('@g.us') && text) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const foundUrls = text.match(urlRegex);
            if (foundUrls) {
                const isAllowed = foundUrls.every(url => ALLOWED_KEYWORDS.some(k => url.includes(k)));
                if (!isAllowed) {
                    try {
                        await sock.sendMessage(from, { delete: msg.key });
                        const sender = msg.key.participant;
                        await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]}, এই গ্রুপে ফালতু লিংক নিষিদ্ধ!`, mentions: [sender] });
                        return;
                    } catch (e) {}
                }
            }
        }

        if (text) {
            try {
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: text,
                });
                if (response && response.text) {
                    await sock.sendMessage(from, { text: response.text }, { quoted: msg });
                }
            } catch (e) {}
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot Connected Successfully!');
        }
    });
}

connectToWhatsApp();

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!\n\n');
}).listen(process.env.PORT || 3000);
