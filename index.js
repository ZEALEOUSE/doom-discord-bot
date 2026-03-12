require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ── SLASH KOMUT TANIMLARI ─────────────────────────────────────────────────────
const commands = [
    new SlashCommandBuilder()
        .setName('kadro')
        .setDescription('TEAM DOOM SK kadrosunu gösterir'),

    new SlashCommandBuilder()
        .setName('haberler')
        .setDescription('Son haberleri listeler'),

    new SlashCommandBuilder()
        .setName('maclar')
        .setDescription('Yaklaşan ve geçmiş maçları gösterir'),

    new SlashCommandBuilder()
        .setName('scout')
        .setDescription('Scout başvuru bilgisi ve linki'),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Bot sağlık kontrolü'),
];

// ── BOT HAZIR ─────────────────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`✅ Bot aktif: ${client.user.tag}`);

    // Slash komutları kaydet
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands.map(c => c.toJSON()) }
        );
        console.log('✅ Slash komutları kaydedildi.');
    } catch (err) {
        console.error('Komut kayıt hatası:', err);
    }
});

// ── SLASH KOMUT YANITLARI ────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const SITE_API = process.env.SITE_API_URL || 'https://teamdoomsk.com/admin/api.php';

    // /ping
    if (interaction.commandName === 'ping') {
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🏓 Pong!')
                .setDescription(`Gecikme: **${client.ws.ping}ms**`)
                .setFooter({ text: 'TEAM DOOM SK Bot Sistemi' })]
        });
    }

    // /scout
    if (interaction.commandName === 'scout') {
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor('#00ccff')
                .setTitle('🎯 TEAM DOOM SK Scout Başvurusu')
                .setDescription('TEAM DOOM SK ailesine katılmak için scout başvurusu yapabilirsin!')
                .addFields(
                    { name: '📋 Başvuru Formu', value: '[Buraya tıkla](https://teamdoomsk.com/scout)', inline: false },
                    { name: '📊 Başvurunu Takip Et', value: '[Takip linki](https://teamdoomsk.com/scout#track)', inline: false }
                )
                .setFooter({ text: 'TEAM DOOM SK Scout Sistemi' })]
        });
    }

    // /kadro
    if (interaction.commandName === 'kadro') {
        await interaction.deferReply();
        try {
            const res = await axios.get(`${SITE_API}?action=public_data`);
            const data = res.data;
            const roster = data.roster || {};

            const embed = new EmbedBuilder()
                .setColor('#ff1a1a')
                .setTitle('⚔️ TEAM DOOM SK — Kadro')
                .setTimestamp()
                .setFooter({ text: 'TEAM DOOM SK' });

            for (const [team, players] of Object.entries(roster)) {
                if (!players.length) continue;
                const list = players.map(p => `• **${p.nick}** (${p.role})`).join('\n');
                embed.addFields({ name: `🏷️ ${team}`, value: list, inline: false });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('❌ Kadro bilgisi alınamadı. Site erişim hatası.');
        }
    }

    // /haberler
    if (interaction.commandName === 'haberler') {
        await interaction.deferReply();
        try {
            const res = await axios.get(`${SITE_API}?action=public_data`);
            const news = (res.data.news || []).slice(0, 5);

            const embed = new EmbedBuilder()
                .setColor('#ff4444')
                .setTitle('📰 TEAM DOOM SK — Son Haberler')
                .setTimestamp()
                .setFooter({ text: 'TEAM DOOM SK Haber Bülteni' });

            if (!news.length) {
                embed.setDescription('Henüz haber yok.');
            } else {
                news.forEach((n, i) => {
                    embed.addFields({
                        name: `${i + 1}. ${n.title}`,
                        value: `${n.summary ? n.summary.substring(0, 80) + '...' : '—'} | 📅 ${n.date}`,
                        inline: false
                    });
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('❌ Haberler alınamadı.');
        }
    }

    // /maclar
    if (interaction.commandName === 'maclar') {
        await interaction.deferReply();
        try {
            const res = await axios.get(`${SITE_API}?action=public_data`);
            const matches = (res.data.matches || []).slice(0, 5);

            const embed = new EmbedBuilder()
                .setColor('#00ff88')
                .setTitle('🎮 TEAM DOOM SK — Maçlar')
                .setTimestamp()
                .setFooter({ text: 'TEAM DOOM SK Maç Sistemi' });

            if (!matches.length) {
                embed.setDescription('Yaklaşan maç bulunmuyor.');
            } else {
                matches.forEach(m => {
                    embed.addFields({
                        name: `🆚 ${m.opponent || 'TBD'}`,
                        value: `Oyun: ${m.game || '—'} | Tarih: ${m.date || '—'} | Durum: ${m.result || 'Yaklaşan'}`,
                        inline: false
                    });
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('❌ Maç bilgisi alınamadı.');
        }
    }
});

// ── WEBSİTESİNDEN GELEN BİLDİRİMLER (Webhook API) ───────────────────────────
app.post('/notify', async (req, res) => {
    const { type, data, channelId } = req.body;
    if (!channelId || !type) return res.status(400).json({ error: 'Eksik parametre' });

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });

        let embed = new EmbedBuilder().setColor('#5865F2').setTimestamp();

        if (type === 'scout') {
            embed.setTitle('📢 YENİ SCOUT BAŞVURUSU!')
                 .addFields(
                     { name: 'Nick', value: data.nick || '-', inline: true },
                     { name: 'Oyun', value: data.game || '-', inline: true },
                     { name: 'Yaş', value: String(data.age || '-'), inline: true }
                 );
        } else if (type === 'news') {
            embed.setTitle('📰 YENİ HABER!')
                 .setDescription(`**${data.title}**\n${data.summary || ''}`);
        }

        await channel.send({ embeds: [embed] });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ── UPTIME PING ENDPOİNTİ (UptimeRobot için) ─────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'online', bot: client.user?.tag || 'connecting...', timestamp: Date.now() });
});

// ── BAŞLAT ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API sunucusu çalışıyor: ${PORT}`));
client.login(process.env.DISCORD_TOKEN);
