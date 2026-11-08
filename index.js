 const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');

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
        const phoneNumber = "8801618151051"; // আপনার নম্বরটি এখানে বসানো হলো
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n========================================`);
                console.log(`🔑 আপনার পেয়ারিং কোডটি হলো: ${code}`);
                console.log(`========================================\n`);
            } catch (err) {
                console.log('Pairing error:', err);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteId;
        if (from.endsWith('@g.us')) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const foundUrls = text.match(urlRegex);

        if (foundUrls) {
            const isAllowed = foundUrls.every(url => 
                ALLOWED_KEYWORDS.some(keyword => url.includes(keyword))
            );

            if (!isAllowed) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                    const sender = msg.key.participant;
                    const warningText = `⚠️ @${sender.split('@')[0]}, এই গ্রুপে অনিয়ম নিষিদ্ধ!`;
                    await sock.sendMessage(from, { text: warningText, mentions: [sender] });
                } catch (err) {
                    console.log('Error:', err);
                }
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Bot Connected Successfully!');
        }
    });
}

connectToWhatsApp();

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!\n');
});

server.listen(process.env.PORT || 3000);
