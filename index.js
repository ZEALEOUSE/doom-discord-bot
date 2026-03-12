require('dotenv').config();
const {
    Client, GatewayIntentBits, EmbedBuilder, REST, Routes,
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType,
    ChannelType, PermissionsBitField, AttachmentBuilder, StringSelectMenuBuilder
} = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ── GELİŞMİŞ INTENTS (Level, Log ve Moderasyon İçin) ────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ]
});

const SITE_API = process.env.SITE_API_URL || 'https://teamdoomsk.com/admin/api.php';

// ── BASİT VERİTABANI (JSON TABANLI) ──────────────────────────────────────────
const dbPath = path.join(__dirname, 'database.json');
let db = { xp: {}, tickets: 0, serverStatsId: null };
if (fs.existsSync(dbPath)) {
    db = JSON.parse(fs.readFileSync(dbPath));
}
function saveDb() {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// ── SLASH KOMUT TANIMLARI (MEGA BOT PAKETİ) ──────────────────────────────────
const commands = [
    // Genel Kullanıcı Komutları
    new SlashCommandBuilder().setName('ping').setDescription('Bot çalışma durumu ve gecikme metrikleri'),
    new SlashCommandBuilder().setName('yardim').setDescription('Gelişmiş komut merkezi'),
    new SlashCommandBuilder().setName('kadro').setDescription('Siteden senkronize aktif e-spor kadromuz'),
    new SlashCommandBuilder().setName('haberler').setDescription('DOOM SK son taktik ve haberleri'),
    new SlashCommandBuilder().setName('maclar').setDescription('Fikstür ve maç geçmişi'),
    new SlashCommandBuilder().setName('scout').setDescription('Scout sistemi detayları'),
    new SlashCommandBuilder().setName('basvur').setDescription('DOOM SK yetenek avı formu'),
    new SlashCommandBuilder().setName('istatistik').setDescription('Sunucu ve topluluk analizleri'),
    new SlashCommandBuilder().setName('oyuncu').setDescription('Kadrodaki bir oyuncuyu ara')
        .addStringOption(opt => opt.setName('nick').setDescription('Aranacak oyuncu nicki').setRequired(true)),

    // Level & Ekonomi Sistemi
    new SlashCommandBuilder().setName('profil').setDescription('Level, XP ve sunucu sıralamanızı görün')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Başkasının profiline bak').setRequired(false)),
    new SlashCommandBuilder().setName('siralamalar').setDescription('Sunucunun en aktif üyeleri (Top 10)'),

    // Destek Sistemi (Ticket)
    new SlashCommandBuilder().setName('destek').setDescription('Yönetime özel bilet (ticket) oluştur'),

    // Moderasyon Komutları (Sadece Yetkililer)
    new SlashCommandBuilder().setName('temizle').setDescription('[Admin] Belirtilen sayıda mesajı siler')
        .addIntegerOption(opt => opt.setName('sayi').setDescription('Silinecek mesaj sayısı (1-100)').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('[Admin] Kullanıcıyı sunucudan atar')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Atılacak kişi').setRequired(true))
        .addStringOption(opt => opt.setName('sebep').setDescription('Atılma sebebi')),
    new SlashCommandBuilder().setName('ban').setDescription('[Admin] Kullanıcıyı sunucudan yasaklar')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Banlanacak kişi').setRequired(true))
        .addStringOption(opt => opt.setName('sebep').setDescription('Ban sebebi')),
    
    // Geçici Ses Kanalı Kurulumu
    new SlashCommandBuilder().setName('oda_kur').setDescription('[Admin] Oto-Oda sistemini kurar')
];

// ── BOT HAZIR OLDUĞUNDA ───────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`✅ MEGA BOT AKTİF: ${client.user.tag}`);
    console.log(`🌐 ${client.guilds.cache.size} sunucuda hizmet veriyor.`);

    // Dinamik Durum Rotasyonu
    const statuses = [
        { text: '/yardim | DOOM GUARD', type: ActivityType.Watching },
        { text: 'teamdoomsk.com', type: ActivityType.Playing },
        { text: `${client.users.cache.size} Kullanıcıyı`, type: ActivityType.Listening },
        { text: 'Scout Başvurularını', type: ActivityType.Watching },
        { text: 'Valorant Antrenmanı', type: ActivityType.Competing }
    ];
    let s = 0;
    setInterval(() => {
        client.user.setPresence({ activities: [{ name: statuses[s].text, type: statuses[s].type }], status: 'online' });
        s = (s + 1) % statuses.length;
    }, 15000); // 15 Saniyede bir değişir (Dinamik hissettirir)

    // Komutları REST API ile Discord'a kayıt et
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
        console.log('✅ Global Slash komutları kaydedildi.');
    } catch (err) {
        console.error('Komut kayıt hatası:', err);
    }
});

// ── GELİŞMİŞ XP / LEVEL SİSTEMİ ───────────────────────────────────────────────
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // XP Ver
    const userId = message.author.id;
    if (!db.xp[userId]) db.xp[userId] = { xp: 0, level: 1, lastMsg: 0 };
    
    // Cooldown (Her mesaja anında XP vermez, spamı önler. 1 dakika bekleme)
    const now = Date.now();
    if (now - db.xp[userId].lastMsg > 60000) {
        const gainedXp = Math.floor(Math.random() * 15) + 10; // 10-25 arası rastgele XP
        db.xp[userId].xp += gainedXp;
        db.xp[userId].lastMsg = now;

        // Seviye Atlama Formülü (Classic RPG: Seviye * 100)
        const nextLevelXp = db.xp[userId].level * 100;
        if (db.xp[userId].xp >= nextLevelXp) {
            db.xp[userId].level++;
            db.xp[userId].xp = 0; // Kalan XP ile devam edebilir ama vintage hissiyatı için 0'lıyoruz
            
            const lvlEmbed = new EmbedBuilder()
                .setColor('#ffcc00')
                .setTitle('🎉 Seviye Atladın!')
                .setDescription(`Tebrikler <@${userId}>! Sunucudaki aktifliğin sayesinde **Seviye ${db.xp[userId].level}** oldun!`)
                .setThumbnail(message.author.displayAvatarURL());
            
            message.channel.send({ embeds: [lvlEmbed] }).catch(()=>{});
        }
        saveDb();
    }
});

// ── OTO SES KANALI - GEÇİCİ ODALAR (Temp VC) ──────────────────────────────────
// Kullanıcı "Oda Oluştur" isimli bir kanala girince ona özel kanal açar, çıkınca siler.
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Kurulum sırasında veya config'den çekilebilir. Şimdilik isim bazlı kontrol.
    const triggerChannelName = '➕ Oda Oluştur';
    
    // Odaya girilmişse
    if (newState.channel && newState.channel.name === triggerChannelName) {
        const guild = newState.guild;
        const category = newState.channel.parent;
        
        try {
            const tempChannel = await guild.channels.create({
                name: `🎧 ${newState.member.user.username}'in Odası`,
                type: ChannelType.GuildVoice,
                parent: category,
                permissionOverwrites: [
                    {
                        id: newState.member.id,
                        allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.DeafenMembers]
                    }
                ]
            });
            // Odayı taşı
            await newState.member.voice.setChannel(tempChannel);
        } catch (error) {
            console.error('Oto-Oda yapılamadı:', error);
        }
    }

    // Odadan çıkılmışsa ve kanal boşsa (ve geçici odaysa)
    if (oldState.channel && oldState.channel.name.includes('in Odası') && oldState.channel.members.size === 0) {
        try {
            await oldState.channel.delete('Geçici oda boşaldı');
        } catch (e) {}
    }
});

// ── GELİŞMİŞ LOG SİSTEMİ (Denetim Kaydı) ──────────────────────────────────────
function sendLog(guild, actionObj) {
    // Varsa "logs" veya "denetim" kanalına gönderir.
    const logChannel = guild.channels.cache.find(c => c.name.includes('log') || c.name.includes('denetim'));
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setColor(actionObj.color || '#333333')
        .setTitle(actionObj.title)
        .setDescription(actionObj.desc)
        .setTimestamp()
        .setFooter({ text: 'DOOM GUARD Security' });
    
    logChannel.send({ embeds: [embed] }).catch(()=>{});
}

client.on('messageDelete', message => {
    if (message.author?.bot) return;
    sendLog(message.guild, {
        color: '#e74c3c',
        title: '🗑️ Mesaj Silindi',
        desc: `**Yazan:** ${message.author}\n**Kanal:** ${message.channel}\n**İçerik:** ${message.content || '[Medya/Embed]'}`
    });
});
client.on('messageUpdate', (oldMsg, newMsg) => {
    if (oldMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;
    sendLog(oldMsg.guild, {
        color: '#f1c40f',
        title: '📝 Mesaj Düzenlendi',
        desc: `**Yazan:** ${oldMsg.author}\n**Kanal:** ${oldMsg.channel}\n\n**Eski:** ${oldMsg.content}\n**Yeni:** ${newMsg.content}`
    });
});

// ── WELCOME & GOODBYE SİSTEMİ ─────────────────────────────────────────────────
client.on('guildMemberAdd', member => {
    const ch = member.guild.systemChannel || member.guild.channels.cache.find(c => c.name.includes('hoş') || c.name.includes('welcome'));
    if (!ch) return;

    const embed = new EmbedBuilder()
        .setColor('#00ff88')
        .setTitle(`⚔️ TEAM DOOM SK Ailesine Katıldı!`)
        .setDescription(`Hoş geldin <@${member.user.id}>! Takımımızın **${member.guild.memberCount}.** üyesi oldun.\nKanalları incelemeyi ve kuralları okumayı unutma.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://teamdoomsk.com/assets/images/banner.jpg') // Varsayılan banner
        .setFooter({ text: 'DOOM GUARD Giriş Sistemi' })
        .setTimestamp();
    
    ch.send({ embeds: [embed] }).catch(()=>{});
    
    sendLog(member.guild, { color: '#2ecc71', title: '📥 Üye Katıldı', desc: `${member.user.tag} sunucuya girdi.` });
});
client.on('guildMemberRemove', member => {
    sendLog(member.guild, { color: '#e74c3c', title: '📤 Üye Ayrıldı', desc: `${member.user.tag} sunucudan çıktı.` });
});

// ── KOMUT ISLEYICI (INTERACTION_CREATE) ───────────────────────────────────────
client.on('interactionCreate', async interaction => {

    // ── BUTTON & SELECT MENU ──
    if (interaction.isButton()) {
        if (interaction.customId === 'ticket_create') {
            const modal = new ModalBuilder().setCustomId('ticket_modal').setTitle('🎫 Destek Talebi');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('ticket_subject').setLabel('Konu').setStyle(TextInputStyle.Short).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('ticket_desc').setLabel('Detaylı Açıklama').setStyle(TextInputStyle.Paragraph).setRequired(true)
                )
            );
            await interaction.showModal(modal);
        } else if (interaction.customId === 'ticket_close') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: 'Bunu sadece yetkililer yapabilir.', ephemeral: true });
            }
            await interaction.reply('Kanal 5 saniye içinde kapatılıyor...');
            setTimeout(() => interaction.channel.delete('Ticket kapatıldı'), 5000);
        }
        return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
        const subject = interaction.fields.getTextInputValue('ticket_subject');
        const desc = interaction.fields.getTextInputValue('ticket_desc');
        
        db.tickets++;
        saveDb();

        const channelName = `ticket-${db.tickets}`;
        const category = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket'));

        try {
            const ticketChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category || null,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🎫 Bilet #${db.tickets} - ${subject}`)
                .setDescription(`**Kullanıcı:** ${interaction.user}\n**Açıklama:**\n${desc}\n\n*Yetkililer en kısa sürede ilgilenecektir.*`);
            
            const btnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Talebi Kapat').setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ embeds: [embed], components: [btnRow] });
            await interaction.reply({ content: `✅ Talebin ${ticketChannel} kanalında oluşturuldu.`, ephemeral: true });
        } catch (e) {
            await interaction.reply({ content: `Hata oluştu: ${e.message}`, ephemeral: true });
        }
        return;
    }

    // Sadece komutlar devam etsin
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, guild, member } = interaction;

    // ── MODERASYON KOMUTLARI ──
    if (commandName === 'temizle') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: 'Yetkin yok!', ephemeral: true });
        const amount = options.getInteger('sayi');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '1-100 arası bir sayı girin.', ephemeral: true });
        
        await interaction.channel.bulkDelete(amount, true);
        await interaction.reply({ content: `🧹 **${amount}** mesaj başarıyla silindi.`, ephemeral: true });
    }
    
    else if (commandName === 'kick') {
        if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({ content: 'Yetkin yok!', ephemeral: true });
        const target = options.getUser('kullanici');
        const reason = options.getString('sebep') || 'Sebep belirtilmedi.';
        const targetMember = guild.members.cache.get(target.id);
        
        if (!targetMember) return interaction.reply({ content: 'Kullanıcı bulunamadı.', ephemeral: true });
        if (!targetMember.kickable) return interaction.reply({ content: 'Bu kullanıcıyı atamam. Yetkim yetersiz.', ephemeral: true });
        
        await targetMember.kick(reason);
        await interaction.reply(`🥾 **${target.tag}** sunucudan atıldı. (Sebep: *${reason}*)`);
        sendLog(guild, { color: '#e67e22', title: '🥾 Kick İşlemi', desc: `**Atan:** ${user}\n**Atılan:** ${target}\n**Sebep:** ${reason}` });
    }

    else if (commandName === 'ban') {
        if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: 'Yetkin yok!', ephemeral: true });
        const target = options.getUser('kullanici');
        const reason = options.getString('sebep') || 'Sebep belirtilmedi.';
        const targetMember = guild.members.cache.get(target.id);
        
        if (targetMember && !targetMember.bannable) return interaction.reply({ content: 'Bu kullanıcıyı yasaklayamam. Yetkim yetersiz.', ephemeral: true });
        
        await guild.bans.create(target.id, { reason });
        await interaction.reply(`🔨 **${target.tag}** sunucudan YASAKLANDI! (Sebep: *${reason}*)`);
        sendLog(guild, { color: '#c0392b', title: '🔨 BAN İşlemi', desc: `**Banlayan:** ${user}\n**Banlanan:** ${target}\n**Sebep:** ${reason}` });
    }

    else if (commandName === 'oda_kur') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Yetkin yok!', ephemeral: true });
        await interaction.deferReply();
        try {
            const category = await guild.channels.create({ name: '🗣️ GEÇİCİ ODALAR', type: ChannelType.GuildCategory });
            await guild.channels.create({ name: '➕ Oda Oluştur', type: ChannelType.GuildVoice, parent: category.id });
            await interaction.editReply('✅ Oto-Oda sistemi başarıyla kuruldu! Kullanıcılar "➕ Oda Oluştur" kanalına girince otomatik kanalları açılacak.');
        } catch (e) {
            await interaction.editReply('Hata: ' + e.message);
        }
    }

    else if (commandName === 'destek') {
        const embed = new EmbedBuilder()
            .setColor('#2980b9')
            .setTitle('🎫 DOOM SK Destek Merkezi')
            .setDescription('Yönetimle iletişime geçmek, şikayet bildirmek veya özel destek almak için aşağıdaki butona tıklayarak bir bilet oluşturun.')
            .setFooter({ text: 'DOOM GUARD Destek Sistemi' });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_create').setLabel('📩 Destek Talebi Oluştur').setStyle(ButtonStyle.Success)
        );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // ── LEVEL / PROFIL SISTEMI ──
    else if (commandName === 'profil') {
        const targetUser = options.getUser('kullanici') || user;
        const targetId = targetUser.id;
        
        const userData = db.xp[targetId] || { xp: 0, level: 1 };
        const nextXp = userData.level * 100;
        const progress = Math.round((userData.xp / nextXp) * 10);
        const pb = '█'.repeat(progress) + '░'.repeat(10 - progress);

        // Sıralamayı bul
        const sorted = Object.entries(db.xp).sort((a,b) => (b[1].level*1000 + b[1].xp) - (a[1].level*1000 + a[1].xp));
        const rank = sorted.findIndex(x => x[0] === targetId) + 1;

        const embed = new EmbedBuilder()
            .setColor('#cc00ff')
            .setTitle(`👤 ${targetUser.username} Profil Kartı`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: '⭐ Seviye', value: `Level ${userData.level}`, inline: true },
                { name: '✨ XP', value: `${userData.xp} / ${nextXp}`, inline: true },
                { name: '🏆 Sunucu Sıralaması', value: rank > 0 ? `#${rank}` : 'Derecesiz', inline: true },
                { name: '📊 İlerleme', value: `\`[${pb}]\` %${Math.round((userData.xp / nextXp) * 100)}`, inline: false }
            )
            .setFooter({ text: 'DOOM GUARD RPG System' });
        
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'siralamalar') {
        const sorted = Object.entries(db.xp).sort((a,b) => (b[1].level*1000 + b[1].xp) - (a[1].level*1000 + a[1].xp)).slice(0, 10);
        
        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('🏆 Sunucu En İyileri (Top 10)')
            .setTimestamp();
        
        if (sorted.length === 0) {
            embed.setDescription('Henüz kimse XP kazanmadı.');
        } else {
            let desc = '';
            sorted.forEach((item, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const badge = medals[index] || `**#${index+1}**`;
                desc += `${badge} <@${item[0]}> — **Lvl ${item[1].level}** (${item[1].xp} XP)\n`;
            });
            embed.setDescription(desc);
        }
        await interaction.reply({ embeds: [embed] });
    }

    // Diğer eski komutlar (kadro, haberler, maclar, scout vb. aynen duruyor -> onları da sarmalayabilirsin)
    // Örnek: ping
    else if (commandName === 'ping') {
        await interaction.reply({ content: `🏓 Pong! \`${client.ws.ping}ms\`` });
    }
});

// ── WEBSİTESİNDEN BİLDİRİM (PHP api.php'den tetiklenir) ──────────────────────
app.post('/notify', async (req, res) => {
    const { type, data, channelId } = req.body;
    if (!channelId || !type) return res.status(400).json({ error: 'Eksik parametre' });

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });

        let embed = new EmbedBuilder().setTimestamp();

        if (type === 'scout') {
            embed.setColor('#00ccff').setTitle('📢 YENİ SCOUT BAŞVURUSU!')
                 .addFields(
                     { name: 'Nick', value: data.nick || '-', inline: true },
                     { name: 'Oyun', value: data.game || '-', inline: true },
                     { name: 'Daha Fazla', value: '[Panelden Oku](https://teamdoomsk.com/bot-portal)', inline: false }
                 )
                 .setFooter({ text: 'DOOM GUARD Alert System' });
        } else if (type === 'news') {
            embed.setColor('#ff4444').setTitle('📰 YENİ HABER YAYINLANDI!')
                 .setDescription(`**${data.title}**\n\n[Devamını Sitede Oku](https://teamdoomsk.com)`)
                 .setImage('https://teamdoomsk.com/assets/images/banner.jpg');
        }

        await channel.send({ embeds: [embed] });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
// ── WEBSİTESİNDEN GELEN ÖZEL MESAJLAR VE DM BİLDİRİMLERİ ──────────────────────────────
app.post('/custom-message', async (req, res) => {
    const { channelId, message, embedColor, embedTitle } = req.body;
    if (!channelId || !message) return res.status(400).json({ error: 'Eksik parametre' });

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });

        const embed = new EmbedBuilder()
            .setColor(embedColor || '#ffcc00')
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: 'DOOM GUARD Web Kontrol' });
            
        if (embedTitle) embed.setTitle(embedTitle);

        await channel.send({ embeds: [embed] });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/mass-dm', async (req, res) => {
    const { message, embedColor, embedTitle } = req.body;
    if (!message) return res.status(400).json({ error: 'Mesaj boş olamaz' });

    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Sunucu bulunamadı' });

        await guild.members.fetch();
        const members = guild.members.cache.filter(m => !m.user.bot);
        
        let sentCount = 0;
        let failCount = 0;

        const embed = new EmbedBuilder()
            .setColor(embedColor || '#5865F2')
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: 'DOOM SK Özel Duyuru' });
            
        if (embedTitle) embed.setTitle(embedTitle);

        res.json({ success: true, message: 'Toplu DM işlemi başlatıldı. Bu biraz zaman alabilir.' }); // İsteği bekletmemek için erken dönüş

        for (const [id, member] of members) {
            try {
                await member.send({ embeds: [embed] });
                sentCount++;
                // Discord API Rate limitlerine takılmamak için küçük gecikmeler (1 saniye)
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                failCount++;
            }
        }
        console.log(`Toplu DM bitti. Başarılı: ${sentCount}, Başarısız: ${failCount}`);
    } catch (err) {
        console.error('Mass DM Error:', err);
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API çalışıyor: ${PORT}`));
client.login(process.env.DISCORD_TOKEN);
