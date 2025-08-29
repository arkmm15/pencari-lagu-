// index.js
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@adiwajshing/baileys');
const pino = require('pino');
const ytSearch = require('yt-search');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function start() {
  const logger = pino({ level: 'info' });
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger,
    printQRInTerminal: true,
    auth: state,
    version
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection } = update;
    if (connection === 'open') console.log('✅ Bot WhatsApp aktif!');
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

      const from = msg.key.remoteJid;
      const text = (msg.message.conversation ||
                   msg.message.extendedTextMessage?.text || '').trim();

      // 👉 Command: .cari <judul lagu>
      if (text.toLowerCase().startsWith('.cari ')) {
        const query = text.split(' ').slice(1).join(' ');
        if (!query) {
          await sock.sendMessage(from, { text: '❌ Masukkan judul lagu.\n\nContoh: `.cari bohemian rhapsody`' }, { quoted: msg });
          return;
        }

        await sock.sendMessage(from, { text: `🔎 Sedang mencari lagu: *${query}* ...` }, { quoted: msg });

        // Cari di YouTube
        const searchRes = await ytSearch(query);
        if (!searchRes.videos.length) {
          await sock.sendMessage(from, { text: `❌ Lagu tidak ditemukan untuk: *${query}*` }, { quoted: msg });
          return;
        }

        const vid = searchRes.videos[0]; // ambil hasil pertama
        const videoUrl = vid.url;
        const title = vid.title;
        const channel = vid.author?.name || 'Unknown';

        await sock.sendMessage(from, { text: `✅ Ketemu: *${title}*\n🎤 Channel: ${channel}\n⬇️ Mengunduh MP3, tunggu sebentar...` }, { quoted: msg });

        // Path sementara
        const tmpDir = os.tmpdir();
        const safeName = title.replace(/[^a-z0-9_\-\.]/gi, '_').slice(0, 50);
        const outPath = path.join(tmpDir, `${safeName}_${Date.now()}.mp3`);

        try {
          // Download audio
          await youtubedl(videoUrl, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0,
            output: outPath
          });

          const buffer = fs.readFileSync(outPath);

          await sock.sendMessage(from, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`,
            contextInfo: { externalAdReply: { title, body: channel, mediaType: 1, sourceUrl: videoUrl } }
          }, { quoted: msg });

          await sock.sendMessage(from, { text: `🎶 Selesai: *${title}*` }, { quoted: msg });
        } catch (err) {
          console.error(err);
          await sock.sendMessage(from, { text: '❌ Gagal mengunduh lagu.' }, { quoted: msg });
        } finally {
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        }
      }

    } catch (e) {
      console.error('messages.upsert error', e);
    }
  });
}

start();