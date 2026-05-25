const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const express = require('express');

const PREFIX = '?';
const TOKEN = process.env.DISCORD_TOKEN;
const LOG_CHANNEL_NAME = 'mod-logs';
const TICKET_CATEGORY_NAME = 'Tickets';
const ADMIN_APP_CHANNEL = 'admin-applications';
const MIN_AGE = 13; // Change minimum age here

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
  ]
});

// ── SPAM TRACKER ──
const spamMap = new Map();
const warnMap = new Map(); // userId -> [{ reason, date, moderator }]
const SPAM_THRESHOLD = 5;
const SPAM_INTERVAL = 4000;

// ── NUKE TRACKER ──
const nukeMap = new Map();
const NUKE_THRESHOLD = 3;
const NUKE_INTERVAL = 10000;

// ── LINK REGEX ──
const LINK_REGEX = /https?:\/\/|discord\.gg\/|www\./i;

// ── APPLICATION SESSIONS ──
// userId -> { type, step, answers, channelId }
const appSessions = new Map();

const STAFF_QUESTIONS = [
  '📌 **Question 1/12:** What is your full Discord username (with #tag or UID)?',
  '📌 **Question 2/12:** What is your Minecraft in-game name (IGN)?',
  '📌 **Question 3/12:** What is your age? (Minimum age requirement applies)',
  '📌 **Question 4/12:** Which country and time zone do you live in?',
  '📌 **Question 5/12:** Have you ever been a staff member on any other Discord or Minecraft server? If yes, please explain your role and duties.',
  '📌 **Question 6/12:** How familiar are you with our server rules and community guidelines?',
  '📌 **Question 7/12:** What skills do you have that could help the server? (e.g., management, moderation, building, coding, event hosting)',
  '📌 **Question 8/12:** Do you have any past experience handling conflicts between players? Please describe one situation.',
  '📌 **Question 9/12:** How many hours per day or week can you dedicate to moderating the server? Are you comfortable being active in both Discord and Minecraft?',
  '📌 **Question 10/12:** Are you willing to stay committed for at least one full season?',
  '📌 **Question 11/12:** What would you do if you saw two players arguing and insulting each other in chat? If you accidentally made a mistake as staff, how would you deal with it?',
  '📌 **Question 12/12:** Why do you want to join the staff team, and what makes you a good fit for this position?',
];

const ADMIN_QUESTIONS = [
  '📌 **Question 1/12:** What is your full Discord username (with #tag or UID)?',
  '📌 **Question 2/12:** What is your Minecraft in-game name (IGN)?',
  '📌 **Question 3/12:** What is your age? (Minimum age requirement applies)',
  '📌 **Question 4/12:** Which country and time zone do you live in?',
  '📌 **Question 5/12:** Have you ever been a staff member on any other Discord or Minecraft server? If yes, please explain your role and duties.',
  '📌 **Question 6/12:** How familiar are you with our server rules and community guidelines?',
  '📌 **Question 7/12:** What skills do you have that could help the server? (e.g., management, moderation, building, coding, event hosting)',
  '📌 **Question 8/12:** Do you have any past experience handling conflicts between players? Please describe one situation.',
  '📌 **Question 9/12:** How many hours per day or week can you dedicate to moderating the server? Are you comfortable being active in both Discord and Minecraft?',
  '📌 **Question 10/12:** Are you willing to stay committed for at least one full season?',
  '📌 **Question 11/12:** What would you do if you saw two players arguing and insulting each other in chat? If you accidentally made a mistake as admin, how would you deal with it?',
  '📌 **Question 12/12:** Why do you want to be an Admin, and what makes you a good fit for this position?',
];

const trollResponses = [
  "Bro really thought that was smart 💀",
  "Skill issue detected 🔍",
  "Touch grass immediately 🌿",
  "My disappointment is immeasurable 📉",
  "Ratio + L + no cap + fell off 💔",
  "Who asked? 🤷",
  "Sir this is a Discord server 🍔",
  "Delulu behavior detected 🚨",
  "You're cooked bro fr fr 🔥",
  "Certified W moment... said no one ever 😭"
];

const funResponses = [
  "Why did the bot cross the road? To get to the other server! 🤖",
  "I'm not lazy, I'm on energy-saving mode 🔋",
  "Error 404: Motivation not found 😴",
  "Bro really woke up and chose chaos 💀",
  "We do a little trolling 😈",
  "Average Discord moment 🗿",
  "It's giving... something 👀",
  "No thoughts, head empty 🧠",
  "Based and redpilled... wait wrong server 💀",
  "Genuinely unhinged behavior detected 🚨"
];

// ── HELPERS ──
async function sendLog(guild, embed) {
  try {
    let logChannel = guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME);
    if (!logChannel) {
      logChannel = await guild.channels.create({
        name: LOG_CHANNEL_NAME,
        type: ChannelType.GuildText,
      });
    }
    await logChannel.send({ embeds: [embed] });
  } catch (e) {
    console.log('Log error:', e.message);
  }
}

function checkNuke(userId, action) {
  const now = Date.now();
  if (!nukeMap.has(userId)) nukeMap.set(userId, { deletes: 0, bans: 0, kicks: 0, time: now });
  const data = nukeMap.get(userId);
  if (now - data.time > NUKE_INTERVAL) nukeMap.set(userId, { deletes: 0, bans: 0, kicks: 0, time: now });
  data[action] = (data[action] || 0) + 1;
  return data[action] >= NUKE_THRESHOLD;
}

async function createTicketChannel(guild, user, type) {
  let category = guild.channels.cache.find(c => c.name === TICKET_CATEGORY_NAME && c.type === ChannelType.GuildCategory);
  if (!category) category = await guild.channels.create({ name: TICKET_CATEGORY_NAME, type: ChannelType.GuildCategory });
  const channelName = `${type}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const existing = guild.channels.cache.find(c => c.name === channelName);
  if (existing) return { channel: existing, existed: true };

  const ticketStaffRole = guild.roles.cache.find(r => r.name === '〻〢Ticket Staff');

  const permOverwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
  ];

  if (ticketStaffRole) {
    permOverwrites.push({
      id: ticketStaffRole.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages]
    });
  }

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: permOverwrites
  });
  return { channel: ticketChannel, existed: false };
}

// ── READY ──
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity('?help | Made by Niyas 💙', { type: 3 });
});

// ── MESSAGE EVENT ──
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  const content = message.content;
  const member = message.member;
  if (!member) return;

  // ── APPLICATION Q&A ──
  if (appSessions.has(message.author.id)) {
    const session = appSessions.get(message.author.id);
    // Only handle if message is in the correct ticket channel
    if (message.channel.id !== session.channelId) return;

    const questions = session.type === 'admin' ? ADMIN_QUESTIONS : STAFF_QUESTIONS;

    // Age check on Question 3 (index 2)
    if (session.step === 2) {
      const age = parseInt(content);
      if (isNaN(age)) {
        return message.reply('❌ Please type a valid number for your age!');
      }
      if (age < MIN_AGE) {
        appSessions.delete(message.author.id);
        await message.channel.send({ embeds: [new EmbedBuilder().setColor('Red').setTitle('❌ Application Rejected').setDescription(`Sorry ${message.author}, you must be at least **${MIN_AGE} years old** to apply!\n\nThis channel will close in 5 seconds.`).setFooter({ text: 'Made by Niyas 💙' })] });
        setTimeout(() => message.channel.delete().catch(() => {}), 5000);
        return;
      }
    }

    session.answers.push(content);

    if (session.step < questions.length - 1) {
      session.step++;
      appSessions.set(message.author.id, session);
      await message.channel.send({ embeds: [new EmbedBuilder().setColor('Blurple').setDescription(questions[session.step]).setFooter({ text: `Made by Niyas 💙 | Question ${session.step + 1}/${questions.length}` })] });
    } else {
      // Submit application
      appSessions.delete(message.author.id);

      const resultEmbed = new EmbedBuilder()
        .setColor('Gold')
        .setTitle(`📋 ${session.type === 'admin' ? '👑 Admin' : '🛡️ Staff'} Application`)
        .setDescription(`**Applicant:** ${message.author}\n**Type:** ${session.type === 'admin' ? 'Admin' : 'Staff'}`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Made by Niyas 💙' })
        .setTimestamp();

      questions.forEach((q, i) => {
        resultEmbed.addFields({ name: `Q${i + 1}: ${q.replace(/📌 \*\*Question \d+\/\d+:\*\* /, '')}`, value: session.answers[i] || 'No answer', inline: false });
      });

      const appButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_admin_${message.author.id}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deny_admin_${message.author.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger)
      );

      let appChannel = message.guild.channels.cache.find(c => c.name === ADMIN_APP_CHANNEL);
      if (!appChannel) {
        appChannel = await message.guild.channels.create({
          name: ADMIN_APP_CHANNEL,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: message.guild.id, deny: [PermissionsBitField.Flags.SendMessages] },
            { id: message.guild.members.me.id, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] }
          ]
        });
      }
      await appChannel.send({ embeds: [resultEmbed], components: [appButtons] });
      await message.channel.send({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Application Submitted!').setDescription(`Your **${session.type === 'admin' ? 'Admin' : 'Staff'}** application has been submitted!\n\nOur team will review and DM you the result. Good luck! 🍀`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
    }
    return; // Always return after handling Q&A
  }

  // ── ANTI-LINK ──
  if (LINK_REGEX.test(content) && !member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🔗 ${message.author}, links are not allowed here!`);
    setTimeout(() => warn.delete().catch(() => {}), 5000);
    return;
  }

  // ── ANTI-SPAM ──
  const now = Date.now();
  if (!spamMap.has(message.author.id)) {
    spamMap.set(message.author.id, { count: 1, lastMessage: now });
  } else {
    const sd = spamMap.get(message.author.id);
    if (now - sd.lastMessage < SPAM_INTERVAL) {
      sd.count++;
      sd.lastMessage = now;
      if (sd.count >= SPAM_THRESHOLD) {
        spamMap.set(message.author.id, { count: 0, lastMessage: now });
        try {
          await member.timeout(60000, 'Auto-timeout: Spamming');
          const spamEmbed = new EmbedBuilder()
            .setColor('Orange')
            .setTitle('🚨 Anti-Spam')
            .setDescription(`${message.author} has been timed out for **1 minute** for spamming!`)
            .setFooter({ text: 'Made by Niyas 💙' })
            .setTimestamp();
          await message.channel.send({ embeds: [spamEmbed] });
          await sendLog(message.guild, spamEmbed);
        } catch (e) {
          await message.channel.send(`⚠️ ${message.author} stop spamming!`);
        }
        return;
      }
    } else {
      spamMap.set(message.author.id, { count: 1, lastMessage: now });
    }
  }

  if (!content.startsWith(PREFIX)) return;
  const args = content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ── HELP ──
  if (command === 'help') {
    return message.reply({ embeds: [new EmbedBuilder().setColor('Blurple').setTitle('📖 Bot Commands').setThumbnail(client.user.displayAvatarURL()).addFields(
      { name: '🎉 Fun', value: '`?fun` `?troll @user` `?roast @user`', inline: false },
      { name: 'ℹ️ Info', value: '`?serverinfo` `?about` `?avatar [@user]` `?userinfo [@user]`', inline: false },
      { name: '🎫 Tickets', value: '`?ticketpanel` — Send ticket panel\n`?closeticket` — Close ticket', inline: false },
      { name: '🔨 Moderation', value: '`?ban @user` `?kick @user` `?timeout @user <mins>` `?unban <id>` `?lock` `?unlock` `?purge <1-100>` `?role @user @role` `?warn @user` `?warnings @user` `?clearwarn @user`', inline: false },
      { name: '🛡️ Auto-Mod', value: 'Anti-Spam • Anti-Link • Anti-Nuke (automatic)', inline: false }
    ).setFooter({ text: `Prefix: ${PREFIX} | Made by Niyas 💙` }).setTimestamp()] });
  }

  // ── FUN ──
  if (command === 'fun') {
    const pick = funResponses[Math.floor(Math.random() * funResponses.length)];
    return message.reply({ embeds: [new EmbedBuilder().setColor('Yellow').setDescription(pick).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  // ── TROLL ──
  if (command === 'troll') {
    const target = message.mentions.members.first();
    const pick = trollResponses[Math.floor(Math.random() * trollResponses.length)];
    return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setDescription(target ? `${target} — ${pick}` : pick).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  // ── ROAST ──
  if (command === 'roast') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('Tag someone to roast! `?roast @user`');
    const roasts = [
      `${target} — Your WiFi password is probably "password123" 💀`,
      `${target} — Even Google can't find your value 🔍`,
      `${target} — You're the reason they put instructions on shampoo bottles 😭`,
      `${target} — Your birth certificate is an apology letter 💔`,
      `${target} — Even your shadow doesn't want to follow you 🚶`,
    ];
    const pick = roasts[Math.floor(Math.random() * roasts.length)];
    return message.reply({ embeds: [new EmbedBuilder().setColor('Orange').setTitle('🔥 Roasted!').setDescription(pick).setFooter({ text: `Roasted by ${message.author.tag} | Made by Niyas 💙` })] });
  }

  // ── SERVER INFO ──
  if (command === 'serverinfo') {
    const guild = message.guild;
    await guild.members.fetch();
    const bots = guild.members.cache.filter(m => m.user.bot).size;
    const humans = guild.members.cache.size - bots;
    return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle(`📊 ${guild.name}`).setThumbnail(guild.iconURL({ dynamic: true })).addFields({ name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true }, { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }, { name: '👥 Members', value: `${humans} humans | ${bots} bots`, inline: true }, { name: '📢 Channels', value: `${guild.channels.cache.size}`, inline: true }, { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true }, { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true }, { name: '🔒 Verification', value: `${guild.verificationLevel}`, inline: true }, { name: '🆔 Server ID', value: guild.id, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  // ── ABOUT ──
  if (command === 'about') {
    return message.reply({ embeds: [new EmbedBuilder().setColor('Blurple').setTitle('🤖 About This Bot').setThumbnail(client.user.displayAvatarURL()).setDescription('A powerful all-in-one Discord bot with moderation, fun, and more!').addFields({ name: '👨‍💻 Made by', value: 'Niyas', inline: true }, { name: '⚙️ Built With', value: 'Node.js + discord.js', inline: true }, { name: '🛡️ Features', value: 'Anti-Spam, Anti-Nuke, Anti-Link, Tickets, Moderation, Fun', inline: false }, { name: '📌 Prefix', value: `\`${PREFIX}\``, inline: true }, { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  // ── AVATAR ──
  if (command === 'avatar') {
    const target = message.mentions.members.first() || message.member;
    return message.reply({ embeds: [new EmbedBuilder().setColor('Aqua').setTitle(`🖼️ ${target.user.username}'s Avatar`).setImage(target.user.displayAvatarURL({ dynamic: true, size: 1024 })).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  // ── USER INFO ──
  if (command === 'userinfo') {
    const target = message.mentions.members.first() || message.member;
    const roles = target.roles.cache.filter(r => r.id !== message.guild.id).map(r => `${r}`).join(', ') || 'None';
    return message.reply({ embeds: [new EmbedBuilder().setColor('Purple').setTitle(`👤 ${target.user.username}`).setThumbnail(target.user.displayAvatarURL({ dynamic: true })).addFields({ name: '🆔 User ID', value: target.user.id, inline: true }, { name: '🤖 Bot?', value: target.user.bot ? 'Yes' : 'No', inline: true }, { name: '📅 Account Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`, inline: true }, { name: '📥 Joined Server', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`, inline: true }, { name: '🎭 Top Role', value: `${target.roles.highest}`, inline: true }, { name: '📋 Roles', value: roles.length > 1024 ? 'Too many roles' : roles, inline: false }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  // ── TICKET PANEL ──
  if (command === 'ticketpanel') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('❌ You need Manage Channels permission!');
    const panelEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🎮 Gaming Support Tickets')
      .setDescription(
        'Need help? Open a ticket by clicking the button below!\n\n' +
        '💎 **Premium Buy** — Purchase ranks, perks & more\n' +
        '🎮 **Ingame Support** — Report bugs, issues ingame\n' +
        '👮 **Admin/Staff Apply** — Apply for staff team\n🔊 **Must join VC during application!**\n\n' +
        '**Note:**\n' +
        '• Create a ticket only for real issues\n' +
        '• Don\'t create tickets for fun\n' +
        '• Fake tickets = timeout or ban ⚠️'
      )
      .setFooter({ text: 'Made by Niyas 💙 | Only one ticket per person' })
      .setTimestamp();
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_premium').setLabel('💎 Premium Buy').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_ingame').setLabel('🎮 Ingame Support').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_staff').setLabel('👮 Admin/Staff Apply').setStyle(ButtonStyle.Secondary)
    );
    await message.channel.send({ embeds: [panelEmbed], components: [buttons] });
    await message.delete().catch(() => {});
    return;
  }

  // ── CLOSE TICKET ──
  if (command === 'closeticket') {
    const validTicket = ['premium-', 'ingame-', 'staff-', 'ticket-'].some(p => message.channel.name.startsWith(p));
    if (!validTicket) return message.reply('This is not a ticket channel!');
    await message.channel.send('🔒 Closing ticket in 5 seconds...');
    setTimeout(() => message.channel.delete().catch(() => {}), 5000);
    return;
  }

  // ── BAN ──
  if (command === 'ban') {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ You need Ban Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Tag someone to ban!');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.ban({ reason }).catch(() => {});
    const banEmbed = new EmbedBuilder().setColor('Red').setTitle('🔨 Member Banned').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Reason', value: reason, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [banEmbed] });
    await sendLog(message.guild, banEmbed);
    if (checkNuke(message.author.id, 'bans')) await message.member.ban({ reason: 'Anti-Nuke: Mass banning' }).catch(() => {});
    return;
  }

  // ── KICK ──
  if (command === 'kick') {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ You need Kick Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Tag someone to kick!');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.kick(reason).catch(() => {});
    const kickEmbed = new EmbedBuilder().setColor('Orange').setTitle('👢 Member Kicked').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Reason', value: reason, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [kickEmbed] });
    await sendLog(message.guild, kickEmbed);
    if (checkNuke(message.author.id, 'kicks')) await message.member.ban({ reason: 'Anti-Nuke: Mass kicking' }).catch(() => {});
    return;
  }

  // ── TIMEOUT ──
  if (command === 'timeout') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ You need Moderate Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Tag someone to timeout!');
    const minutes = parseInt(args[1]) || 5;
    const reason = args.slice(2).join(' ') || 'No reason provided';
    await target.timeout(minutes * 60000, reason).catch(() => {});
    const toEmbed = new EmbedBuilder().setColor('Yellow').setTitle('⏱️ Member Timed Out').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Duration', value: `${minutes} minutes`, inline: true }, { name: 'Reason', value: reason, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [toEmbed] });
    await sendLog(message.guild, toEmbed);
    return;
  }

  // ── UNBAN ──
  if (command === 'unban') {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ You need Ban Members permission!');
    const userId = args[0];
    if (!userId) return message.reply('Provide a user ID to unban!');
    await message.guild.members.unban(userId).catch(() => {});
    return message.reply(`✅ User \`${userId}\` unbanned.`);
  }

  // ── ROLE ──
  if (command === 'role') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return message.reply('❌ You need Manage Roles permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Tag someone! Example: `?role @user @role`');
    const role = message.mentions.roles.first();
    if (!role) return message.reply('❌ Tag a role! Example: `?role @user @role`');
    if (role.position >= message.guild.members.me.roles.highest.position) return message.reply('❌ That role is higher than my role!');
    if (target.roles.cache.has(role.id)) {
      await target.roles.remove(role).catch(() => {});
      const removeEmbed = new EmbedBuilder().setColor('Orange').setTitle('➖ Role Removed').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Role', value: role.name, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
      await message.reply({ embeds: [removeEmbed] });
      await sendLog(message.guild, removeEmbed);
    } else {
      await target.roles.add(role).catch(() => {});
      const addEmbed = new EmbedBuilder().setColor('Green').setTitle('➕ Role Added').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Role', value: role.name, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
      await message.reply({ embeds: [addEmbed] });
      await sendLog(message.guild, addEmbed);
    }
    return;
  }

  // ── WARN ──
  if (command === 'warn') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ You need Moderate Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Tag someone! Example: `?warn @user reason`');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const userId = target.user.id;
    if (!warnMap.has(userId)) warnMap.set(userId, []);
    const warns = warnMap.get(userId);
    warns.push({ reason, date: new Date().toLocaleDateString(), moderator: message.author.tag });
    const warnEmbed = new EmbedBuilder().setColor('Yellow').setTitle('⚠️ Member Warned').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Reason', value: reason, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }, { name: 'Total Warns', value: `${warns.length}`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [warnEmbed] });
    await sendLog(message.guild, warnEmbed);
    await target.send(`⚠️ You have been warned in **${message.guild.name}**!
**Reason:** ${reason}
**Total warnings:** ${warns.length}`).catch(() => {});
    // Auto timeout at 3 warns
    if (warns.length >= 3) {
      await target.timeout(300000, 'Auto-timeout: 3 warnings reached').catch(() => {});
      await message.channel.send({ embeds: [new EmbedBuilder().setColor('Orange').setTitle('🚨 Auto Timeout!').setDescription(`${target} reached **3 warnings** and has been timed out for 5 minutes!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
    }
    return;
  }

  // ── WARNINGS ──
  if (command === 'warnings') {
    const target = message.mentions.members.first() || message.member;
    const warns = warnMap.get(target.user.id) || [];
    if (warns.length === 0) return message.reply(`✅ ${target.user.tag} has no warnings!`);
    const warnList = warns.map((w, i) => `**${i + 1}.** ${w.reason} — by ${w.moderator} on ${w.date}`).join('\n');
    const warnsEmbed = new EmbedBuilder().setColor('Yellow').setTitle(`⚠️ Warnings — ${target.user.tag}`).setDescription(warnList).addFields({ name: 'Total', value: `${warns.length} warning(s)`, inline: true }).setThumbnail(target.user.displayAvatarURL({ dynamic: true })).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    return message.reply({ embeds: [warnsEmbed] });
  }

  // ── CLEARWARN ──
  if (command === 'clearwarn') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ You need Moderate Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Tag someone! Example: `?clearwarn @user`');
    warnMap.delete(target.user.id);
    return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Warnings Cleared').setDescription(`All warnings cleared for ${target.user.tag} by ${message.author}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  // ── LOCK ──
  if (command === 'lock') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ You need Administrator permission!');
    await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false }).catch(() => {});
    const lockEmbed = new EmbedBuilder().setColor('Red').setTitle('🔒 Channel Locked').setDescription(`${message.channel} has been locked by ${message.author}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [lockEmbed] });
    await sendLog(message.guild, lockEmbed);
    return;
  }

  // ── UNLOCK ──
  if (command === 'unlock') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ You need Administrator permission!');
    await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null }).catch(() => {});
    const unlockEmbed = new EmbedBuilder().setColor('Green').setTitle('🔓 Channel Unlocked').setDescription(`${message.channel} has been unlocked by ${message.author}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [unlockEmbed] });
    await sendLog(message.guild, unlockEmbed);
    return;
  }

  // ── PURGE ──
  if (command === 'purge') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ You need Administrator permission!');
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return message.reply('❌ Provide a number between 1-100!\nExample: `?purge 10`');
    await message.delete().catch(() => {});
    const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) return message.channel.send('❌ Could not delete! Messages older than 14 days cannot be deleted.');
    const purgeEmbed = new EmbedBuilder().setColor('Orange').setTitle('🗑️ Messages Purged').setDescription(`**${deleted.size}** messages deleted in ${message.channel} by ${message.author}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    const purgeMsg = await message.channel.send({ embeds: [purgeEmbed] });
    setTimeout(() => purgeMsg.delete().catch(() => {}), 5000);
    await sendLog(message.guild, purgeEmbed);
    return;
  }
});

// ── INTERACTIONS ──
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // ── PREMIUM TICKET ──
  if (interaction.customId === 'ticket_premium') {
    const { channel, existed } = await createTicketChannel(interaction.guild, interaction.user, 'premium');
    if (existed) return interaction.reply({ content: `You already have an open ticket: ${channel}! Close it first before opening a new one.`, ephemeral: true });
    const closeBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger));
    await channel.send({ content: `${interaction.user} Welcome!`, embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('💎 Premium Buy Ticket').setDescription('Thanks for opening a **Premium Buy** ticket!\n\nPlease tell us:\n• What rank/perk you want to buy\n• Your ingame username\n\nOur staff will assist you shortly! 💎').addFields({ name: '👤 Opened by', value: `${interaction.user}`, inline: true }, { name: '📅 Opened at', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()], components: [closeBtn] });
    return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }

  // ── INGAME TICKET ──
  if (interaction.customId === 'ticket_ingame') {
    const { channel, existed } = await createTicketChannel(interaction.guild, interaction.user, 'ingame');
    if (existed) return interaction.reply({ content: `You already have an open ticket: ${channel}! Close it first before opening a new one.`, ephemeral: true });
    const closeBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger));
    await channel.send({ content: `${interaction.user} Welcome!`, embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('🎮 Ingame Support Ticket').setDescription('Thanks for opening an **Ingame Support** ticket!\n\nPlease tell us:\n• Your ingame username\n• What issue you are facing\n• Screenshots if possible\n\nOur staff will help you! 🎮').addFields({ name: '👤 Opened by', value: `${interaction.user}`, inline: true }, { name: '📅 Opened at', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()], components: [closeBtn] });
    return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }

  // ── STAFF/ADMIN APPLY ──
  if (interaction.customId === 'ticket_staff') {
    const { channel, existed } = await createTicketChannel(interaction.guild, interaction.user, 'staff');
    if (existed) {
      const reopenBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`delete_old_app_${interaction.user.id}`).setLabel('🗑️ Delete Old & Apply Fresh').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('goto_old_app').setLabel('📂 Go to Existing').setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ content: `You already have an open application: ${channel}!
Want to delete it and apply fresh?`, components: [reopenBtn], ephemeral: true });
    }
    const choiceButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`apply_staff_${interaction.user.id}`).setLabel('🛡️ Staff').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`apply_admin_${interaction.user.id}`).setLabel('👑 Admin').setStyle(ButtonStyle.Danger)
    );
    await channel.send({ content: `${interaction.user}`, embeds: [new EmbedBuilder().setColor('Purple').setTitle('👮 Staff/Admin Application').setDescription(`Welcome ${interaction.user}!\n\n⚠️ **You must join the Voice Channel during your application!**\n\nWhat position are you applying for?`).setFooter({ text: 'Made by Niyas 💙' })], components: [choiceButtons] });
    return interaction.reply({ content: `✅ Application channel created: ${channel}`, ephemeral: true });
  }

  // ── STAFF CHOICE ──
  if (interaction.customId.startsWith('apply_staff_') || interaction.customId.startsWith('apply_admin_')) {
    const isAdmin = interaction.customId.startsWith('apply_admin_');
    const userId = interaction.customId.split('_').pop();
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ This is not your application!', ephemeral: true });

    appSessions.set(interaction.user.id, {
      type: isAdmin ? 'admin' : 'staff',
      step: 0,
      answers: [],
      channelId: interaction.channel.id
    });

    const questions = isAdmin ? ADMIN_QUESTIONS : STAFF_QUESTIONS;
    await interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(isAdmin ? 'Red' : 'Blue')
        .setTitle(`${isAdmin ? '👑 Admin' : '🛡️ Staff'} Application`)
        .setDescription(`Great! Let's begin. There are 12 questions total. Answer honestly!\n\n${questions[0]}\n\n⚠️ Minimum age: **${MIN_AGE}+** (Question 3)`)
        .setFooter({ text: 'Made by Niyas 💙 | Type your answer in this channel' })
      ],
      components: []
    });
    return;
  }

  // ── CLOSE TICKET ──
  if (interaction.customId === 'close_ticket') {
    const isStaff = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
    const isOwner = interaction.channel.permissionOverwrites.cache.has(interaction.user.id);
    if (!isStaff && !isOwner) return interaction.reply({ content: '❌ Only staff or the ticket owner can close this!', ephemeral: true });
    const confirmBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_close').setLabel('✅ Yes, Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel_close').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({ content: 'Are you sure you want to close this ticket?', components: [confirmBtn], ephemeral: false });
  }

  if (interaction.customId === 'confirm_close') {
    await interaction.update({ content: '🔒 Closing ticket in 5 seconds...', components: [] });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    return;
  }

  if (interaction.customId === 'cancel_close') {
    await interaction.update({ content: '✅ Close cancelled.', components: [] });
    return;
  }

  if (interaction.customId.startsWith('delete_old_app_')) {
    const userId = interaction.customId.replace('delete_old_app_', '');
    const oldChannel = interaction.guild.channels.cache.find(c => c.name === `staff-${interaction.guild.members.cache.get(userId)?.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    if (oldChannel) await oldChannel.delete().catch(() => {});
    appSessions.delete(userId);
    await interaction.update({ content: '✅ Old application deleted! Click **Admin/Staff Apply** again to start fresh.', components: [] });
    return;
  }

  if (interaction.customId === 'goto_old_app') {
    await interaction.update({ content: 'Go to your existing application channel!', components: [] });
    return;
  }

  // ── APPROVE ──
  if (interaction.customId.startsWith('approve_admin_')) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Only admins can approve!', ephemeral: true });
    const userId = interaction.customId.replace('approve_admin_', '');
    const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!targetMember) return interaction.reply({ content: '❌ User not found!', ephemeral: true });
    const role = interaction.guild.roles.cache.find(r => ['admin', 'staff', 'mod'].includes(r.name.toLowerCase()));
    if (!role) return interaction.reply({ content: '❌ No role named "admin", "staff" or "mod" found! Create one first.', ephemeral: true });
    await targetMember.roles.add(role).catch(() => {});
    await interaction.update({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Application Approved!').setDescription(`${targetMember} given **${role.name}** role by ${interaction.user}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()], components: [] });
    await targetMember.send('🎉 Congrats! Your application has been **approved**!').catch(() => {});
    return;
  }

  // ── DENY ──
  if (interaction.customId.startsWith('deny_admin_')) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Only admins can deny!', ephemeral: true });
    const userId = interaction.customId.replace('deny_admin_', '');
    const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
    await interaction.update({ embeds: [new EmbedBuilder().setColor('Red').setTitle('❌ Application Denied').setDescription(`${targetMember || userId}'s application was denied by ${interaction.user}.`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()], components: [] });
    if (targetMember) await targetMember.send('❌ Sorry, your application has been **denied**.').catch(() => {});
    return;
  }
});

// ── ANTI-NUKE ──
client.on('channelDelete', async (channel) => {
  const logs = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 }).catch(() => null);
  if (!logs) return;
  const entry = logs.entries.first();
  if (!entry || entry.executor.id === client.user.id) return;
  if (checkNuke(entry.executor.id, 'deletes')) {
    const m = await channel.guild.members.fetch(entry.executor.id).catch(() => null);
    if (m) {
      await m.ban({ reason: 'Anti-Nuke: Mass channel deletion' }).catch(() => {});
      await sendLog(channel.guild, new EmbedBuilder().setColor('DarkRed').setTitle('🚨 Anti-Nuke!').setDescription(`**${entry.executor.tag}** banned for mass channel deletion!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp());
    }
  }
});

// ── KEEP ALIVE ──
const app = express();
app.get('/', (req, res) => res.send('Bot is running! Made by Niyas 💙'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Web server running on port ${PORT}!`));

client.login(TOKEN);
