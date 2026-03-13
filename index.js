require('dotenv').config();
const {
    Client, GatewayIntentBits, EmbedBuilder, REST, Routes,
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType,
    ChannelType, PermissionsBitField, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
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

// ── SLASH KOMUT TANIMLARI ──────────────────────────────────
const commands = [
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
    new SlashCommandBuilder().setName('profil').setDescription('Level, XP ve sunucu sıralamanızı görün')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Başkasının profiline bak').setRequired(false)),
    new SlashCommandBuilder().setName('siralamalar').setDescription('Sunucunun en aktif üyeleri (Top 10)'),
    new SlashCommandBuilder().setName('ticket_kur').setDescription('[Admin] Kalıcı bir destek (ticket) paneli oluşturur'),
    new SlashCommandBuilder().setName('scout_kur').setDescription('[Admin] Kalıcı bir scout başvuru paneli oluşturur'),
    
    // Moderasyon
    new SlashCommandBuilder().setName('temizle').setDescription('[Admin] Belirtilen sayıda mesajı siler')
        .addIntegerOption(opt => opt.setName('sayi').setDescription('Silinecek mesaj sayısı (1-100)').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('[Admin] Kullanıcıyı sunucudan atar')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Atılacak kişi').setRequired(true))
        .addStringOption(opt => opt.setName('sebep').setDescription('Atılma sebebi')),
    new SlashCommandBuilder().setName('ban').setDescription('[Admin] Kullanıcıyı sunucudan yasaklar')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Banlanacak kişi').setRequired(true))
        .addStringOption(opt => opt.setName('sebep').setDescription('Ban sebebi')),
    new SlashCommandBuilder().setName('oda_kur').setDescription('[Admin] Oto-Oda sistemini kurar')
];

// ── ORTAK KOMUT MİMARİSİ (PREFIX + SLASH) ──────────────────────────────
class CmdCtx {
    constructor(interaction, message, args) {
        this.i = interaction;
        this.m = message;
        this.isSlash = !!interaction;
        this.user = this.isSlash ? interaction.user : message.author;
        this.member = this.isSlash ? interaction.member : message.member;
        this.guild = this.isSlash ? interaction.guild : message.guild;
        this.channel = this.isSlash ? interaction.channel : message.channel;
        this.args = args || [];
    }
    async reply(options) {
        if (this.isSlash) return this.i.reply(options).catch(()=>{});
        return this.m.reply(options).catch(()=>{});
    }
    async deferReply() {
        if (this.isSlash) return this.i.deferReply().catch(()=>{});
        try { this.tempMsg = await this.m.reply('🔄 Yükleniyor...'); } catch(e){}
    }
    async editReply(options) {
        if (this.isSlash) return this.i.editReply(options).catch(()=>{});
        if (this.tempMsg) return this.tempMsg.edit(options).catch(()=>{});
        return this.m.reply(options).catch(()=>{});
    }

    // Argument getters
    getString(name, index, consumeAll = false) {
        if (this.isSlash) return this.i.options.getString(name);
        if (!this.args[index]) return null;
        return consumeAll ? this.args.slice(index).join(' ') : this.args[index];
    }
    getInteger(name, index) {
        if (this.isSlash) return this.i.options.getInteger(name);
        return this.args[index] ? parseInt(this.args[index]) : null;
    }
    getUser(name, index) {
        if (this.isSlash) return this.i.options.getUser(name);
        if (this.args[index]) {
            const id = this.args[index].replace(/[<@!>]/g, '');
            return this.guild.members.cache.get(id)?.user || null;
        }
        return null;
    }
}

async function executeCommand(cmdName, ctx) {
    const { user, guild, member } = ctx;

    if (cmdName === 'ping') {
        await ctx.reply({ content: `🏓 Pong! \`${client.ws.ping}ms\`` });
    }
    else if (cmdName === 'yardim') {
        const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('🛡️ DOOM GUARD Merkezi')
            .setDescription('**Team DOOM SK Discord Botu Komutları:**')
            .addFields(
                { name: '👥 **Kadro & Oyuncu**', value: '`kadro`, `oyuncu <nick>`, `scout`, `basvur`' },
                { name: '🎮 **Haberler & Maçlar**', value: '`haberler`, `maclar`, `istatistik`' },
                { name: '📊 **Ekonomi & Seviye**', value: '`profil`, `siralamalar`' },
                { name: '🎫 **Destek/Ticket**', value: 'Destek kanallarındaki butonları kullanın.' },
                { name: '⭐ **Moderasyon**', value: '`ticket_kur`, `oda_kur`, `temizle`, `kick`, `ban`' },
                { name: '💡 **Kullanım Notu**', value: 'Bu komutları ister **/** ile (örn: `/profil`), isterseniz de **doom** başlığıyla kullanabilirsiniz (örn: `doomprofil`).' }
            )
            .setFooter({ text: 'DOOM GUARD • teamdoomsk.com' })
            .setThumbnail(guild.iconURL({ dynamic: true }));
        await ctx.reply({ embeds: [embed] });
    }
    else if (cmdName === 'profil') {
        const targetUser = ctx.getUser('kullanici', 0) || user;
        const targetId = targetUser.id;
        
        const userData = db.xp[targetId] || { xp: 0, level: 1 };
        const nextXp = userData.level * 100;
        const progress = Math.round((userData.xp / nextXp) * 10);
        const pb = '█'.repeat(progress) + '░'.repeat(10 - progress);

        const sorted = Object.entries(db.xp).sort((a,b) => (b[1].level*1000 + b[1].xp) - (a[1].level*1000 + a[1].xp));
        const rank = sorted.findIndex(x => x[0] === targetId) + 1;

        const embed = new EmbedBuilder()
            .setColor('#cc00ff')
            .setTitle(`👤 ${targetUser.username} Profil Kartı`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: '⭐ Seviye', value: `Level ${userData.level}`, inline: true },
                { name: '✨ XP', value: `${userData.xp} / ${nextXp}`, inline: true },
                { name: '🏆 Sunucu Sırası', value: rank > 0 ? `#${rank}` : 'Derecesiz', inline: true },
                { name: '📊 İlerleme', value: `\`[${pb}]\` %${Math.round((userData.xp / nextXp) * 100)}`, inline: false }
            )
            .setFooter({ text: 'DOOM GUARD RPG System' });
        await ctx.reply({ embeds: [embed] });
    }
    else if (cmdName === 'siralamalar') {
        const sorted = Object.entries(db.xp).sort((a,b) => (b[1].level*1000 + b[1].xp) - (a[1].level*1000 + a[1].xp)).slice(0, 10);
        const embed = new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 Sunucu En İyileri (Top 10)').setTimestamp();
        let desc = sorted.length === 0 ? 'Henüz kimse XP kazanmadı.' : '';
        sorted.forEach((item, index) => {
            const badge = ['🥇', '🥈', '🥉'][index] || `**#${index+1}**`;
            desc += `${badge} <@${item[0]}> — **Lvl ${item[1].level}** (${item[1].xp} XP)\n`;
        });
        embed.setDescription(desc);
        await ctx.reply({ embeds: [embed] });
    }
    else if (cmdName === 'ticket_kur') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return ctx.reply({ content: 'Yetkin yok!' });
        const embed = new EmbedBuilder()
            .setColor('#2980b9')
            .setTitle('🎫 DOOM SK Destek Merkezi')
            .setDescription('Yönetimle iletişime geçmek, şikayet bildirmek, iş birliği teklifleri veya akademi desteği almak için aşağıdaki butona tıklayarak bir bilet oluşturun.\n\n*Gereksiz ticket açanlar uyarı alacaktır.*')
            .setFooter({ text: 'DOOM GUARD Destek Sistemi' })
            .setImage('https://teamdoomsk.com/assets/images/banner.jpg');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_create').setLabel('📩 Destek Talebi Oluştur').setStyle(ButtonStyle.Success).setEmoji('📨')
        );
        await ctx.channel.send({ embeds: [embed], components: [row] });
        if(ctx.isSlash) await ctx.reply({ content: '✅ Ticket paneli bu kanala başarıyla kuruldu.', ephemeral: true });
    }
    else if (cmdName === 'scout_kur') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return ctx.reply({ content: 'Yetkin yok!' });
        const embed = new EmbedBuilder()
            .setColor('#00ff88')
            .setTitle('🎯 Yetenek Avı: DOOM SCOUT')
            .setDescription('**Profesyonel E-Spor Kariyerine Var Mısın?**\nTakımımız Valorant, League of Legends, PUBG ve fazlası için düzenli scout(yetenek avı) alımları yapmaktadır. Performans testleri sonrası akademiye katılabilirsin!\n\n*(Başvurunuz doğrudan websitemiz üzerinden yönetime iletilecek ve sonucunuz DM kutunuza düşecektir)*')
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .setFooter({ text: 'DOOM GUARD E-Sports Pipeline' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('scout_create').setLabel('🚀 Scout (Akademi) Başvurusu Yap!').setStyle(ButtonStyle.Primary).setEmoji('🎮')
        );
        await ctx.channel.send({ embeds: [embed], components: [row] });
        if(ctx.isSlash) await ctx.reply({ content: '✅ Scout paneli bu kanala başarıyla kuruldu.', ephemeral: true });
    }
    else if (cmdName === 'temizle') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return ctx.reply({ content: 'Yetkin yok!' });
        const amount = ctx.getInteger('sayi', 0);
        if (!amount || amount < 1 || amount > 100) return ctx.reply({ content: '1-100 arası bir sayı girin.' });
        
        await ctx.channel.bulkDelete(amount, true);
        await ctx.reply({ content: `🧹 **${amount}** mesaj başarıyla silindi.` });
    }
    else if (cmdName === 'kick') {
        if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) return ctx.reply({ content: 'Yetkin yok!' });
        const target = ctx.getUser('kullanici', 0);
        if (!target) return ctx.reply({ content: 'Kullanıcı bulunamadı.' });
        const reason = ctx.getString('sebep', 1, true) || 'Sebep belirtilmedi.';
        
        const targetMember = guild.members.cache.get(target.id);
        if (!targetMember || !targetMember.kickable) return ctx.reply({ content: 'Bu kullanıcıyı atamam. Yetkim yetersiz.' });
        
        await targetMember.kick(reason);
        await ctx.reply(`🥾 **${target.tag}** sunucudan atıldı. (Sebep: *${reason}*)`);
        sendLog(guild, { color: '#e67e22', title: '🥾 Kick İşlemi', desc: `**Atan:** ${user}\n**Atılan:** ${target}\n**Sebep:** ${reason}` });
    }
    else if (cmdName === 'ban') {
        if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return ctx.reply({ content: 'Yetkin yok!' });
        const target = ctx.getUser('kullanici', 0);
        if (!target) return ctx.reply({ content: 'Kullanıcı bulunamadı.' });
        const reason = ctx.getString('sebep', 1, true) || 'Sebep belirtilmedi.';
        
        const targetMember = guild.members.cache.get(target.id);
        if (targetMember && !targetMember.bannable) return ctx.reply({ content: 'Bu kullanıcıyı yasaklayamam. Yetkim yetersiz.' });
        
        await guild.bans.create(target.id, { reason });
        await ctx.reply(`🔨 **${target.tag}** sunucudan YASAKLANDI! (Sebep: *${reason}*)`);
        sendLog(guild, { color: '#c0392b', title: '🔨 BAN İşlemi', desc: `**Banlayan:** ${user}\n**Banlanan:** ${target}\n**Sebep:** ${reason}` });
    }
    else if (cmdName === 'oda_kur') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return ctx.reply({ content: 'Yetkin yok!' });
        await ctx.deferReply();
        try {
            const category = await guild.channels.create({ name: '🗣️ GEÇİCİ ODALAR', type: ChannelType.GuildCategory });
            await guild.channels.create({ name: '➕ Oda Oluştur', type: ChannelType.GuildVoice, parent: category.id });
            await ctx.editReply('✅ Oto-Oda sistemi başarıyla kuruldu! Kullanıcılar "➕ Oda Oluştur" kanalına girince otomatik kanalları açılacak.');
        } catch (e) {
            await ctx.editReply('Hata: ' + e.message);
        }
    }
    // API ENTEGRASYONLU SİTE KOMUTLARI
    else if (cmdName === 'kadro') {
        await ctx.deferReply();
        try {
            const { data } = await axios.get(`${SITE_API}?action=public_data`);
            const roster = data.roster || {};
            const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('⚔️ TEAM DOOM E-SPOR KADROSU').setURL('https://teamdoomsk.com/kadro.html');
            for (const team in roster) {
                const pList = roster[team].map(p => `• **${p.nick}** (${p.role || p.rank})`).join('\n');
                if (pList) embed.addFields({ name: `🏆 ${team}`, value: pList, inline: true });
            }
            await ctx.editReply({ embeds: [embed] });
        } catch(e) { await ctx.editReply('Sistem verisi çekilemedi.'); }
    }
    else if (cmdName === 'haberler') {
        await ctx.deferReply();
        try {
            const { data } = await axios.get(`${SITE_API}?action=public_data`);
            const news = data.news?.slice(0, 3) || [];
            if(news.length === 0) return ctx.editReply('Henüz haber yok.');
            const embed = new EmbedBuilder().setColor('#f1c40f').setTitle('📰 Son DOOM SK Haberleri');
            news.forEach(n => embed.addFields({ name: `📌 ${n.title}`, value: `*${n.date}* - [Siteye Git](https://teamdoomsk.com)` }));
            await ctx.editReply({ embeds: [embed] });
        } catch(e) { await ctx.editReply('Sunucu hatası.'); }
    }
    else if (cmdName === 'maclar') {
        await ctx.deferReply();
        try {
            const { data } = await axios.get(`${SITE_API}?action=public_data`);
            const matches = data.matches?.slice(0, 3) || [];
            if(matches.length === 0) return ctx.editReply('Henüz maç kaydı yok.');
            const embed = new EmbedBuilder().setColor('#3498db').setTitle('⚔️ Yaklaşan/Son Maçlar');
            matches.forEach(m => {
                const result = m.status === 'finished' ? `(Skor: ${m.our_score} - ${m.opp_score})` : '(Yakında)';
                embed.addFields({ name: `🔥 DOOM vs ${m.opponent}`, value: `**${m.game}** | ${m.date} - ${m.time} ${result}\n*🏆 ${m.tournament}*` });
            });
            await ctx.editReply({ embeds: [embed] });
        } catch(e) { await ctx.editReply('Sunucu hatası.'); }
    }
    else if (cmdName === 'scout') {
        const embed = new EmbedBuilder()
            .setColor('#00ff88')
            .setTitle('🎯 Yetenek Avı: DOOM SCOUT')
            .setDescription('**Profesyonel E-Spor Kariyerine Var Mısın?**\nTakımımız Valorant, League of Legends, PUBG ve fazlası için düzenli scout(yetenek avı) alımları yapmaktadır. Performans testleri sonrası akademiye katılabilirsin!')
            .addFields({ name: 'Nasıl Başvurulur?', value: 'Hemen formumuzu doldurarak süreci başlat:\n👉 [BAŞVURU FORMU](https://teamdoomsk.com/scout)' });
        await ctx.reply({ embeds: [embed] });
    }
    else if (cmdName === 'basvur') {
        await ctx.reply('🚀 **Başvurunu Buradan Yapabilirsin:**\nhttps://teamdoomsk.com/scout');
    }
    else if (cmdName === 'istatistik') {
        await ctx.deferReply();
        try {
            const { data } = await axios.get(`${SITE_API}?action=public_data`);
            const apps = (data.scout_applications || []).length;
            const newsCount = (data.news || []).length;
            let players = 0;
            for(let t in (data.roster || {})) players += data.roster[t].length;
            const embed = new EmbedBuilder().setColor('#9b59b6').setTitle('📊 DOOM EKOSİSTEM İSTATİSTİKLERİ')
                .addFields(
                    { name: '👤 Kayıtlı Oyuncu', value: `${players} E-Sporcu`, inline: true },
                    { name: '📰 Toplam Haber', value: `${newsCount} Makale`, inline: true },
                    { name: '📝 Scout Başvuruları', value: `${apps} Aday`, inline: true }
                );
            await ctx.editReply({ embeds: [embed] });
        } catch(e) { await ctx.editReply('Sunucu hatası.'); }
    }
    else if (cmdName === 'oyuncu') {
        const nick = ctx.getString('nick', 0, true);
        if (!nick) return ctx.reply('Lütfen oyuncu nicki girin. `doomoyuncu Samet` vb.');
        await ctx.deferReply();
        try {
            const { data } = await axios.get(`${SITE_API}?action=public_data`);
            let found = null;
            let tName = '';
            for(const team in data.roster) {
                const foundP = data.roster[team].find(p => p.nick.toLowerCase().includes(nick.toLowerCase()));
                if(foundP) { found = foundP; tName = team; break; }
            }
            if(!found) return ctx.editReply(`❌ **${nick}** adında bir oyuncu kadroda bulunamadı.`);
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle(`👤 ${found.nick}`)
                .setDescription(`**Branş:** ${tName}\n**Rol/Mevki:** ${found.role}\n**Rank/Küme:** ${found.rank}\n**Sosyal:** ${found.social || 'Belirtilmedi'}`);
            if(found.img && found.img.includes('http')) embed.setThumbnail(found.img);
            await ctx.editReply({ embeds: [embed] });
        } catch(e) { await ctx.editReply('Sunucu hatası.'); }
    }
}

// ── BOT HAZIR OLDUĞUNDA ───────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`✅ MEGA BOT AKTİF: ${client.user.tag}`);
    const statuses = [
        { text: '/yardim veya doomYARDIM', type: ActivityType.Watching },
        { text: 'teamdoomsk.com', type: ActivityType.Playing },
        { text: `${client.users.cache.size} Kullanıcıyı`, type: ActivityType.Listening },
        { text: 'Scout Başvurularını', type: ActivityType.Watching }
    ];
    let s = 0;
    setInterval(() => {
        client.user.setPresence({ activities: [{ name: statuses[s].text, type: statuses[s].type }], status: 'online' });
        s = (s + 1) % statuses.length;
    }, 15000);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
        console.log('✅ Global Slash komutları kaydedildi.');
    } catch (err) {}
});

// ── PREFIX & XP (MESSAGE CREATE) ──────────────────────────────────────────────
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // PREFIX HANDLER ("doom")
    if (message.content.toLowerCase().startsWith('doom')) {
        const args = message.content.slice(4).trim().split(/ +/);
        const command = args.shift().toLowerCase(); // e.g., 'yardim'
        
        await executeCommand(command, new CmdCtx(null, message, args));
        return; // XP'den muaf tut (prefix komutlarına xp verilmez)
    }

    // XP SİSTEMİ
    const userId = message.author.id;
    if (!db.xp[userId]) db.xp[userId] = { xp: 0, level: 1, lastMsg: 0 };
    const now = Date.now();
    if (now - db.xp[userId].lastMsg > 60000) {
        db.xp[userId].xp += Math.floor(Math.random() * 15) + 10;
        db.xp[userId].lastMsg = now;
        const nextLevelXp = db.xp[userId].level * 100;
        if (db.xp[userId].xp >= nextLevelXp) {
            db.xp[userId].level++;
            db.xp[userId].xp = 0; 
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

// ── SLASH INTERACTION CREATE ──────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
    // Menüler & Modallar & Butonlar
    if (interaction.isButton()) {
        if (interaction.customId === 'ticket_create') {
            const modal = new ModalBuilder().setCustomId('ticket_modal').setTitle('🎫 Destek Talebi');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ticket_subject').setLabel('Konu').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ticket_desc').setLabel('Detaylı Açıklama').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            await interaction.showModal(modal);
        } else if (interaction.customId === 'ticket_close') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Yetki yok.', ephemeral: true });
            await interaction.reply('Kanal 5 saniye içinde kapatılıyor...');
            setTimeout(() => interaction.channel.delete().catch(()=>{}), 5000);
        } else if (interaction.customId === 'scout_create') {
            const modal = new ModalBuilder().setCustomId('scout_modal_1').setTitle('Adım 1: Kişisel Bilgiler');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_name').setLabel('Adınız Soyadınız').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Örn: Samet Karadağ')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_age').setLabel('Yaşınız').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Örn: 20')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_nick').setLabel('Oyun İçi Nick (IGN)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Örn: DOOM_Kral')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_email').setLabel('E-Posta Adresiniz').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Örn: iletisim@email.com'))
            );
            await interaction.showModal(modal);
        } else if (interaction.customId === 'scout_modal_2_open') {
            const userCache = db.scoutCache?.[interaction.user.id];
            if (!userCache) return interaction.reply({ content: '❌ Hata: Kayıp oturum. Lütfen yeniden başlayın.', ephemeral: true });

            const modal = new ModalBuilder().setCustomId('scout_modal_2').setTitle(`Adım 4: ${userCache.game} Detayları`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_rank').setLabel('Mevcut Rütbeniz / Kümeniz').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Örn: Yücelik 2 / Master')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_role').setLabel('Oynadığınız Rol / Mevki').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Örn: Entry Fragger / Support')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_hours').setLabel('Haftalık Oynama Saatiniz').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Örn: 40 Saat')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_links').setLabel('Profil, Tracker ve Video Linkleri').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Tracker.gg, Klipler vb.')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_reason').setLabel('Neden TEAM DOOM SK?').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Neden bize katılmak istiyorsun?'))
            );
            await interaction.showModal(modal);
        }
        return;
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'scout_branch_select') {
            const branch = interaction.values[0];
            db.scoutCache = db.scoutCache || {};
            if (!db.scoutCache[interaction.user.id]) return interaction.reply({ content: 'Oturum zaman aşımına uğradı.', ephemeral: true });
            
            db.scoutCache[interaction.user.id].branch = branch;

            let games = [];
            if (branch === 'FPS') games = ['Valorant', 'Counter Strike 2'];
            if (branch === 'MOBA') games = ['League of Legends (PC)', 'League of Legends: Wild Rift', 'Mobile Legends'];
            if (branch === 'BATTLEROYALE') games = ['PUBG Mobile', 'PUBG: BATTLEGROUNDS'];

            const select = new StringSelectMenuBuilder().setCustomId('scout_game_select').setPlaceholder('Oyununuzu Seçin');
            games.forEach(g => select.addOptions(new StringSelectMenuOptionBuilder().setLabel(g).setValue(g)));
            const row = new ActionRowBuilder().addComponents(select);
            await interaction.update({ content: `✅ Branş: **${branch}**\n▶️ **Adım 3:** Lütfen oyununuzu seçin:`, components: [row] });
        } else if (interaction.customId === 'scout_game_select') {
            const game = interaction.values[0];
            if (db.scoutCache?.[interaction.user.id]) {
                db.scoutCache[interaction.user.id].game = game;
            } else return interaction.reply({ content: 'Oturum zaman aşımı.', ephemeral: true });
            
            const btnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('scout_modal_2_open').setLabel(`${game} Detaylarını Doldur ve Bitir`).setStyle(ButtonStyle.Success).setEmoji('📝')
            );
            await interaction.update({ content: `✅ Seçilen Oyun: **${game}**\n▶️ **Son Adım:** Başvuruyu tamamlamak için aşağıdaki butona tıklayarak oyun bilgilerinizi girin.`, components: [btnRow] });
        }
        return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'scout_modal_1') {
        db.scoutCache = db.scoutCache || {};
        db.scoutCache[interaction.user.id] = {
            name: interaction.fields.getTextInputValue('s_name'),
            age: parseInt(interaction.fields.getTextInputValue('s_age').match(/\d+/)?.[0] || 0),
            nick: interaction.fields.getTextInputValue('s_nick'),
            email: interaction.fields.getTextInputValue('s_email') || ''
        };

        const select = new StringSelectMenuBuilder()
            .setCustomId('scout_branch_select')
            .setPlaceholder('Branş Seçin')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('FPS').setValue('FPS').setEmoji('🎯'),
                new StringSelectMenuOptionBuilder().setLabel('MOBA').setValue('MOBA').setEmoji('⚔️'),
                new StringSelectMenuOptionBuilder().setLabel('BATTLE ROYALE').setValue('BATTLEROYALE').setEmoji('🪂')
            );
        const row = new ActionRowBuilder().addComponents(select);
        await interaction.reply({ content: `✅ Bilgiler alındı Hoş geldin **${db.scoutCache[interaction.user.id].name}**!\n▶️ **Adım 2:** Şimdi başvuracağın branşı seç:`, components: [row], ephemeral: true });
        return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'scout_modal_2') {
        db.scoutCache = db.scoutCache || {};
        const userCache = db.scoutCache[interaction.user.id];
        if (!userCache) return interaction.reply({ content: '❌ Oturum zaman aşımı veya geçersiz data. Lütfen yeniden başlayın.', ephemeral: true });

        const payload = {
            name: userCache.name,
            nick: userCache.nick,
            age: userCache.age,
            discord: interaction.user.id,
            email: userCache.email || 'discord_basvuru',
            game: userCache.game || 'Belirtilmedi',
            rank: interaction.fields.getTextInputValue('s_rank'),
            role: interaction.fields.getTextInputValue('s_role'),
            hours: interaction.fields.getTextInputValue('s_hours'),
            profile_link: interaction.fields.getTextInputValue('s_links'),
            motivation: interaction.fields.getTextInputValue('s_reason'),
            notes: `Branş: ${userCache.branch || '?'} | Discord'dan Başvuru`
        };

        try {
            await axios.post(`${SITE_API}?action=scout_apply`, payload);
            await interaction.reply({ content: '🎉 **TEBRİKLER!** Başvurunuz başarıyla website yönetim paneline iletildi!\nDurumunuz değiştiğinde bot size DM gönderecektir.', ephemeral: true });
            sendLog(interaction.guild, { 
                color: '#00ccff', 
                title: '📢 Yeni Scout Başvurusu', 
                desc: `**Aday:** <@${interaction.user.id}>\n**Branş/Oyun:** ${userCache.branch} - ${userCache.game}\n**Adı:** ${userCache.name}\n**Mevki:** ${payload.role}\n**Rank:** ${payload.rank}` 
            });
            delete db.scoutCache[interaction.user.id];
        } catch(e) {
            await interaction.reply({ content: `❌ Başvuru websitesine iletilemedi! (${e.message})`, ephemeral: true });
        }
        return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
        const subject = interaction.fields.getTextInputValue('ticket_subject');
        const desc = interaction.fields.getTextInputValue('ticket_desc');
        db.tickets++;
        saveDb();
        const category = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket'));
        try {
            const tCh = await interaction.guild.channels.create({
                name: `ticket-${db.tickets}`, type: ChannelType.GuildText, parent: category?.id,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });
            const embed = new EmbedBuilder().setColor('#5865F2').setTitle(`🎫 Bilet #${db.tickets} - ${subject}`).setDescription(`**Kullanıcı:** ${interaction.user}\n**Kayıt:**\n${desc}`);
            const btnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Kapat').setStyle(ButtonStyle.Danger));
            await tCh.send({ embeds: [embed], components: [btnRow] });
            await interaction.reply({ content: `✅ ${tCh} oluşturuldu.`, ephemeral: true });
        } catch(e) { await interaction.reply({ content:`Hata: ${e.message}`, ephemeral: true }); }
        return;
    }

    // SLASH KOMUT ROUTER'I
    if (interaction.isChatInputCommand()) {
        await executeCommand(interaction.commandName, new CmdCtx(interaction, null, null));
    }
});

// ── OTO SES KANALI ───────────────────────────────────────────────────────────
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (newState.channel && newState.channel.name === '➕ Oda Oluştur') {
        try {
            const tCh = await newState.guild.channels.create({
                name: `🎧 ${newState.member.user.username}'in Odası`, type: ChannelType.GuildVoice, parent: newState.channel.parent,
                permissionOverwrites: [{ id: newState.member.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.DeafenMembers] }]
            });
            await newState.member.voice.setChannel(tCh);
        } catch(e) {}
    }
    if (oldState.channel && oldState.channel.name.includes('in Odası') && oldState.channel.members.size === 0) {
        try { await oldState.channel.delete(); } catch(e) {}
    }
});

// ── LOG & DENETİM ─────────────────────────────────────────────────────────────
function sendLog(guild, actionObj) {
    const logChannel = guild.channels.cache.find(c => c.name.includes('log') || c.name.includes('denetim'));
    if (!logChannel) return;
    const embed = new EmbedBuilder().setColor(actionObj.color).setTitle(actionObj.title).setDescription(actionObj.desc).setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(()=>{});
}
client.on('messageDelete', message => {
    if (message.author?.bot) return;
    sendLog(message.guild, { color: '#e74c3c', title: '🗑️ Mesaj Silindi', desc: `**${message.author}** in ${message.channel}\n${message.content}` });
});
client.on('messageUpdate', (oldMsg, newMsg) => {
    if (oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
    sendLog(oldMsg.guild, { color: '#f1c40f', title: '📝 Mesaj Düzenlendi', desc: `**${oldMsg.author}** in ${oldMsg.channel}\n**Eski:** ${oldMsg.content}\n**Yeni:** ${newMsg.content}` });
});
client.on('guildMemberAdd', member => {
    const ch = member.guild.systemChannel || member.guild.channels.cache.find(c => c.name.includes('hoş') || c.name.includes('welcome'));
    if (ch) ch.send({ content: `⚔️ **TEAM DOOM SK Ailesine Katıldı!**\nHoş geldin <@${member.user.id}>!` }).catch(()=>{});
    sendLog(member.guild, { color: '#2ecc71', title: '📥 Üye Katıldı', desc: `${member.user.tag} katıldı.` });
});
client.on('guildMemberRemove', member => {
    sendLog(member.guild, { color: '#e74c3c', title: '📤 Üye Ayrıldı', desc: `${member.user.tag} ayrıldı.` });
});

// ── WEB API ENDPOINTS ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

app.post('/notify', async (req, res) => {
    const { type, data, channelId } = req.body;
    if (!channelId || !type) return res.status(400).json({ error: 'Eksik parametre' });
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı' });
        let embed = new EmbedBuilder().setTimestamp();
        if (type === 'scout') embed.setColor('#00ccff').setTitle('📢 YENİ SCOUT BAŞVURUSU!').addFields({name:'Nick', value:data.nick||'-'});
        else if (type === 'news') embed.setColor('#ff4444').setTitle('📰 YENİ HABER!').setDescription(data.title);
        await channel.send({ embeds: [embed] });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/custom-message', async (req, res) => {
    const { channelId, message, embedColor, embedTitle } = req.body;
    try {
        const channel = await client.channels.fetch(channelId);
        const embed = new EmbedBuilder().setColor(embedColor || '#ffcc00').setDescription(message).setTimestamp();
        if (embedTitle) embed.setTitle(embedTitle);
        await channel.send({ embeds: [embed] });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/scout-status', async (req, res) => {
    const { discordId, status, adminNote } = req.body;
    console.log(`[Webhook] Scout Status Update: User=${discordId} Status=${status}`);
    
    try {
        const user = await client.users.fetch(discordId);
        if (user) {
            let color = '#f1c40f'; // İncelemede / Beklemede
            let desc = `Merhaba **${user.username}**, DOOM SK E-Spor Akademi (Scout) başvurunun durumu az önce güncellendi!\n\n**Yeni Durum:** \`${status}\``;
            
            // Web sitesinden gelen değerlerle eşleştirme (Kabul, Ret, İnceleniyor)
            if (status === 'Kabul' || status === 'Onaylandı') {
                color = '#2ecc71';
                desc = `🎉 **TEBRİKLER!** Scout başvurunuz **KABUL EDİLDİ!**\n\nEkibimiz en kısa sürede sizinle iletişime geçecektir. Hoş geldiniz!`;
            } else if (status === 'Ret' || status === 'Reddedildi') {
                color = '#e74c3c';
                desc = `😔 **Üzgünüz...** Scout başvurunuz şu an için **OLUMSUZ** değerlendirildi.\n\nWep sitemize ve duyurularımıza göz atarak gelecekte tekrar şansınızı deneyebilirsiniz.`;
            } else if (status === 'İnceleniyor') {
                color = '#3498db';
                desc = `🔍 **BİLGİ:** Scout başvurunuz şu an **İNCELEMEYE ALINDI.**\n\nLütfen beklemede kalın, yakında sonuçlanacaktır.`;
            }
            
            if (adminNote) desc += `\n\n**Yönetici Notu:**\n*${adminNote}*`;
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('🎯 Team DOOM SK Başvuru Sonucu')
                .setDescription(desc)
                .setFooter({ text: 'DOOM SK Yönetimi' })
                .setTimestamp();
            
            await user.send({ embeds: [embed] });
            console.log(`[Success] DM sent to ${user.tag}`);
        }
        res.json({ success: true });
    } catch(e) { 
        console.error(`[Error] Scout Status Webhook: ${e.message}`);
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/mass-dm', async (req, res) => {
    const { message, embedColor, embedTitle } = req.body;
    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const members = await guild.members.fetch();
        res.json({ success: true }); // respond early
        const embed = new EmbedBuilder().setColor(embedColor || '#5865F2').setDescription(message).setTimestamp();
        if (embedTitle) embed.setTitle(embedTitle);
        for (const [id, member] of members.filter(m => !m.user.bot)) {
            try { await member.send({ embeds: [embed] }); await new Promise(r => setTimeout(r, 1000)); } catch(e) {}
        }
    } catch(e) {}
});

app.listen(process.env.PORT || 3000, () => console.log('🚀 API IS ON'));
client.login(process.env.DISCORD_TOKEN);
