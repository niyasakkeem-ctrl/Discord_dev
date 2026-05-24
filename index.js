const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');

const PREFIX = '?';
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const LOG_CHANNEL_NAME = 'mod-logs';
const TICKET_CATEGORY_NAME = 'Tickets';
const ADMIN_APP_CHANNEL = 'admin-applications';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
  ]
});

let model = null;
if (GEMINI_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('✅ Gemini AI ready!');
  } catch (e) {
    console.log('❌ Gemini failed:', e.message);
  }
}

async function askGemini(prompt) {
  if (!model) return null;
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (e) {
    console.log('Gemini error:', e.message);
    return null;
  }
}

const spamMap = new Map();
const SPAM_THRESHOLD = 5;
const SPAM_INTERVAL = 4000;
const nukeMap = new Map();
const NUKE_THRESHOLD = 3;
const NUKE_INTERVAL = 10000;
const LINK_REGEX = /https?:\/\/|discord\.gg\/|www\./i;

// Application sessions: userId -> { type, step, answers, channelId }
const appSessions = new Map();

const STAFF_QUESTIONS = [
  '📝 **Question 1/4** — How old are you?',
  '📝 **Question 2/4** — How active are you? (hours per day)',
  '📝 **Question 3/4** — Do you have any previous moderation experience?',
  '📝 **Question 4/4** — Why do you want to join our Staff team?',
];

const ADMIN_QUESTIONS = [
  '📝 **Question 1/5** — How old are you?',
  '📝 **Question 2/5** — How active are you? (hours per day)',
  '📝 **Question 3/5** — Do you have any previous moderation experience?',
  '📝 **Question 4/5** — Do you have any past Admin experience?',
  '📝 **Question 5/5** — Why do you want to be an Admin?',
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

async function sendLog(guild, embed) {
  const logChannel = guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME);
  if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});
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
  const channelName = `${type}-${user.username.toLowerCase()}`;
  const existing = guild.channels.cache.find(c => c.name === channelName);
  if (existing) return { channel: existing, existed: true };
  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    ]
  });
  return { channel: ticketChannel, existed: false };
}

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity('?help | Made by Niyas 💙', { type: 3 });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  const content = message.content;
  const member = message.member;
  if (!member) return;

  // ── APPLICATION SESSION HANDLER ──
  if (appSessions.has(message.author.id)) {
    const session = appSessions.get(message.author.id);
    if (message.channel.id !== session.channelId) return;

    const questions = session.type === 'admin' ? ADMIN_QUESTIONS : STAFF_QUESTIONS;
    session.answers.push(content);

    if (session.step < questions.length - 1) {
      session.step++;
      await message.channel.send(new EmbedBuilder()
        .setColor('Blurple')
        .setDescription(questions[session.step])
        .setFooter({ text: 'Made by Niyas 💙 | Type your answer below' })
      );
    } else {
      // All questions answered — submit
      appSessions.delete(message.author.id);

      const questionList = questions.map((q, i) =>
        `**${q.replace(/📝 \*\*Question \d+\/\d+\*\* — /, '')}**\n${session.answers[i]}`
      ).join('\n\n');

      const submitEmbed = new EmbedBuilder()
        .setColor('Gold')
        .setTitle(`📋 ${session.type === 'admin' ? 'Admin' : 'Staff'} Application`)
        .setDescription(`${message.author} has submitted a **${session.type === 'admin' ? 'Admin' : 'Staff'}** application!\n\n${questionList}`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 User', value: message.author.tag, inline: true },
          { name: '🆔 User ID', value: message.author.id, inline: true },
          { name: '📅 Account Age', value: `<t:${Math.floor(message.author.createdTimestamp / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Made by Niyas 💙' })
        .setTimestamp();

      const appButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_admin_${message.author.id}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deny_admin_${message.author.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger)
      );

      // Send to admin-applications channel
      let appChannel = message.guild.channels.cache.find(c => c.name === ADMIN_APP_CHANNEL);
      if (!appChannel) {
        appChannel = await message.guild.channels.create({
          name: ADMIN_APP_CHANNEL,
          type: ChannelType.GuildText,
          permissionOverwrites: [{ id: message.guild.id, deny: [PermissionsBitField.Flags.SendMessages] }]
        });
      }
      await appChannel.send({ embeds: [submitEmbed], components: [appButtons] });

      const doneEmbed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('✅ Application Submitted!')
        .setDescription('Your application has been submitted! Our staff will review it soon.\n\nThis ticket will close in **10 seconds**.')
        .setFooter({ text: 'Made by Niyas 💙' })
        .setTimestamp();
      await message.channel.send({ embeds: [doneEmbed] });
      setTimeout(() => message.channel.delete().catch(() => {}), 10000);
    }
    return;
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
          await message.channel.send(`⚠️ ${message.author} stop spamming! (Fix: drag bot role above members in Server Settings → Roles)`);
        }
        return;
      }
    } else {
      spamMap.set(message.author.id, { count: 1, lastMessage: now });
    }
  }

  // ── AI MENTION ──
  if (message.mentions.has(client.user)) {
    const userMsg = content.replace(/<@!?[0-9]+>/g, '').trim();
    if (!userMsg) return message.reply('Ask me something bro! 🤖');
    await message.channel.sendTyping();
    const reply = await askGemini(userMsg);
    if (!reply) return message.reply('❌ AI not working! Check GEMINI_API_KEY on Render.');
    return message.reply({ embeds: [new EmbedBuilder().setColor('Blurple').setAuthor({ name: 'Gemini AI 🤖', iconURL: client.user.displayAvatarURL() }).setDescription(reply.slice(0, 2000)).setFooter({ text: `Asked by ${message.author.tag} | Made by Niyas 💙` }).setTimestamp()] });
  }

  if (!content.startsWith(PREFIX)) return;
  const args = content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'help') {
    return message.reply({ embeds: [new EmbedBuilder().setColor('Blurple').setTitle('📖 Bot Commands').setThumbnail(client.user.displayAvatarURL()).addFields({ name: '🎉 Fun', value: '`?fun` `?troll @user` `?roast @user`', inline: false }, { name: 'ℹ️ Info', value: '`?serverinfo` `?about` `?avatar [@user]` `?userinfo [@user]`', inline: false }, { name: '🎫 Tickets', value: '`?ticketpanel` — Send ticket panel\n`?closeticket` — Close ticket', inline: false }, { name: '🔨 Moderation', value: '`?ban @user` `?kick @user` `?timeout @user <mins>` `?unban <id>`', inline: false }, { name: '🛡️ Auto-Mod', value: 'Anti-Spam • Anti-Link • Anti-Nuke (automatic)', inline: false }, { name: '🤖 AI', value: 'Mention the bot and ask anything!', inline: false }).setFooter({ text: `Prefix: ${PREFIX} | Made by Niyas 💙` }).setTimestamp()] });
  }

  if (command === 'fun') {
    return message.reply({ embeds: [new EmbedBuilder().setColor('Yellow').setDescription(funResponses[Math.floor(Math.random() * funResponses.length)]).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  if (command === 'troll') {
    const target = message.mentions.members.first();
    return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setDescription(target ? `${target} — ${trollResponses[Math.floor(Math.random() * trollResponses.length)]}` : trollResponses[Math.floor(Math.random() * trollResponses.length)]).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  if (command === 'roast') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('Tag someone to roast! 😤 Example: `?roast @user`');
    await message.channel.sendTyping();
    const roast = await askGemini(`You are a savage Discord bot. Give ONE funny roast (max 1 sentence) for a user named "${target.user.username}". Playful, not offensive. No intro, just the roast.`);
    if (!roast) return message.reply('❌ Roast failed! Check GEMINI_API_KEY on Render.');
    return message.reply({ embeds: [new EmbedBuilder().setColor('Orange').setTitle('🔥 Roasted!').setDescription(`${target} — ${roast.trim()}`).setFooter({ text: `Roasted by ${message.author.tag} | Made by Niyas 💙` })] });
  }

  if (command === 'serverinfo') {
    const guild = message.guild;
    await guild.members.fetch();
    const bots = guild.members.cache.filter(m => m.user.bot).size;
    return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle(`📊 ${guild.name}`).setThumbnail(guild.iconURL({ dynamic: true })).addFields({ name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true }, { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }, { name: '👥 Members', value: `${guild.members.cache.size - bots} humans | ${bots} bots`, inline: true }, { name: '📢 Channels', value: `${guild.channels.cache.size}`, inline: true }, { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true }, { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true }, { name: '🔒 Verification', value: `${guild.verificationLevel}`, inline: true }, { name: '🆔 Server ID', value: guild.id, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  if (command === 'about') {
    return message.reply({ embeds: [new EmbedBuilder().setColor('Blurple').setTitle('🤖 About This Bot').setThumbnail(client.user.displayAvatarURL()).setDescription('A powerful all-in-one Discord bot with moderation, fun, AI and more!').addFields({ name: '👨‍💻 Made by', value: 'Niyas', inline: true }, { name: '⚙️ Built With', value: 'Node.js + discord.js', inline: true }, { name: '🛡️ Features', value: 'Anti-Spam, Anti-Nuke, Anti-Link, Tickets, Moderation, Fun, AI', inline: false }, { name: '📌 Prefix', value: `\`${PREFIX}\``, inline: true }, { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  if (command === 'avatar') {
    const target = message.mentions.members.first() || message.member;
    return message.reply({ embeds: [new EmbedBuilder().setColor('Aqua').setTitle(`🖼️ ${target.user.username}'s Avatar`).setImage(target.user.displayAvatarURL({ dynamic: true, size: 1024 })).setFooter({ text: 'Made by Niyas 💙' })] });
  }

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
      .setTitle('🎮 Gaming Support Center')
      .setDescription(
        'Need help? Open a ticket by clicking the button below!\n\n' +
        '💎 **Premium Buy** — Purchase ranks, perks & more\n' +
        '🎮 **Ingame Support** — Report bugs or ingame issues\n' +
        '👮 **Admin/Staff Apply** — Apply for our staff team\n\n' +
        '**Note:**\n' +
        '• Create a ticket only for real issues\n' +
        '• Don\'t create tickets for fun\n' +
        '• Fake tickets = timeout or ban ⚠️'
      )
      .setFooter({ text: 'Made by Niyas 💙 | One ticket per person' })
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

  if (command === 'unban') {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ You need Ban Members permission!');
    const userId = args[0];
    if (!userId) return message.reply('Provide a user ID!');
    await message.guild.members.unban(userId).catch(() => {});
    return message.reply(`✅ User \`${userId}\` unbanned.`);
  }
});

// ── BUTTONS ──
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // ── TICKET BUTTONS ──
  const ticketTypes = {
    ticket_premium: { name: 'premium', label: '💎 Premium Buy', color: 0x2ecc71, desc: 'Thanks for opening a **Premium Buy** ticket!\n\nPlease tell us what rank/perk you want to buy and your ingame username.\n\nOur staff will assist you shortly! 💎' },
    ticket_ingame: { name: 'ingame', label: '🎮 Ingame Support', color: 0x3498db, desc: 'Thanks for opening an **Ingame Support** ticket!\n\nPlease tell us your ingame username and what issue you are facing.\n\nOur staff will help you! 🎮' },
  };

  if (ticketTypes[interaction.customId]) {
    const type = ticketTypes[interaction.customId];
    const { channel, existed } = await createTicketChannel(interaction.guild, interaction.user, type.name);
    if (existed) return interaction.reply({ content: `❌ You already have an open ticket: ${channel}!`, ephemeral: true });

    const closeBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
    );
    const ticketEmbed = new EmbedBuilder()
      .setColor(type.color)
      .setTitle(`${type.label} Ticket`)
      .setDescription(type.desc)
      .addFields({ name: '👤 Opened by', value: `${interaction.user}`, inline: true }, { name: '📅 Opened at', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true })
      .setFooter({ text: 'Made by Niyas 💙 | Click button to close' })
      .setTimestamp();
    await channel.send({ content: `${interaction.user} Welcome!`, embeds: [ticketEmbed], components: [closeBtn] });
    return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }

  // ── STAFF APPLICATION BUTTON ──
  if (interaction.customId === 'ticket_staff') {
    const { channel, existed } = await createTicketChannel(interaction.guild, interaction.user, 'staff');
    if (existed) return interaction.reply({ content: `❌ You already have an open application: ${channel}!`, ephemeral: true });

    // Ask Admin or Staff
    const typeButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`apply_staff_${interaction.user.id}`).setLabel('👷 Staff').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`apply_admin_${interaction.user.id}`).setLabel('👑 Admin').setStyle(ButtonStyle.Danger)
    );
    const chooseEmbed = new EmbedBuilder()
      .setColor('Purple')
      .setTitle('👮 Staff/Admin Application')
      .setDescription(`Welcome ${interaction.user}! 👋\n\nWhat position are you applying for?`)
      .setFooter({ text: 'Made by Niyas 💙' })
      .setTimestamp();
    await channel.send({ embeds: [chooseEmbed], components: [typeButtons] });
    return interaction.reply({ content: `✅ Application channel created: ${channel}`, ephemeral: true });
  }

  // ── CHOOSE STAFF TYPE ──
  if (interaction.customId.startsWith('apply_staff_') || interaction.customId.startsWith('apply_admin_')) {
    const isAdmin = interaction.customId.startsWith('apply_admin_');
    const userId = interaction.customId.split('_').pop();
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ This is not your application!', ephemeral: true });

    const questions = isAdmin ? ADMIN_QUESTIONS : STAFF_QUESTIONS;
    appSessions.set(interaction.user.id, {
      type: isAdmin ? 'admin' : 'staff',
      step: 0,
      answers: [],
      channelId: interaction.channel.id
    });

    const startEmbed = new EmbedBuilder()
      .setColor(isAdmin ? 'Red' : 'Blue')
      .setTitle(`${isAdmin ? '👑 Admin' : '👷 Staff'} Application Started!`)
      .setDescription(`Great! Let's begin your **${isAdmin ? 'Admin' : 'Staff'}** application.\n\nAnswer each question by typing in this channel.\n\n${questions[0]}`)
      .setFooter({ text: 'Made by Niyas 💙 | Type your answer below' })
      .setTimestamp();
    await interaction.update({ embeds: [startEmbed], components: [] });
    return;
  }

  // ── CLOSE TICKET ──
  if (interaction.customId === 'close_ticket') {
    await interaction.reply('🔒 Closing ticket in 5 seconds...');
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    return;
  }

  // ── APPROVE ──
  if (interaction.customId.startsWith('approve_admin_')) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Only admins can approve!', ephemeral: true });
    const userId = interaction.customId.replace('approve_admin_', '');
    const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!targetMember) return interaction.reply({ content: '❌ User not found!', ephemeral: true });
    const role = interaction.guild.roles.cache.find(r => ['admin', 'staff', 'mod'].includes(r.name.toLowerCase()));
    if (!role) return interaction.reply({ content: '❌ No "admin", "staff" or "mod" role found! Create one first.', ephemeral: true });
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
    await interaction.update({ embeds: [new EmbedBuilder().setColor('Red').setTitle('❌ Application Denied!').setDescription(`${targetMember || userId}'s application denied by ${interaction.user}.`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()], components: [] });
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
app.listen(process.env.PORT || 3000, () => console.log('✅ Web server running!'));

client.login(TOKEN);
