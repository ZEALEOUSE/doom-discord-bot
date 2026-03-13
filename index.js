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
const SITE_URL = SITE_API.replace('/admin/api.php', '');


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
    new SlashCommandBuilder().setName('oda_kur').setDescription('[Admin] Oto-Oda sistemini kurar'),
    new SlashCommandBuilder().setName('ozel_kanal_kur').setDescription('[Admin] Özel kanal (Text/Voice) oluşturma panelini kurar'),
    new SlashCommandBuilder().setName('rol_yetki_reset').setDescription('[Owner] TÜM sunucu yetkilerini profesyonel şablona göre sıfırlayıp düzeltir'),
    
    // Gelişmiş Özellikler
    new SlashCommandBuilder().setName('turnuva_skor_gir').setDescription('[Staff] Bir maçın skorunu ve istatistiklerini günceller')
        .addStringOption(opt => opt.setName('mac_id').setDescription('Maç ID (Siteden alabilirsiniz)').setRequired(true))
        .addIntegerOption(opt => opt.setName('skor_biz').setDescription('Bizim skor (TEAM DOOM)').setRequired(true))
        .addIntegerOption(opt => opt.setName('skor_rakip').setDescription('Rakip skor').setRequired(true))
        .addStringOption(opt => opt.setName('durum').setDescription('Maç durumu').addChoices(
            { name: 'Tamamlandı', value: 'FINISHED' },
            { name: 'Canlı', value: 'ONGOING' },
            { name: 'Yaklaşan', value: 'UPCOMING' }
        )),
    new SlashCommandBuilder().setName('fikstur').setDescription('Yaklaşan turnuva maçlarını listeler'),
    new SlashCommandBuilder().setName('profil').setDescription('Oyuncu profil kartını görüntüler')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Profiline bakılacak kişi (Boş bırakırsan kendin)')),
    new SlashCommandBuilder().setName('duyuru').setDescription('[Staff] Gelişmiş duyuru ve bildirim sistemi')
        .addStringOption(opt => opt.setName('baslik').setDescription('Duyuru başlığı (Modalsız kullanım için)').setRequired(false))
        .addStringOption(opt => opt.setName('mesaj').setDescription('Duyuru içeriği (Modalsız kullanım için)').setRequired(false))
        .addStringOption(opt => opt.setName('renk').setDescription('Embed kenar rengi (Örn: #ff1a1a)').setRequired(false))
        .addStringOption(opt => opt.setName('gorsel').setDescription('Duyuruya eklenecek görsel (Resim URL)').setRequired(false))
        .addStringOption(opt => opt.setName('ping').setDescription('Bildirim türü (Everyone/Here)').addChoices(
            { name: 'None', value: 'none' },
            { name: 'Everyone', value: 'everyone' },
            { name: 'Here', value: 'here' }
        ).setRequired(false)),
    new SlashCommandBuilder().setName('profil').setDescription('Oyuncu profil kartını görüntüler')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Profiline bakılacak kişi (Boş bırakırsan kendin)')),
    
    // Rol Yönetimi
    new SlashCommandBuilder().setName('autorol_ayarla').setDescription('[Admin] Sunucuya yeni girenlere verilecek rolü ayarlar')
        .addRoleOption(opt => opt.setName('rol').setDescription('Verilecek rol (Boş bırakırsanız sistem kapanır)').setRequired(false)),
    new SlashCommandBuilder().setName('rol_herkese_ver').setDescription('[Admin] Sunucudaki TÜM ÜYELERE bir rol ekler')
        .addRoleOption(opt => opt.setName('rol').setDescription('Eklenecek rol').setRequired(true)),
    new SlashCommandBuilder().setName('rol_herkesten_al').setDescription('[Admin] Sunucudaki TÜM ÜYELERDEN bir rolü kaldırır')
        .addRoleOption(opt => opt.setName('rol').setDescription('Kaldırılacak rol').setRequired(true)),
    new SlashCommandBuilder().setName('duyuru_kur').setDescription('[Admin] Kalıcı bir duyuru hazırlama paneli oluşturur (Her zaman Everyone atar)')
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
                { name: '📜 **Rol Yönetimi**', value: '`/autorol_ayarla`, `/rol_herkese_ver`, `/rol_herkesten_al`' },
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
    else if (cmdName === 'ozel_kanal_kur') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return ctx.reply({ content: 'Yetkin yok!' });
        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('🔒 Özel Alan Oluştur')
            .setDescription('Kendine özel, sadece senin, davet ettiğin arkadaşların ve üst yönetimin görebileceği bir oda oluşturabilirsin.\n\n**Seçenekler:**\n💬 **Özel Metin Kanalı:** Yazışmalar için.\n🔊 **Özel Ses Kanalı:** Sohbet için.')
            .setFooter({ text: 'DOOM GUARD Gizli Alan Sistemi' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_private_text').setLabel('Metin Kanalı').setStyle(ButtonStyle.Primary).setEmoji('💬'),
            new ButtonBuilder().setCustomId('create_private_voice').setLabel('Ses Kanalı').setStyle(ButtonStyle.Success).setEmoji('🔊')
        );
        await ctx.channel.send({ embeds: [embed], components: [row] });
        if(ctx.isSlash) await ctx.reply({ content: '✅ Özel kanal paneli kuruldu.', ephemeral: true });
    }
    // ROL YÖNETİMİ
    else if (cmdName === 'autorol_ayarla') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return ctx.reply({ content: 'Yetkin yok! (Yönetici yetkisi lazım)' });
        
        let roleId = null;
        if (ctx.isSlash) {
            roleId = interaction.options.getRole('rol')?.id;
        } else {
            const mentionedRole = ctx.m.mentions.roles.first();
            roleId = mentionedRole ? mentionedRole.id : null;
        }

        db.autoRoleId = roleId;
        saveDb();

        if (roleId) {
            await ctx.reply(`✅ **Oto-Rol Aktif:** Sunucuya yeni katılanlara <@&${roleId}> rolü otomatik verilecek.`);
        } else {
            await ctx.reply(`❌ **Oto-Rol Kapatıldı:** Artık yeni girenlere otomatik rol verilmeyecek.`);
        }
    }
    else if (cmdName === 'rol_herkese_ver') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return ctx.reply({ content: 'Yetkin yok! (Yönetici yetkisi lazım)' });
        
        let role = null;
        if (ctx.isSlash) role = interaction.options.getRole('rol');
        else role = ctx.m.mentions.roles.first();

        if (!role) return ctx.reply('Lütfen bir rol belirtin.');
        
        await ctx.deferReply();
        try {
            const members = await guild.members.fetch();
            const membersToUpdate = members.filter(m => !m.user.bot && !m.roles.cache.has(role.id));
            
            await ctx.editReply(`🚀 **İşlem Başladı:** ${membersToUpdate.size} kişiye <@&${role.id}> rolü veriliyor...`);
            
            let count = 0;
            for (const [id, m] of membersToUpdate) {
                try {
                    await m.roles.add(role);
                    count++;
                    if (count % 10 === 0) await ctx.editReply(`🔄 Devam ediyor: **${count}/${membersToUpdate.size}** kişi tamamlandı.`);
                } catch(e) {}
            }
            await ctx.editReply(`✅ **İşlem Tamamlandı:** Toplam **${count}** kişiye <@&${role.id}> rolü verildi.`);
        } catch(e) { await ctx.editReply(`Hata: ${e.message}`); }
    }
    else if (cmdName === 'rol_herkesten_al') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return ctx.reply({ content: 'Yetkin yok! (Yönetici yetkisi lazım)' });
        
        let role = null;
        if (ctx.isSlash) role = interaction.options.getRole('rol');
        else role = ctx.m.mentions.roles.first();

        if (!role) return ctx.reply('Lütfen bir rol belirtin.');

        await ctx.deferReply();
        try {
            const members = await guild.members.fetch();
            const membersToUpdate = members.filter(m => !m.user.bot && m.roles.cache.has(role.id));
            
            await ctx.editReply(`🚀 **İşlem Başladı:** ${membersToUpdate.size} kişiden <@&${role.id}> rolü alınıyor...`);
            
            let count = 0;
            for (const [id, m] of membersToUpdate) {
                try {
                    await m.roles.remove(role);
                    count++;
                    if (count % 10 === 0) await ctx.editReply(`🔄 Devam ediyor: **${count}/${membersToUpdate.size}** kişi tamamlandı.`);
                } catch(e) {}
            }
            await ctx.editReply(`✅ **İşlem Tamamlandı:** Toplam **${count}** kişiden <@&${role.id}> rolü alındı.`);
        } catch(e) { await ctx.editReply(`Hata: ${e.message}`); }
    }
    // ROL YETKİ RESET (MASTER SYSTEM)
    else if (cmdName === 'rol_yetki_reset') {
        if (user.id !== guild.ownerId) return ctx.reply({ content: 'Bu kritik komutu sadece **Sunucu Sahibi** kullanabilir!' });
        
        await ctx.deferReply();
        try {
            const allRoles = await guild.roles.fetch();
            let log = '🔄 **YETKİ RESETLEME RAPORU**\n\n';
            
            // Perm Templates
            const p = PermissionsBitField.Flags;
            const t = {
                admin: [p.Administrator],
                coord: [p.ManageGuild, p.ManageRoles, p.ManageChannels, p.KickMembers, p.BanMembers, p.ManageMessages, p.ViewAuditLog, p.ModerateMembers, p.ManageNicknames, p.MoveMembers, p.MuteMembers, p.DeafenMembers, p.CreateInstantInvite, p.ViewChannel, p.SendMessages, p.EmbedLinks, p.AttachFiles, p.Connect, p.Speak, p.UseApplicationCommands],
                mod: [p.KickMembers, p.ManageMessages, p.ViewAuditLog, p.ModerateMembers, p.ManageNicknames, p.ViewChannel, p.SendMessages, p.EmbedLinks, p.AttachFiles, p.Connect, p.Speak, p.UseApplicationCommands],
                staff: [p.ManageMessages, p.MoveMembers, p.MuteMembers, p.PrioritySpeaker, p.ViewChannel, p.SendMessages, p.Connect, p.Speak, p.UseApplicationCommands],
                member: [p.ViewChannel, p.SendMessages, p.CreateInstantInvite, p.ChangeNickname, p.UseApplicationCommands, p.Connect, p.Speak, p.ReadMessageHistory, p.AddReactions, p.UseExternalEmojis]
            };

            for (const [id, role] of allRoles) {
                if (role.managed || role.id === guild.id) continue; // Skip bot roles and @everyone

                let newPerms = t.member; // Default
                const name = role.name.toLowerCase();

                if (name === '+') newPerms = t.admin;
                else if (name.includes('owner') || name.includes('genel koordinatör')) newPerms = t.coord;
                else if (name.includes('moderatör')) newPerms = t.mod;
                else if (name.includes('koordinatörü') || name.includes('menajer')) newPerms = t.staff;
                else if (name.includes('koç') || name.includes('analist')) newPerms = [p.ViewAuditLog, p.PrioritySpeaker, p.MoveMembers, ...t.member];
                else if (name.includes('oyuncu') || name.includes('team doom') || name.includes('üye') || name.includes('booster') || ['fps','moba','rts','battle royale'].some(x => name.includes(x))) newPerms = t.member;

                // Sync permissions
                await role.setPermissions(newPerms);
                log += `✅ **${role.name}** -> Yetkiler senkronize edildi.\n`;
            }

            const logEmbed = new EmbedBuilder().setColor('#2ecc71').setTitle('🛡️ Master Yetki Reset Tamamlandı').setDescription(log.slice(0, 4000));
            await ctx.editReply({ embeds: [logEmbed] });

            // ── BÖLÜM 2: KANAL YETKİ SENKRONİZASYONU ───────────────────────────
            let chLog = '📂 **KANAL YETKİ SENKRONİZASYONU**\n\n';
            const allChannels = await guild.channels.fetch();
            
            const staffCategoryKeywords = ['yönetim', 'staff', 'admin', 'koordinatör', 'yetkili', 'denetim', 'log'];
            const infoKeywords = ['kurallar', 'haberler', 'duyurular', 'çekiliş', 'bilgi', 'alım', 'başvuru'];
            const teamRole = allRoles.find(r => r.name.toLowerCase().includes('team doom sk'));
            const adminRole = allRoles.find(r => r.name === '+');

            for (const [id, channel] of allChannels) {
                if (!channel) continue;

                const name = channel.name.toLowerCase();
                const parentName = channel.parent ? channel.parent.name.toLowerCase() : '';

                // GÜVENLİ BÖLGE: Loglar, Ticketlar ve 🔒 ile başlayanlar asla ellenmez
                if (
                    name.includes('log') || 
                    name.includes('denetim') || 
                    name.includes('ticket') || 
                    name.startsWith('🔒') ||
                    parentName.includes('log') ||
                    parentName.includes('denetim')
                ) {
                    chLog += `⏭️ **${channel.name}** -> Atlandı (Güvenli Bölge)\n`;
                    continue;
                }

                try {
                    // 1. AYIRICI ÇİZGİLER (Herkes görür ama giremez, sadece + girebilir)
                    if (name.includes('----------')) {
                        await channel.permissionOverwrites.set([
                            { id: guild.id, allow: [p.ViewChannel], deny: [p.Connect] }
                        ]);
                        if (adminRole) await channel.permissionOverwrites.edit(adminRole, { ViewChannel: true, Connect: true });
                        chLog += `➖ **${channel.name}** -> Kilitli Ayırıcı (Görünür, Giriş Kapalı)\n`;
                        continue;
                    }

                    // 2. DUYURU / BİLGİ KANALLARI (Sadece Oku)
                    if (infoKeywords.some(k => name.includes(k))) {
                        await channel.permissionOverwrites.set([
                            { id: guild.id, allow: [p.ViewChannel], deny: [p.SendMessages] }
                        ]);
                        const coordRole = allRoles.find(r => r.name.toLowerCase().includes('genel koordinatör'));
                        if (coordRole) await channel.permissionOverwrites.edit(coordRole, { SendMessages: true });
                        await channel.permissionOverwrites.edit(ownerId, { SendMessages: true });
                        
                        chLog += `📢 **${channel.name}** -> Salt Okunur (Duyuru)\n`;
                        continue;
                    }

                    // 3. TURNUVA / TEAM DOOM SK ÖZEL (Sadece Takım ve Üst Yönetim)
                    if (name.includes('turnuva') || name.includes('team doom sk')) {
                        await channel.permissionOverwrites.set([
                            { id: guild.id, deny: [p.ViewChannel] }
                        ]);
                        if (teamRole) await channel.permissionOverwrites.edit(teamRole, { ViewChannel: true, Connect: true, Speak: true });
                        
                        const coordRole = allRoles.find(r => r.name.toLowerCase().includes('genel koordinatör'));
                        if (coordRole) await channel.permissionOverwrites.edit(coordRole, { ViewChannel: true });
                        await channel.permissionOverwrites.edit(ownerId, { ViewChannel: true });

                        chLog += `🏆 **${channel.name}** -> Takıma Özel (Gizli)\n`;
                        continue;
                    }

                    // 4. YÖNETİM / STAFF KANALLARI
                    const isStaff = staffCategoryKeywords.some(k => name.includes(k) || parentName.includes(k));
                    if (isStaff) {
                        await channel.permissionOverwrites.set([
                            { id: guild.id, deny: [p.ViewChannel] },
                            { id: ownerId, allow: [p.ViewChannel, p.SendMessages, p.ReadMessageHistory] }
                        ]);
                        const coordRole = allRoles.find(r => r.name.toLowerCase().includes('genel koordinatör'));
                        if (coordRole) await channel.permissionOverwrites.edit(coordRole, { ViewChannel: true, SendMessages: true });
                        
                        chLog += `🔒 **${channel.name}** -> Yönetime Özel\n`;
                    } else {
                        // 5. GENEL KANALLAR
                        await channel.permissionOverwrites.set([
                            { id: guild.id, allow: [p.ViewChannel] }
                        ]);
                        chLog += `🌍 **${channel.name}** -> Genel Erişim\n`;
                    }
                } catch (err) {
                    chLog += `❌ **${channel.name}** -> Hata: ${err.message}\n`;
                }
            }

            const chLogEmbed = new EmbedBuilder().setColor('#3498db').setTitle('📂 Master Kanal Senkronizasyonu').setDescription(chLog.slice(0, 4000));
            await ctx.channel.send({ embeds: [chLogEmbed] });

            sendLog(guild, { color: '#2ecc71', title: '🛡️ Master System Sync', desc: `${user.tag} tarafından TÜM ROL VE KANAL YETKİLERİ sıfırlanıp düzeltildi.` });
        } catch(e) {
            await ctx.editReply(`❌ HATA: Bitmeyen bir işlem oluştu veya yetkim yetmedi: ${e.message}`);
        }
    }
    // MAÇ VE SKOR YÖNETİMİ
    else if (cmdName === 'turnuva_skor_gir') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return ctx.reply({ content: 'Yetkin yok!' });
        
        await ctx.deferReply();
        const macId = interaction.options.getString('mac_id');
        const sBiz = interaction.options.getInteger('skor_biz');
        const sRakip = interaction.options.getInteger('skor_rakip');
        const durum = interaction.options.getString('durum') || 'FINISHED';

        try {
            const res = await axios.post(`${SITE_API}?action=update_match_score`, {
                id: macId,
                our_score: sBiz,
                opp_score: sRakip,
                status: durum
            });

            if (res.data.status === 'success') {
                const embed = new EmbedBuilder()
                    .setColor('#f1c40f')
                    .setTitle('🏆 Maç Skoru Güncellendi')
                    .setDescription(`**Maç ID:** ${macId}\n**Sonuç:** TEAM DOOM **${sBiz} - ${sRakip}** Rakip\n**Durum:** ${durum}`)
                    .setFooter({ text: 'Veriler web sitesi ile senkronize edildi.' });
                await ctx.editReply({ embeds: [embed] });
            } else {
                await ctx.editReply(`❌ Hata: ${res.data.message}`);
            }
        } catch(e) { await ctx.editReply(`API Bağlantı Hatası: ${e.message}`); }
    }
    else if (cmdName === 'fikstur') {
        await ctx.deferReply();
        try {
            const res = await axios.get(`${SITE_API}?action=public_data`);
            const upcomingMatches = res.data.matches.filter(m => m.status === 'UPCOMING').slice(0, 5);
            
            if (upcomingMatches.length === 0) return ctx.editReply('Yakın zamanda planlanmış mac bulunamadı.');

            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('📅 Yaklaşan Maç Fikstürü')
                .setDescription(upcomingMatches.map(m => `**${m.date} ${m.time}**\n🆚 vs ${m.opponent}\n🏆 ${m.tournament}`).join('\n\n'))
                .setFooter({ text: 'TEAM DOOM SK' });
            await ctx.editReply({ embeds: [embed] });
        } catch(e) { await ctx.editReply('Veriler alınırken hata oluştu.'); }
    }
    else if (cmdName === 'profil') {
        await ctx.deferReply();
        const targetUser = interaction.options.getUser('kullanici') || user;
        
        try {
            const res = await axios.get(`${SITE_API}?action=get_player_profile&discord_id=${targetUser.id}`);
            if (res.data.status === 'success') {
                const p = res.data.player;
                const embed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setAuthor({ name: `${p.nick} [${p.game_name || 'Multi'}]`, iconURL: targetUser.displayAvatarURL() })
                    .setTitle(`${p.team_name} - ${p.role}`)
                    .setThumbnail(p.img ? p.img : 'https://i.imgur.com/8Q9S8Xz.png')
                    .addFields(
                        { name: '🏆 Rank', value: p.rank || 'N/A', inline: true },
                        { name: '📊 Kariyer KDA', value: p.kda || 'N/A', inline: true },
                        { name: '📅 Katılım', value: p.joined_at || 'Bilinmiyor', inline: true }
                    )
                    .setDescription(p.description || 'Henüz bir açıklama eklenmemiş.')
                    .setFooter({ text: 'TEAM DOOM SK Resmi Oyuncu Kartı' });
                await ctx.editReply({ embeds: [embed] });
            } else {
                await ctx.editReply({ content: `🔍 <@${targetUser.id}> için kayıtlı bir oyuncu profili bulunamadı.`, ephemeral: true });
            }
        } catch(e) { await ctx.editReply('Profil bilgisi alınamadı.'); }
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
    else if (cmdName === 'duyuru') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return ctx.reply({ content: 'Yetkin yok!' });

        let baslik = ctx.getString('baslik', 0);
        let mesaj = ctx.getString('mesaj', 1, true);

        // Prefix Güzelleştirmesi: Eğer tek bir mesaj Bloğu varsa("|" ile ayırabilir)
        if (!ctx.isSlash && mesaj && mesaj.includes('|')) {
            const parts = mesaj.split('|').map(p => p.trim());
            baslik = parts[0];
            mesaj = parts[1];
        }
        const renk = ctx.getString('renk', 2) || '#ff1a1a';
        const gorsel = ctx.getString('gorsel', 3) || 'none';
        const ping = ctx.getString('ping', 4) || 'none';

        // Eğer başlık ve mesaj zaten komutta verilmişse (Direct Slash veya Prefix)
        if (baslik && mesaj) {
            await ctx.deferReply({ ephemeral: true });
            
            let channel = null;
            try {
                const configRes = await axios.get(`${SITE_API}?action=get_discord_config`);
                const newsChannelId = configRes.data?.config?.news_channel;
                if (newsChannelId) channel = await guild.channels.fetch(newsChannelId).catch(() => null);
            } catch (e) {}

            if (!channel) channel = guild.channels.cache.find(c => c.name.toLowerCase().includes('duyuru') || c.name.toLowerCase().includes('announcement'));
            if (!channel) return ctx.editReply({ content: '❌ Duyuru kanalı bulunamadı.' });

            const embed = new EmbedBuilder()
                .setTitle(`📢 ${baslik}`)
                .setDescription(mesaj)
                .setColor(renk.startsWith('#') ? renk : '#ff1a1a')
                .setThumbnail(guild.iconURL())
                .setTimestamp()
                .setFooter({ text: 'TEAM DOOM SK | Resmi Duyuru', iconURL: guild.iconURL() });

            if (gorsel && gorsel !== 'none') embed.setImage(gorsel);

            let content = '';
            if (ping === 'everyone') content = '@everyone';
            else if (ping === 'here') content = '@here';

            await channel.send({ content, embeds: [embed] });
            return ctx.editReply({ content: `✅ Duyuru başarıyla gönderildi: ${channel}` });
        }

        // Başlık/Mesaj yoksa MODAL aç (Sadece Slash için geçerli)
        if (!ctx.isSlash) return ctx.reply({ content: '❌ Başlık ve mesaj belirtmelisin! (Örn: `doomduyuru Başlık | Mesaj`)' });

        const modal = new ModalBuilder().setCustomId(`duyuru_modal_${ping}_${renk}_${gorsel}`).setTitle('📢 Duyuru Hazırla');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duyuru_baslik').setLabel('Duyuru Başlığı').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duyuru_mesaj').setLabel('Duyuru İçeriği').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        await ctx.i.showModal(modal);
    }
    else if (cmdName === 'duyuru_kur') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return ctx.reply({ content: 'Yetkin yok!' });
        
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📢 Duyuru Yönetim Paneli')
            .setDescription('Aşağıdaki butonu kullanarak hızlıca yeni bir duyuru hazırlayabilirsiniz.\n\n**Not:** Bu panel üzerinden yapılan tüm duyurular otomatik olarak `@everyone` etiketiyle paylaşılır.')
            .setFooter({ text: 'TEAM DOOM SK | Staff Only' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('duyuru_panel_ac').setLabel('Duyuru Hazırla').setStyle(ButtonStyle.Success).setEmoji('📝')
        );

        await ctx.reply({ embeds: [embed], components: [row] });
    }

}

// ── CANLI YAYIN TAKİP SİSTEMİ ──────────────────────────────────────────
async function checkStreams() {
    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return;

        const streamerRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('yayıncı'));
        const members = await guild.members.fetch({ withPresences: true });
        
        // Sadece Yayıncı rolü olan ve Yayın yapanları filtrele
        const liveMembers = members.filter(m => 
            (streamerRole ? m.roles.cache.has(streamerRole.id) : true) && 
            m.presence?.activities.some(a => a.type === ActivityType.Streaming)
        );

        for (const [id, member] of liveMembers) {
            const stream = member.presence.activities.find(a => a.type === ActivityType.Streaming);
            if (!db.lastStreamNotify) db.lastStreamNotify = {};
            
            const streamKey = `${id}_${stream.details || 'live'}`;
            if (db.lastStreamNotify[id] !== streamKey) {
                const notifyChannel = guild.channels.cache.find(c => c.name.toLowerCase().includes('canli-yayin'));
                if (notifyChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#6441a5')
                        .setTitle(`🟣 ${member.displayName} CANLI YAYINDA!`)
                        .setDescription(`**Başlık:** ${stream.details || 'E-Spor Yayını'}\n**Platform:** ${stream.name}\n\n[Yayını İzlemek İçin Tıkla](${stream.url})`)
                        .setThumbnail(member.user.displayAvatarURL())
                        .setImage('https://i.imgur.com/x9n8p8x.png')
                        .setFooter({ text: 'TEAM DOOM | Stream Tracker' });

                    await notifyChannel.send({ content: `@everyone **${member.displayName}** şu an canlı yayında! 🚀`, embeds: [embed] });
                    db.lastStreamNotify[id] = streamKey;
                    saveDb();
                }
            }
        }
    } catch (e) {
        console.error('Stream check error:', e.message);
    }
}

// ── BOT HAZIR OLDUĞUNDA ───────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`✅ MEGA BOT AKTİF: ${client.user.tag}`);
    // Stream check interval
    setInterval(checkStreams, 300000); // 5 dakikada bir kontrol
    checkStreams(); // Initial check on startup

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

    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
        console.log('✅ Global Slash komutları kaydedildi.');
    } catch (err) {}

    // ── BOT STATUS HEARTBEAT ──────────────────────────────
    async function updateBotStatus(status) {
        try {
            await axios.post(`${SITE_API}?action=update_bot_status`, { status });
        } catch (e) {
            console.error('Bot status update error:', e.message);
        }
    }

    // Set online on startup
    updateBotStatus('online');
    
    // Pulse every 60 seconds
    setInterval(() => updateBotStatus('online'), 60000);
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
        const customId = interaction.customId;

        if (customId === 'duyuru_panel_ac') {
            const modal = new ModalBuilder().setCustomId('duyuru_modal_everyone_#ff1a1a_none').setTitle('📢 Hızlı Duyuru (Everyone)');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duyuru_baslik').setLabel('Duyuru Başlığı').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duyuru_mesaj').setLabel('Duyuru İçeriği').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            return await interaction.showModal(modal);
        }

        if (customId === 'ticket_create') {
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
        } else if (interaction.customId.startsWith('create_private_')) {
            const type = interaction.customId.split('_').pop(); // text or voice
            const modal = new ModalBuilder().setCustomId(`private_modal_${type}`).setTitle(`Özel ${type === 'text' ? 'Metin' : 'Ses'} Kanalı`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_name').setLabel('Kanal Adı').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Örn: Dostlar Meclisi')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_friends').setLabel('Davetliler (Etiketle veya ID yaz)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Örn: @Samet @Ahmet veya IDler'))
            );
            await interaction.showModal(modal);
        } else if (interaction.customId === 'ozel_kanal_kapat') {
            await interaction.reply('🔒 Bu oda 5 saniye içinde imha edilecek...');
            setTimeout(() => interaction.channel.delete().catch(()=>{}), 5000);
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

    if (interaction.isModalSubmit()) {
        const customId = interaction.customId;

        if (customId.startsWith('duyuru_modal_')) {
            const [,,ping, color, image] = customId.split('_');
            const baslik = interaction.fields.getTextInputValue('duyuru_baslik');
            const mesaj = interaction.fields.getTextInputValue('duyuru_mesaj');

            let channel = null;
            try {
                const configRes = await axios.get(`${SITE_API}?action=get_discord_config`);
                const newsChannelId = configRes.data?.config?.news_channel;
                if (newsChannelId) {
                    channel = await interaction.guild.channels.fetch(newsChannelId).catch(() => null);
                }
            } catch (e) {
                console.error('Config fetch error:', e.message);
            }

            if (!channel) {
                channel = interaction.guild.channels.cache.find(c => c.name.toLowerCase().includes('duyuru') || c.name.toLowerCase().includes('announcement'));
            }

            if (!channel) return interaction.reply({ content: '❌ Duyuru kanalı bulunamadı.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle(`📢 ${baslik}`)
                .setDescription(mesaj)
                .setColor(color.startsWith('#') ? color : '#ff1a1a')
                .setThumbnail(interaction.guild.iconURL())
                .setTimestamp()
                .setFooter({ text: 'TEAM DOOM SK | Resmi Duyuru', iconURL: interaction.guild.iconURL() });

            if (image && image !== 'none') embed.setImage(image);

            let content = '';
            if (ping === 'everyone') content = '@everyone';
            else if (ping === 'here') content = '@here';

            await channel.send({ content, embeds: [embed] });
            await interaction.reply({ content: `✅ Duyuru başarıyla gönderildi: ${channel}`, ephemeral: true });
        }
        else if (customId.startsWith('private_modal_')) {
            const type = customId.split('_').pop();
            const name = interaction.fields.getTextInputValue('p_name');
            const friendsStr = interaction.fields.getTextInputValue('p_friends') || '';
            
            await interaction.deferReply({ ephemeral: true });

            try {
                const guild = interaction.guild;
                const ownerId = guild.ownerId;
                const coordRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('genel koordinatör'));
                
                const overwrites = [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.CreateInstantInvite] },
                    { id: ownerId, allow: [PermissionsBitField.Flags.ViewChannel] }
                ];
                if (coordRole) overwrites.push({ id: coordRole.id, allow: [PermissionsBitField.Flags.ViewChannel] });

                const memberIds = friendsStr.match(/\d{17,19}/g) || [];
                for (const id of memberIds) {
                    overwrites.push({ id, allow: [PermissionsBitField.Flags.ViewChannel] });
                }

                const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('özel'));
                const channel = await guild.channels.create({
                    name: `🔒-${name}`,
                    type: type === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice,
                    parent: category?.id,
                    permissionOverwrites: overwrites
                });

                const invite = await channel.createInvite({ maxAge: 86400, maxUses: 5 });
                const embed = new EmbedBuilder()
                    .setColor('#f1c40f')
                    .setTitle(`🏠 ${name} - Özel Alanın Hazır!`)
                    .setDescription(`Bu oda şu an sadece sana, davet ettiğin arkadaşlarına ve üst yönetime özeldir.\n\n**Erişim Bağlantısı:**\n${invite.url}`)
                    .addFields({ name: '⚠️ Bilgi', value: 'İşin bittiğinde "Kanalı Kapat" butonuyla odayı silebilirsin.' })
                    .setFooter({ text: 'DOOM GUARD' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ozel_kanal_kapat').setLabel('Kanalı Kapat ve Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
                );

                if (type === 'text') await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
                await interaction.editReply({ content: `✅ Özel kanalın oluşturuldu: ${channel}\n🔗 **Davet Linki:** ${invite.url}` });
            } catch(e) {
                await interaction.editReply({ content: `❌ Kanal oluşturulurken hata: ${e.message}` });
            }
        }
        else if (customId === 'ticket_modal') {
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
        }
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
client.on('guildMemberAdd', async member => {
    // Oto-Rol Sistemi
    if (db.autoRoleId) {
        try {
            const role = member.guild.roles.cache.get(db.autoRoleId);
            if (role) await member.roles.add(role);
        } catch(e) { console.error('Oto-rol hatası:', e); }
    }

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
