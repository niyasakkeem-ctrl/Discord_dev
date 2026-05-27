const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const express = require('express');

const PREFIX = '?';
const TOKEN = process.env.DISCORD_TOKEN;
const LOG_CHANNEL_NAME = 'mod-logs';
const TICKET_CATEGORY_NAME = 'Tickets';
const ADMIN_APP_CHANNEL = 'admin-applications';
const MIN_AGE = 13;
const WELCOME_CHANNEL_NAME = 'welcome';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
  ]
});

// ── DATA STORES ──
const spamMap = new Map();
const autoReplyMap = new Map(); // trigger -> response
const snipeMap = new Map(); // channelId -> { content, author, image, time }
const warnMap = new Map();
const nukeMap = new Map();
const appSessions = new Map();
const afkMap = new Map();
const birthdayMap = new Map();
const giveawayMap = new Map();
let autoRoleId = null;
let birthdayChannelId = null;
let welcomeChannelOverride = null;
let welcomeMessage = null;

const SPAM_THRESHOLD = 5;
const SPAM_INTERVAL = 4000;
const NUKE_THRESHOLD = 3;
const NUKE_INTERVAL = 10000;
const LINK_REGEX = /https?:\/\/|discord\.gg\/|www\./i;

// ── QUESTIONS ──
const STAFF_QUESTIONS = [
  '📌 **Q1/12:** What is your full Discord username?',
  '📌 **Q2/12:** What is your Minecraft IGN?',
  '📌 **Q3/12:** What is your age?',
  '📌 **Q4/12:** Which country and time zone?',
  '📌 **Q5/12:** Any previous staff experience?',
  '📌 **Q6/12:** How familiar are you with our rules?',
  '📌 **Q7/12:** What skills do you have?',
  '📌 **Q8/12:** Past experience handling conflicts?',
  '📌 **Q9/12:** How many hours per day can you dedicate?',
  '📌 **Q10/12:** Are you willing to stay for at least one season?',
  '📌 **Q11/12:** What would you do if two players argued? How would you handle your own mistake?',
  '📌 **Q12/12:** Why do you want to join the staff team?',
];

const ADMIN_QUESTIONS = [
  '📌 **Q1/12:** What is your full Discord username?',
  '📌 **Q2/12:** What is your Minecraft IGN?',
  '📌 **Q3/12:** What is your age?',
  '📌 **Q4/12:** Which country and time zone?',
  '📌 **Q5/12:** Any previous staff experience?',
  '📌 **Q6/12:** How familiar are you with our rules?',
  '📌 **Q7/12:** What skills do you have?',
  '📌 **Q8/12:** Past experience handling conflicts?',
  '📌 **Q9/12:** How many hours per day can you dedicate?',
  '📌 **Q10/12:** Are you willing to stay for at least one season?',
  '📌 **Q11/12:** What would you do if two players argued? How would you handle your own mistake as admin?',
  '📌 **Q12/12:** Why do you want to be an Admin?',
];

const trollResponses = ["Bro really thought that was smart 💀","Skill issue detected 🔍","Touch grass immediately 🌿","My disappointment is immeasurable 📉","Ratio + L + no cap 💔","Who asked? 🤷","Sir this is a Discord server 🍔","Delulu behavior detected 🚨","You're cooked bro fr fr 🔥","Certified W moment... said no one ever 😭"];
const funResponses = ["Why did the bot cross the road? To get to the other server! 🤖","I'm not lazy, I'm on energy-saving mode 🔋","Error 404: Motivation not found 😴","Bro really woke up and chose chaos 💀","We do a little trolling 😈","Average Discord moment 🗿","It's giving... something 👀","No thoughts, head empty 🧠"];

// ── TRIVIA QUESTIONS ──
const triviaList = [
  { q: 'What is the capital of France?', a: 'paris' },
  { q: 'What planet is known as the Red Planet?', a: 'mars' },
  { q: 'How many sides does a hexagon have?', a: '6' },
  { q: 'What is the largest ocean on Earth?', a: 'pacific' },
  { q: 'Who painted the Mona Lisa?', a: 'da vinci' },
  { q: 'What is the chemical symbol for water?', a: 'h2o' },
  { q: 'How many continents are there?', a: '7' },
  { q: 'What is the fastest land animal?', a: 'cheetah' },
  { q: 'What is the square root of 144?', a: '12' },
  { q: 'Which country invented pizza?', a: 'italy' },
];
const activeTrivias = new Map();

// ── HELPERS ──
async function sendLog(guild, embed) {
  try {
    let logChannel = guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME);
    if (!logChannel) logChannel = await guild.channels.create({ name: LOG_CHANNEL_NAME, type: ChannelType.GuildText });
    await logChannel.send({ embeds: [embed] });
  } catch (e) { console.log('Log error:', e.message); }
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
  if (ticketStaffRole) permOverwrites.push({ id: ticketStaffRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages] });
  const ticketChannel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: permOverwrites });
  return { channel: ticketChannel, existed: false };
}

// ── BIRTHDAY CHECKER (runs every hour) ──
setInterval(async () => {
  const today = new Date();
  const todayStr = `${today.getMonth() + 1}-${today.getDate()}`;
  for (const [guildId, data] of birthdayMap.entries()) {
    if (!data.channelId) continue;
    for (const [userId, bday] of Object.entries(data.birthdays || {})) {
      if (bday === todayStr) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const channel = guild.channels.cache.get(data.channelId);
        if (!channel) continue;
        channel.send({ embeds: [new EmbedBuilder().setColor('Gold').setTitle('🎂 Happy Birthday!').setDescription(`🎉 Today is <@${userId}>'s birthday! Wish them well! 🎊`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
      }
    }
  }
}, 3600000);

// ── GIVEAWAY CHECKER (runs every 10s) ──
setInterval(async () => {
  const now = Date.now();
  for (const [msgId, gw] of giveawayMap.entries()) {
    if (gw.ended || now < gw.endsAt) continue;
    gw.ended = true;
    try {
      const guild = client.guilds.cache.get(gw.guildId);
      const channel = guild.channels.cache.get(gw.channelId);
      const msg = await channel.messages.fetch(msgId);
      const reaction = msg.reactions.cache.get('🎉');
      const users = await reaction.users.fetch();
      const entries = users.filter(u => !u.bot);
      if (entries.size === 0) {
        await channel.send({ embeds: [new EmbedBuilder().setColor('Red').setTitle('🎉 Giveaway Ended').setDescription(`No winners for **${gw.prize}**! Not enough participants.`).setFooter({ text: 'Made by Niyas 💙' })] });
      } else {
        const winners = entries.random(Math.min(gw.winners, entries.size));
        const winnerList = (Array.isArray(winners) ? winners : [winners]).map(w => `<@${w.id}>`).join(', ');
        await channel.send({ embeds: [new EmbedBuilder().setColor('Gold').setTitle('🎉 Giveaway Ended!').setDescription(`**Prize:** ${gw.prize}\n**Winner(s):** ${winnerList}\n\nCongrats! 🏆`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
      }
    } catch (e) { console.log('Giveaway end error:', e.message); }
  }
}, 10000);

// ── READY ──
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity('?help | Made by Niyas 💙', { type: 3 });
});

// ── WELCOME SYSTEM ──
client.on('guildMemberAdd', async (member) => {
  try {
    const chName = welcomeChannelOverride || WELCOME_CHANNEL_NAME;
    const welcomeChannel = member.guild.channels.cache.find(c => c.name === chName && c.type === ChannelType.GuildText);
    if (!welcomeChannel) return;

    const msg = welcomeMessage ? welcomeMessage.replace('{user}', `${member}`).replace('{server}', member.guild.name).replace('{count}', member.guild.memberCount) : `> 🎮 Welcome to **${member.guild.name}**, ${member}!
> 
> 📜 Read the rules and enjoy your stay!
> 💬 Say hi in the chat!
> 🏆 You are member **#${member.guild.memberCount}**!`;

    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x00ffff)
      .setTitle('⚡ NEW PLAYER JOINED THE GAME')
      .setDescription(msg)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 Username', value: member.user.username, inline: true },
        { name: '🆔 Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '📡 Server', value: member.guild.name, inline: true }
      )
      .setFooter({ text: 'Made by Niyas 💙 | Welcome to the server!' })
      .setTimestamp();

    await welcomeChannel.send({ embeds: [welcomeEmbed] });

    // Auto-role on join
    if (autoRoleId) {
      const role = member.guild.roles.cache.get(autoRoleId);
      if (role) await member.roles.add(role).catch(() => {});
    }

    await member.send({ embeds: [new EmbedBuilder().setColor(0x00ffff).setTitle(`⚡ Welcome to ${member.guild.name}!`).setDescription(`Hey **${member.user.username}**! 👋\n\nYou just joined **${member.guild.name}**!\n\n📜 Check the rules channel\n🎮 Have fun and enjoy your stay!\n\n*Made by Niyas 💙*`).setThumbnail(member.guild.iconURL({ dynamic: true })).setTimestamp()] }).catch(() => {});
  } catch (e) { console.error('Welcome error:', e.message); }
});

// ── MESSAGE EVENT ──
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  const content = message.content;
  const member = message.member;
  if (!member) return;

  // ── AFK CHECK ──
  if (afkMap.has(message.author.id)) {
    afkMap.delete(message.author.id);
    const back = await message.reply('👋 Welcome back! Your AFK status has been removed.');
    setTimeout(() => back.delete().catch(() => {}), 5000);
  }

  // Check if mentioned user is AFK
  message.mentions.users.forEach(user => {
    if (afkMap.has(user.id)) {
      const afkData = afkMap.get(user.id);
      message.reply(`💤 **${user.username}** is AFK: ${afkData.reason} — <t:${afkData.time}:R>`);
    }
  });


  // ── AUTO REPLY CHECK ──
  if (autoReplyMap.size > 0) {
    const lowerContent = content.toLowerCase();
    for (const [trigger, response] of autoReplyMap.entries()) {
      if (lowerContent.includes(trigger.toLowerCase())) {
        await message.reply(response);
        break;
      }
    }
  }

  // ── TRIVIA ANSWER CHECK ──
  if (activeTrivias.has(message.channel.id)) {
    const trivia = activeTrivias.get(message.channel.id);
    if (content.toLowerCase().includes(trivia.answer)) {
      activeTrivias.delete(message.channel.id);
      clearTimeout(trivia.timeout);
      return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('🎉 Correct!').setDescription(`**${message.author}** got it! The answer was **${trivia.answer}**! 🏆`).setFooter({ text: 'Made by Niyas 💙' })] });
    }
  }

  // ── APPLICATION Q&A ──
  if (appSessions.has(message.author.id)) {
    const session = appSessions.get(message.author.id);
    if (message.channel.id !== session.channelId) return;
    const questions = session.type === 'admin' ? ADMIN_QUESTIONS : STAFF_QUESTIONS;
    if (session.step === 2) {
      const age = parseInt(content);
      if (isNaN(age)) return message.reply('❌ Please type a valid number for your age!');
      if (age < MIN_AGE) {
        appSessions.delete(message.author.id);
        await message.channel.send({ embeds: [new EmbedBuilder().setColor('Red').setTitle('❌ Application Rejected').setDescription(`Sorry ${message.author}, you must be at least **${MIN_AGE} years old**!\n\nThis channel closes in 5 seconds.`).setFooter({ text: 'Made by Niyas 💙' })] });
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
      appSessions.delete(message.author.id);
      const resultEmbed = new EmbedBuilder().setColor('Gold').setTitle(`📋 ${session.type === 'admin' ? '👑 Admin' : '🛡️ Staff'} Application`).setDescription(`**Applicant:** ${message.author}\n**Type:** ${session.type === 'admin' ? 'Admin' : 'Staff'}`).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
      questions.forEach((q, i) => resultEmbed.addFields({ name: `Q${i + 1}: ${q.replace(/📌 \*\*Q\d+\/\d+:\*\* /, '')}`, value: session.answers[i] || 'No answer', inline: false }));
      const appButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_admin_${message.author.id}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deny_admin_${message.author.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger)
      );
      let appChannel = message.guild.channels.cache.find(c => c.name === ADMIN_APP_CHANNEL);
      if (!appChannel) appChannel = await message.guild.channels.create({ name: ADMIN_APP_CHANNEL, type: ChannelType.GuildText, permissionOverwrites: [{ id: message.guild.id, deny: [PermissionsBitField.Flags.SendMessages] }, { id: message.guild.members.me.id, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] }] });
      await appChannel.send({ embeds: [resultEmbed], components: [appButtons] });
      await message.channel.send({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Application Submitted!').setDescription(`Your application has been submitted! Our team will DM you the result. Good luck! 🍀`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
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
      sd.count++; sd.lastMessage = now;
      if (sd.count >= SPAM_THRESHOLD) {
        spamMap.set(message.author.id, { count: 0, lastMessage: now });
        try {
          await member.timeout(60000, 'Auto-timeout: Spamming');
          const spamEmbed = new EmbedBuilder().setColor('Orange').setTitle('🚨 Anti-Spam').setDescription(`${message.author} timed out for **1 minute** for spamming!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
          await message.channel.send({ embeds: [spamEmbed] });
          await sendLog(message.guild, spamEmbed);
        } catch (e) { await message.channel.send(`⚠️ ${message.author} stop spamming!`); }
        return;
      }
    } else { spamMap.set(message.author.id, { count: 1, lastMessage: now }); }
  }

  if (!content.startsWith(PREFIX)) return;
  const args = content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();


  // ══════════════════════════════════════
  //          AUTO REPLY
  // ══════════════════════════════════════
  if (command === 'addreply') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply('❌ You need Manage Messages permission!');
    const splitIndex = args.indexOf('|');
    if (splitIndex === -1) return message.reply('❌ Usage: `?addreply <trigger> | <response>`\nExample: `?addreply hello | Hello there! 👋`');
    const trigger = args.slice(0, splitIndex).join(' ').trim();
    const response = args.slice(splitIndex + 1).join(' ').trim();
    if (!trigger || !response) return message.reply('❌ Trigger and response cannot be empty!');
    autoReplyMap.set(trigger.toLowerCase(), response);
    return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Auto Reply Added').addFields({ name: '🔤 Trigger', value: trigger, inline: true }, { name: '💬 Response', value: response, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  if (command === 'delreply') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply('❌ You need Manage Messages permission!');
    const trigger = args.join(' ').trim().toLowerCase();
    if (!trigger) return message.reply('❌ Usage: `?delreply <trigger>`');
    if (!autoReplyMap.has(trigger)) return message.reply(`❌ No auto reply found for **${trigger}**!`);
    autoReplyMap.delete(trigger);
    return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('🗑️ Auto Reply Removed').setDescription(`Auto reply for **${trigger}** removed!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  if (command === 'listreplies') {
    if (autoReplyMap.size === 0) return message.reply('❌ No auto replies set! Use `?addreply <trigger> | <response>` to add one.');
    const list = [...autoReplyMap.entries()].map(([t, r], i) => `**${i + 1}.** \`${t}\` → ${r}`).join('\n');
    return message.reply({ embeds: [new EmbedBuilder().setColor('Blurple').setTitle('📋 Auto Replies').setDescription(list).setFooter({ text: `${autoReplyMap.size} auto reply(s) | Made by Niyas 💙` }).setTimestamp()] });
  }

  // ══════════════════════════════════════
  //              HELP
  // ══════════════════════════════════════
  // ══════════════════════════════════════
  //           AUTO REPLY
  // ══════════════════════════════════════
  if (command === 'autoreply') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply('❌ You need Manage Server permission!');
    const sub = args[0]?.toLowerCase();

    if (sub === 'add') {
      const splitIndex = args.findIndex((a, i) => i > 0 && a === '|');
      if (splitIndex === -1) return message.reply('❌ Usage: `?autoreply add <trigger> | <response>`\nExample: `?autoreply add hello | Hey there! 👋`');
      const trigger = args.slice(1, splitIndex).join(' ').toLowerCase().trim();
      const response = args.slice(splitIndex + 1).join(' ').trim();
      if (!trigger || !response) return message.reply('❌ Both trigger and response required!');
      autoReplyMap.set(trigger, response);
      return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Auto Reply Added').addFields({ name: '🎯 Trigger', value: `\`${trigger}\``, inline: true }, { name: '💬 Response', value: response, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
    }

    if (sub === 'remove') {
      const trigger = args.slice(1).join(' ').toLowerCase().trim();
      if (!trigger) return message.reply('❌ Usage: `?autoreply remove <trigger>`');
      if (!autoReplyMap.has(trigger)) return message.reply(`❌ No auto reply found for \`${trigger}\`!`);
      autoReplyMap.delete(trigger);
      return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('🗑️ Auto Reply Removed').setDescription(`Removed auto reply for \`${trigger}\``).setFooter({ text: 'Made by Niyas 💙' })] });
    }

    if (sub === 'list') {
      if (autoReplyMap.size === 0) return message.reply('❌ No auto replies set! Use `?autoreply add <trigger> | <response>`');
      const list = [...autoReplyMap.entries()].map(([t, r], i) => `**${i + 1}.** \`${t}\` → ${r}`).join('\n');
      return message.reply({ embeds: [new EmbedBuilder().setColor('Blurple').setTitle('📋 Auto Replies').setDescription(list).setFooter({ text: `${autoReplyMap.size} auto replies | Made by Niyas 💙` }).setTimestamp()] });
    }

    if (sub === 'clear') {
      autoReplyMap.clear();
      return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('🗑️ All Auto Replies Cleared').setDescription('All auto replies have been removed!').setFooter({ text: 'Made by Niyas 💙' })] });
    }

    return message.reply('Usage:\n`?autoreply add <trigger> | <response>`\n`?autoreply remove <trigger>`\n`?autoreply list`\n`?autoreply clear`');
  }

  if (command === 'help') {
    return message.reply({ embeds: [new EmbedBuilder().setColor('Blurple').setTitle('📖 Bot Commands').setThumbnail(client.user.displayAvatarURL()).addFields(
      { name: '💬 Auto Reply', value: '`?autoreply add <trigger> | <response>` `?autoreply remove <trigger>` `?autoreply list` `?autoreply clear`', inline: false },
      { name: '🎮 Games', value: '`?trivia` `?roll [sides]` `?flip` `?8ball <q>` `?rps <r/p/s>` `?guess`', inline: false },
      { name: '🎉 Giveaway', value: '`?giveaway start <time> <winners> <prize>` `?giveaway end <msgId>` `?giveaway reroll <msgId>`', inline: false },
      { name: '👋 Welcome', value: '`?welcome channel #ch` `?welcome message <text>` `?welcome test` `?welcome off`', inline: false },
      { name: '🎂 Birthdays', value: '`?birthday set <month> <day>` `?birthday check [@user]` `?birthday list` `?birthday channel #ch`', inline: false },
      { name: '📊 Polls', value: '`?poll <question>` `?poll <question> | opt1 | opt2 | opt3`', inline: false },
      { name: '⏰ AFK', value: '`?afk [reason]` — Set AFK (auto-removed when you send a message)', inline: false },
      { name: '✅ Auto-role', value: '`?autorole set @role` `?autorole remove` `?autorole check`', inline: false },
      { name: '🎫 Tickets', value: '`?ticketpanel` `?closeticket`', inline: false },
      { name: '🔨 Moderation', value: '`?ban @user` `?kick @user` `?timeout @user <mins>` `?unban <id>` `?lock` `?unlock` `?purge <1-100>` `?role @user @role` `?warn @user` `?warnings @user` `?clearwarn @user`', inline: false },
      { name: '🎉 Fun', value: '`?fun` `?troll @user` `?roast @user`', inline: false },
      { name: 'ℹ️ Info', value: '`?serverinfo` `?about` `?avatar [@user]` `?userinfo [@user]` `?ping`', inline: false },
      { name: '💬 Auto Reply', value: '`?addreply <trigger> | <response>` `?delreply <trigger>` `?listreplies`', inline: false },
      { name: '🛡️ Auto-Mod', value: 'Anti-Spam • Anti-Link • Anti-Nuke (automatic)', inline: false },
    ).setFooter({ text: `Prefix: ${PREFIX} | Made by Niyas 💙` }).setTimestamp()] });
  }

  // ══════════════════════════════════════
  //              PING
  // ══════════════════════════════════════
  if (command === 'ping') {
    return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('🏓 Pong!').addFields({ name: 'Bot Latency', value: `${client.ws.ping}ms`, inline: true }).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  // ══════════════════════════════════════
  //              AFK
  // ══════════════════════════════════════
  if (command === 'afk') {
    const reason = args.join(' ') || 'AFK';
    afkMap.set(message.author.id, { reason, time: Math.floor(Date.now() / 1000) });
    return message.reply({ embeds: [new EmbedBuilder().setColor('Grey').setTitle('💤 AFK Set').setDescription(`You are now AFK: **${reason}**\nI'll let others know if they ping you!`).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  // ══════════════════════════════════════
  //              GAMES
  // ══════════════════════════════════════

  // TRIVIA
  if (command === 'trivia') {
    if (activeTrivias.has(message.channel.id)) return message.reply('❌ A trivia is already active in this channel!');
    const q = triviaList[Math.floor(Math.random() * triviaList.length)];
    activeTrivias.set(message.channel.id, {
      answer: q.a,
      timeout: setTimeout(() => {
        activeTrivias.delete(message.channel.id);
        message.channel.send({ embeds: [new EmbedBuilder().setColor('Red').setTitle('⏰ Time\'s up!').setDescription(`Nobody got it! The answer was **${q.a}**`).setFooter({ text: 'Made by Niyas 💙' })] });
      }, 30000)
    });
    return message.reply({ embeds: [new EmbedBuilder().setColor('Blue').setTitle('🧠 Trivia Time!').setDescription(`**${q.q}**\n\nYou have **30 seconds** to answer!`).setFooter({ text: 'Made by Niyas 💙 | Type your answer!' })] });
  }

  // ROLL
  if (command === 'roll') {
    const sides = parseInt(args[0]) || 6;
    const result = Math.floor(Math.random() * sides) + 1;
    return message.reply({ embeds: [new EmbedBuilder().setColor('Purple').setTitle('🎲 Dice Roll').setDescription(`You rolled a **${result}** out of **${sides}**!`).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  // FLIP
  if (command === 'flip') {
    const result = Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!';
    return message.reply({ embeds: [new EmbedBuilder().setColor('Gold').setTitle('🪙 Coin Flip').setDescription(result).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  // 8BALL
  if (command === '8ball') {
    const question = args.join(' ');
    if (!question) return message.reply('Ask a question! `?8ball will I win?`');
    const answers = ['Yes! 🟢','No ❌','Maybe 🤔','Absolutely! 🔥','Not a chance 💀','Ask again later ⏳','Definitely! ✅','I doubt it 😬','Signs point to yes 👍','My sources say no 🚫'];
    const pick = answers[Math.floor(Math.random() * answers.length)];
    return message.reply({ embeds: [new EmbedBuilder().setColor('DarkBlue').setTitle('🎱 Magic 8-Ball').addFields({ name: '❓ Question', value: question }, { name: '🎱 Answer', value: pick }).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  // RPS
  if (command === 'rps') {
    const choices = ['rock', 'paper', 'scissors'];
    const userChoice = args[0]?.toLowerCase();
    if (!choices.includes(userChoice)) return message.reply('Choose: `?rps rock` / `?rps paper` / `?rps scissors`');
    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
    let result;
    if (userChoice === botChoice) result = "It's a tie! 🤝";
    else if ((userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper')) result = 'You win! 🎉';
    else result = 'You lose! 💀';
    return message.reply({ embeds: [new EmbedBuilder().setColor('Aqua').setTitle('✂️ Rock Paper Scissors').addFields({ name: 'You', value: `${emojis[userChoice]} ${userChoice}`, inline: true }, { name: 'Bot', value: `${emojis[botChoice]} ${botChoice}`, inline: true }, { name: 'Result', value: result, inline: false }).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  // GUESS
  if (command === 'guess') {
    const number = Math.floor(Math.random() * 10) + 1;
    await message.reply({ embeds: [new EmbedBuilder().setColor('Orange').setTitle('🔢 Number Guess').setDescription('I\'m thinking of a number between **1 and 10**!\nYou have **15 seconds** to guess!').setFooter({ text: 'Made by Niyas 💙' })] });
    const filter = m => m.author.id === message.author.id && !isNaN(m.content);
    const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });
    collector.on('collect', m => {
      if (parseInt(m.content) === number) m.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('🎉 Correct!').setDescription(`The number was **${number}**! You got it! 🏆`).setFooter({ text: 'Made by Niyas 💙' })] });
      else m.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('❌ Wrong!').setDescription(`The number was **${number}**! Better luck next time!`).setFooter({ text: 'Made by Niyas 💙' })] });
    });
    collector.on('end', (collected) => {
      if (collected.size === 0) message.channel.send({ embeds: [new EmbedBuilder().setColor('Red').setTitle('⏰ Time\'s Up!').setDescription(`You didn't guess! The number was **${number}**!`).setFooter({ text: 'Made by Niyas 💙' })] });
    });
    return;
  }

  // ══════════════════════════════════════
  //              POLLS
  // ══════════════════════════════════════
  if (command === 'poll') {
    const input = args.join(' ');
    if (!input) return message.reply('Usage: `?poll <question>` or `?poll <question> | opt1 | opt2 | opt3`');
    const parts = input.split('|').map(p => p.trim());
    const question = parts[0];
    const options = parts.slice(1);
    await message.delete().catch(() => {});
    if (options.length === 0) {
      const pollMsg = await message.channel.send({ embeds: [new EmbedBuilder().setColor('Blue').setTitle('📊 Poll').setDescription(`**${question}**`).setFooter({ text: `Poll by ${message.author.tag} | Made by Niyas 💙` }).setTimestamp()] });
      await pollMsg.react('👍');
      await pollMsg.react('👎');
    } else {
      const numberEmojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
      const optionText = options.map((o, i) => `${numberEmojis[i]} ${o}`).join('\n');
      const pollMsg = await message.channel.send({ embeds: [new EmbedBuilder().setColor('Blue').setTitle('📊 Poll').setDescription(`**${question}**\n\n${optionText}`).setFooter({ text: `Poll by ${message.author.tag} | Made by Niyas 💙` }).setTimestamp()] });
      for (let i = 0; i < Math.min(options.length, 9); i++) await pollMsg.react(numberEmojis[i]);
    }
    return;
  }

  // ══════════════════════════════════════
  //              BIRTHDAY
  // ══════════════════════════════════════
  if (command === 'birthday') {
    const sub = args[0]?.toLowerCase();
    const guildId = message.guild.id;
    if (!birthdayMap.has(guildId)) birthdayMap.set(guildId, { birthdays: {}, channelId: null });
    const gData = birthdayMap.get(guildId);

    if (sub === 'set') {
      const month = parseInt(args[1]);
      const day = parseInt(args[2]);
      if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return message.reply('❌ Usage: `?birthday set <month> <day>` Example: `?birthday set 5 15`');
      gData.birthdays[message.author.id] = `${month}-${day}`;
      return message.reply({ embeds: [new EmbedBuilder().setColor('Gold').setTitle('🎂 Birthday Set!').setDescription(`Your birthday is set to **${month}/${day}**! 🎉`).setFooter({ text: 'Made by Niyas 💙' })] });
    }

    if (sub === 'check') {
      const target = message.mentions.users.first() || message.author;
      const bday = gData.birthdays[target.id];
      if (!bday) return message.reply(`❌ ${target.username} hasn't set their birthday!`);
      const [m, d] = bday.split('-');
      return message.reply({ embeds: [new EmbedBuilder().setColor('Gold').setTitle('🎂 Birthday').setDescription(`**${target.username}'s** birthday is on **${m}/${d}**! 🎉`).setFooter({ text: 'Made by Niyas 💙' })] });
    }

    if (sub === 'list') {
      const entries = Object.entries(gData.birthdays);
      if (entries.length === 0) return message.reply('No birthdays registered yet!');
      const list = entries.map(([uid, bday]) => { const [m, d] = bday.split('-'); return `<@${uid}> — **${m}/${d}**`; }).join('\n');
      return message.reply({ embeds: [new EmbedBuilder().setColor('Gold').setTitle('🎂 Birthday List').setDescription(list).setFooter({ text: 'Made by Niyas 💙' })] });
    }

    if (sub === 'channel') {
      if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply('❌ You need Manage Server permission!');
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply('❌ Tag a channel! `?birthday channel #birthdays`');
      gData.channelId = ch.id;
      birthdayChannelId = ch.id;
      return message.reply({ embeds: [new EmbedBuilder().setColor('Gold').setTitle('🎂 Birthday Channel Set').setDescription(`Birthday announcements will be sent to ${ch}!`).setFooter({ text: 'Made by Niyas 💙' })] });
    }

    return message.reply('Usage: `?birthday set <month> <day>` | `?birthday check [@user]` | `?birthday list` | `?birthday channel #ch`');
  }

  // ══════════════════════════════════════
  //              GIVEAWAY
  // ══════════════════════════════════════
  if (command === 'giveaway') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply('❌ You need Manage Server permission!');
    const sub = args[0]?.toLowerCase();

    if (sub === 'start') {
      const timeStr = args[1];
      const winners = parseInt(args[2]) || 1;
      const prize = args.slice(3).join(' ');
      if (!timeStr || !prize) return message.reply('❌ Usage: `?giveaway start <time> <winners> <prize>`\nExample: `?giveaway start 1h 2 Nitro`');
      const timeMap = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
      const unit = timeStr.slice(-1);
      const amount = parseInt(timeStr);
      if (!timeMap[unit] || isNaN(amount)) return message.reply('❌ Valid time: 30s, 5m, 1h, 1d');
      const duration = amount * timeMap[unit];
      const endsAt = Date.now() + duration;
      const gwEmbed = new EmbedBuilder().setColor('Gold').setTitle('🎉 GIVEAWAY!').setDescription(`**Prize:** ${prize}\n\nReact with 🎉 to enter!\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`).setFooter({ text: `Made by Niyas 💙 | ${winners} winner(s)` }).setTimestamp(endsAt);
      const gwMsg = await message.channel.send({ embeds: [gwEmbed] });
      await gwMsg.react('🎉');
      giveawayMap.set(gwMsg.id, { prize, winners, endsAt, guildId: message.guild.id, channelId: message.channel.id, ended: false });
      return message.reply({ content: `✅ Giveaway started! [Jump to it](${gwMsg.url})`, ephemeral: false });
    }

    if (sub === 'end') {
      const msgId = args[1];
      if (!msgId) return message.reply('❌ Usage: `?giveaway end <messageId>`');
      const gw = giveawayMap.get(msgId);
      if (!gw) return message.reply('❌ Giveaway not found!');
      gw.endsAt = Date.now() - 1;
      return message.reply('✅ Giveaway ending now!');
    }

    if (sub === 'reroll') {
      const msgId = args[1];
      if (!msgId) return message.reply('❌ Usage: `?giveaway reroll <messageId>`');
      try {
        const msg = await message.channel.messages.fetch(msgId);
        const reaction = msg.reactions.cache.get('🎉');
        const users = await reaction.users.fetch();
        const entries = users.filter(u => !u.bot);
        if (entries.size === 0) return message.reply('❌ No entries to reroll!');
        const winner = entries.random();
        return message.reply({ embeds: [new EmbedBuilder().setColor('Gold').setTitle('🎉 Giveaway Reroll!').setDescription(`New winner: <@${winner.id}>! Congrats! 🏆`).setFooter({ text: 'Made by Niyas 💙' })] });
      } catch (e) { return message.reply('❌ Could not fetch that message!'); }
    }

    return message.reply('Usage: `?giveaway start <time> <winners> <prize>` | `?giveaway end <msgId>` | `?giveaway reroll <msgId>`');
  }

  // ══════════════════════════════════════
  //              WELCOME COMMANDS
  // ══════════════════════════════════════
  if (command === 'welcome') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply('❌ You need Manage Server permission!');
    const sub = args[0]?.toLowerCase();

    if (sub === 'channel') {
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply('❌ Tag a channel! `?welcome channel #welcome`');
      welcomeChannelOverride = ch.name;
      return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Welcome Channel Set').setDescription(`Welcome messages will be sent to ${ch}!`).setFooter({ text: 'Made by Niyas 💙' })] });
    }

    if (sub === 'message') {
      const msg = args.slice(1).join(' ');
      if (!msg) return message.reply('❌ Provide a message! `?welcome message Welcome {user} to {server}!`');
      welcomeMessage = msg;
      return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Welcome Message Set').setDescription(`New welcome message: **${welcomeMessage}**`).setFooter({ text: 'Made by Niyas 💙' })] });
    }

    if (sub === 'test') {
      const chName = welcomeChannelOverride || WELCOME_CHANNEL_NAME;
      const welcomeChannel = message.guild.channels.cache.find(c => c.name === chName && c.type === ChannelType.GuildText);
      if (!welcomeChannel) return message.reply(`❌ No channel named **${chName}** found! Use \`?welcome channel #ch\` to set one.`);
      const testEmbed = new EmbedBuilder().setColor(0x00ffff).setTitle('⚡ NEW PLAYER JOINED THE GAME').setDescription(`> 🎮 Welcome to **${message.guild.name}**, ${message.author}!\n> \n> 📜 Read the rules and enjoy your stay!\n> 💬 Say hi in the chat!`).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).addFields({ name: '👤 Username', value: message.author.username, inline: true }, { name: '📡 Server', value: message.guild.name, inline: true }).setFooter({ text: 'Made by Niyas 💙 | This is a test welcome!' }).setTimestamp();
      await welcomeChannel.send({ embeds: [testEmbed] });
      return message.reply(`✅ Test welcome sent to ${welcomeChannel}!`);
    }

    if (sub === 'off') {
      welcomeChannelOverride = 'disabled_welcome_xyzxyz';
      return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('❌ Welcome Disabled').setDescription('Welcome messages have been disabled!').setFooter({ text: 'Made by Niyas 💙' })] });
    }

    return message.reply('Usage: `?welcome channel #ch` | `?welcome message <text>` | `?welcome test` | `?welcome off`');
  }

  // ══════════════════════════════════════
  //              AUTO-ROLE
  // ══════════════════════════════════════
  if (command === 'autorole') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return message.reply('❌ You need Manage Roles permission!');
    const sub = args[0]?.toLowerCase();

    if (sub === 'set') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply('❌ Tag a role! `?autorole set @role`');
      autoRoleId = role.id;
      return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Auto-Role Set').setDescription(`New members will automatically get **${role.name}** when they join!`).setFooter({ text: 'Made by Niyas 💙' })] });
    }

    if (sub === 'remove') {
      autoRoleId = null;
      return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('❌ Auto-Role Removed').setDescription('Auto-role has been disabled!').setFooter({ text: 'Made by Niyas 💙' })] });
    }

    if (sub === 'check') {
      if (!autoRoleId) return message.reply('❌ No auto-role set!');
      const role = message.guild.roles.cache.get(autoRoleId);
      return message.reply({ embeds: [new EmbedBuilder().setColor('Blue').setTitle('✅ Current Auto-Role').setDescription(`Auto-role is set to **${role ? role.name : 'Unknown (deleted?)'}**`).setFooter({ text: 'Made by Niyas 💙' })] });
    }

    return message.reply('Usage: `?autorole set @role` | `?autorole remove` | `?autorole check`');
  }

  // ══════════════════════════════════════
  //              FUN
  // ══════════════════════════════════════
  if (command === 'fun') {
    const pick = funResponses[Math.floor(Math.random() * funResponses.length)];
    return message.reply({ embeds: [new EmbedBuilder().setColor('Yellow').setDescription(pick).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  if (command === 'troll') {
    const target = message.mentions.members.first();
    const pick = trollResponses[Math.floor(Math.random() * trollResponses.length)];
    return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setDescription(target ? `${target} — ${pick}` : pick).setFooter({ text: 'Made by Niyas 💙' })] });
  }

  if (command === 'roast') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('Tag someone to roast! `?roast @user`');
    const roasts = [`${target} — Your WiFi password is probably "password123" 💀`,`${target} — Even Google can't find your value 🔍`,`${target} — You're the reason they put instructions on shampoo bottles 😭`,`${target} — Your birth certificate is an apology letter 💔`,`${target} — Even your shadow doesn't want to follow you 🚶`];
    return message.reply({ embeds: [new EmbedBuilder().setColor('Orange').setTitle('🔥 Roasted!').setDescription(roasts[Math.floor(Math.random() * roasts.length)]).setFooter({ text: `Roasted by ${message.author.tag} | Made by Niyas 💙` })] });
  }

  // ══════════════════════════════════════
  //              INFO
  // ══════════════════════════════════════
  if (command === 'serverinfo') {
    const guild = message.guild;
    await guild.members.fetch();
    const bots = guild.members.cache.filter(m => m.user.bot).size;
    const humans = guild.members.cache.size - bots;
    return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle(`📊 ${guild.name}`).setThumbnail(guild.iconURL({ dynamic: true })).addFields({ name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true }, { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }, { name: '👥 Members', value: `${humans} humans | ${bots} bots`, inline: true }, { name: '📢 Channels', value: `${guild.channels.cache.size}`, inline: true }, { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true }, { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  if (command === 'about') {
    return message.reply({ embeds: [new EmbedBuilder().setColor('Blurple').setTitle('🤖 About This Bot').setThumbnail(client.user.displayAvatarURL()).setDescription('A powerful all-in-one Discord bot!').addFields({ name: '👨‍💻 Made by', value: 'Niyas', inline: true }, { name: '⚙️ Built With', value: 'Node.js + discord.js', inline: true }, { name: '🛡️ Features', value: 'Moderation, Games, Giveaways, Birthdays, Polls, AFK, Auto-role, Tickets, Welcome, Fun', inline: false }, { name: '📌 Prefix', value: `\`${PREFIX}\``, inline: true }, { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
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

  // ══════════════════════════════════════
  //              TICKET
  // ══════════════════════════════════════
  if (command === 'ticketpanel') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('❌ You need Manage Channels permission!');
    const panelEmbed = new EmbedBuilder().setColor(0x2ecc71).setTitle('🎮 Gaming Support Tickets').setDescription('Need help? Open a ticket below!\n\n💎 **Premium Buy** — Purchase ranks, perks\n🎮 **Ingame Support** — Report bugs\n👮 **Admin/Staff Apply** — Apply for staff\n🔊 **Must join VC during application!**\n\n⚠️ Fake tickets = timeout or ban').setFooter({ text: 'Made by Niyas 💙 | One ticket per person' }).setTimestamp();
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_premium').setLabel('💎 Premium Buy').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_ingame').setLabel('🎮 Ingame Support').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_staff').setLabel('👮 Admin/Staff Apply').setStyle(ButtonStyle.Secondary)
    );
    await message.channel.send({ embeds: [panelEmbed], components: [buttons] });
    await message.delete().catch(() => {});
    return;
  }

  if (command === 'closeticket') {
    const validTicket = ['premium-', 'ingame-', 'staff-'].some(p => message.channel.name.startsWith(p));
    if (!validTicket) return message.reply('This is not a ticket channel!');
    await message.channel.send('🔒 Closing ticket in 5 seconds...');
    setTimeout(() => message.channel.delete().catch(() => {}), 5000);
    return;
  }

  // ══════════════════════════════════════
  //              MODERATION
  // ══════════════════════════════════════
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

  // TEMPBAN
  if (command === 'tempban') {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ You need Ban Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Usage: `?tempban @user <time> [reason]`\nTime: 30m, 1h, 2d, 1w');
    const timeStr = args[1];
    const reason = args.slice(2).join(' ') || 'No reason provided';
    if (!timeStr) return message.reply('❌ Provide a time! Example: `?tempban @user 1h Cheating`');
    const timeMap = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    const unit = timeStr.slice(-1);
    const amount = parseInt(timeStr);
    if (!timeMap[unit] || isNaN(amount)) return message.reply('❌ Valid time formats: 30s, 5m, 1h, 2d, 1w');
    const duration = amount * timeMap[unit];
    await target.ban({ reason: `Tempban: ${reason}` }).catch(() => {});
    const tempbanEmbed = new EmbedBuilder().setColor('DarkRed').setTitle('⏳ Member Temp Banned').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Duration', value: timeStr, inline: true }, { name: 'Reason', value: reason, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }, { name: 'Unbanned at', value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [tempbanEmbed] });
    await sendLog(message.guild, tempbanEmbed);
    setTimeout(async () => {
      await message.guild.members.unban(target.user.id, 'Tempban expired').catch(() => {});
      await sendLog(message.guild, new EmbedBuilder().setColor('Green').setTitle('✅ Tempban Expired').setDescription(`**${target.user.tag}** has been automatically unbanned!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp());
    }, duration);
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
    if (!userId) return message.reply('Provide a user ID to unban!');
    await message.guild.members.unban(userId).catch(() => {});
    return message.reply(`✅ User \`${userId}\` unbanned.`);
  }

  if (command === 'role') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return message.reply('❌ You need Manage Roles permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Tag someone! `?role @user @role`');
    const role = message.mentions.roles.first();
    if (!role) return message.reply('❌ Tag a role! `?role @user @role`');
    if (role.position >= message.guild.members.me.roles.highest.position) return message.reply('❌ That role is higher than my role!');
    if (target.roles.cache.has(role.id)) {
      await target.roles.remove(role).catch(() => {});
      const removeEmbed = new EmbedBuilder().setColor('Orange').setTitle('➖ Role Removed').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Role', value: role.name, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
      await message.reply({ embeds: [removeEmbed] }); await sendLog(message.guild, removeEmbed);
    } else {
      await target.roles.add(role).catch(() => {});
      const addEmbed = new EmbedBuilder().setColor('Green').setTitle('➕ Role Added').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Role', value: role.name, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
      await message.reply({ embeds: [addEmbed] }); await sendLog(message.guild, addEmbed);
    }
    return;
  }

  if (command === 'warn') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ You need Moderate Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Tag someone! `?warn @user reason`');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const userId = target.user.id;
    if (!warnMap.has(userId)) warnMap.set(userId, []);
    const warns = warnMap.get(userId);
    warns.push({ reason, date: new Date().toLocaleDateString(), moderator: message.author.tag });
    const warnEmbed = new EmbedBuilder().setColor('Yellow').setTitle('⚠️ Member Warned').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Reason', value: reason, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }, { name: 'Total Warns', value: `${warns.length}`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [warnEmbed] });
    await sendLog(message.guild, warnEmbed);
    await target.send(`⚠️ You were warned in **${message.guild.name}**!\n**Reason:** ${reason}\n**Total warnings:** ${warns.length}`).catch(() => {});
    if (warns.length >= 3) {
      await target.timeout(300000, 'Auto-timeout: 3 warnings').catch(() => {});
      await message.channel.send({ embeds: [new EmbedBuilder().setColor('Orange').setTitle('🚨 Auto Timeout!').setDescription(`${target} reached **3 warnings** and has been timed out for 5 minutes!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
    }
    return;
  }

  if (command === 'warnings') {
    const target = message.mentions.members.first() || message.member;
    const warns = warnMap.get(target.user.id) || [];
    if (warns.length === 0) return message.reply(`✅ ${target.user.tag} has no warnings!`);
    const warnList = warns.map((w, i) => `**${i + 1}.** ${w.reason} — by ${w.moderator} on ${w.date}`).join('\n');
    return message.reply({ embeds: [new EmbedBuilder().setColor('Yellow').setTitle(`⚠️ Warnings — ${target.user.tag}`).setDescription(warnList).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }

  if (command === 'clearwarn') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ You need Moderate Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Tag someone!');
    warnMap.delete(target.user.id);
    return message.reply({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Warnings Cleared').setDescription(`All warnings cleared for ${target.user.tag}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()] });
  }


  if (command === 'mute') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ You need Moderate Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Usage: `?mute @user [reason]`');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.timeout(28 * 24 * 60 * 60 * 1000, reason).catch(() => {});
    const muteEmbed = new EmbedBuilder().setColor('Red').setTitle('🔇 Member Muted').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Reason', value: reason, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [muteEmbed] });
    await sendLog(message.guild, muteEmbed);
    await target.send(`🔇 You have been muted in **${message.guild.name}**!\n**Reason:** ${reason}`).catch(() => {});
    return;
  }

  if (command === 'unmute') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ You need Moderate Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Usage: `?unmute @user`');
    await target.timeout(null).catch(() => {});
    const unmuteEmbed = new EmbedBuilder().setColor('Green').setTitle('🔊 Member Unmuted').addFields({ name: 'User', value: target.user.tag, inline: true }, { name: 'Moderator', value: message.author.tag, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [unmuteEmbed] });
    await sendLog(message.guild, unmuteEmbed);
    await target.send(`🔊 You have been unmuted in **${message.guild.name}**!`).catch(() => {});
    return;
  }

  if (command === 'snipe') {
    const snipe = snipeMap.get(message.channel.id);
    if (!snipe) return message.reply('❌ No recently deleted messages in this channel!');
    const snipeEmbed = new EmbedBuilder()
      .setColor('DarkRed')
      .setTitle('🔍 Sniped Message')
      .setDescription(snipe.content)
      .addFields(
        { name: '👤 Author', value: snipe.author, inline: true },
        { name: '🕐 Deleted', value: `<t:${Math.floor(snipe.time / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'Made by Niyas 💙' })
      .setTimestamp();
    if (snipe.authorAvatar) snipeEmbed.setThumbnail(snipe.authorAvatar);
    if (snipe.image) snipeEmbed.setImage(snipe.image);
    return message.reply({ embeds: [snipeEmbed] });
  }

  if (command === 'lock') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ You need Administrator permission!');
    await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false }).catch(() => {});
    const lockEmbed = new EmbedBuilder().setColor('Red').setTitle('🔒 Channel Locked').setDescription(`${message.channel} locked by ${message.author}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [lockEmbed] }); await sendLog(message.guild, lockEmbed);
    return;
  }

  if (command === 'unlock') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ You need Administrator permission!');
    await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null }).catch(() => {});
    const unlockEmbed = new EmbedBuilder().setColor('Green').setTitle('🔓 Channel Unlocked').setDescription(`${message.channel} unlocked by ${message.author}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    await message.reply({ embeds: [unlockEmbed] }); await sendLog(message.guild, unlockEmbed);
    return;
  }

  if (command === 'purge') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ You need Administrator permission!');
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return message.reply('❌ Provide a number 1-100! `?purge 10`');
    await message.delete().catch(() => {});
    const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) return message.channel.send('❌ Messages older than 14 days cannot be deleted.');
    const purgeEmbed = new EmbedBuilder().setColor('Orange').setTitle('🗑️ Messages Purged').setDescription(`**${deleted.size}** messages deleted by ${message.author}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp();
    const purgeMsg = await message.channel.send({ embeds: [purgeEmbed] });
    setTimeout(() => purgeMsg.delete().catch(() => {}), 5000);
    await sendLog(message.guild, purgeEmbed);
    return;
  }
});

// ── INTERACTIONS ──
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'ticket_premium') {
    const { channel, existed } = await createTicketChannel(interaction.guild, interaction.user, 'premium');
    if (existed) return interaction.reply({ content: `You already have a ticket: ${channel}! Close it first.`, ephemeral: true });
    const closeBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger));
    await channel.send({ content: `${interaction.user}`, embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('💎 Premium Buy Ticket').setDescription('Thanks for opening a ticket!\n\n• What rank/perk do you want?\n• Your ingame username?\n\nStaff will assist you shortly! 💎').addFields({ name: '👤 Opened by', value: `${interaction.user}`, inline: true }, { name: '📅 Opened at', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()], components: [closeBtn] });
    return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }

  if (interaction.customId === 'ticket_ingame') {
    const { channel, existed } = await createTicketChannel(interaction.guild, interaction.user, 'ingame');
    if (existed) return interaction.reply({ content: `You already have a ticket: ${channel}! Close it first.`, ephemeral: true });
    const closeBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger));
    await channel.send({ content: `${interaction.user}`, embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('🎮 Ingame Support Ticket').setDescription('Thanks for opening a ticket!\n\n• Your ingame username?\n• What issue are you facing?\n• Screenshots if possible\n\nStaff will help you! 🎮').addFields({ name: '👤 Opened by', value: `${interaction.user}`, inline: true }, { name: '📅 Opened at', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()], components: [closeBtn] });
    return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }

  if (interaction.customId === 'ticket_staff') {
    const { channel, existed } = await createTicketChannel(interaction.guild, interaction.user, 'staff');
    if (existed) {
      const reopenBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`delete_old_app_${interaction.user.id}`).setLabel('🗑️ Delete Old & Apply Fresh').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('goto_old_app').setLabel('📂 Go to Existing').setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ content: `You already have an application: ${channel}!`, components: [reopenBtn], ephemeral: true });
    }
    const choiceButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`apply_staff_${interaction.user.id}`).setLabel('🛡️ Staff').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`apply_admin_${interaction.user.id}`).setLabel('👑 Admin').setStyle(ButtonStyle.Danger)
    );
    await channel.send({ content: `${interaction.user}`, embeds: [new EmbedBuilder().setColor('Purple').setTitle('👮 Staff/Admin Application').setDescription(`Welcome ${interaction.user}!\n\n⚠️ **You must join the Voice Channel during your application!**\n\nWhat position are you applying for?`).setFooter({ text: 'Made by Niyas 💙' })], components: [choiceButtons] });
    return interaction.reply({ content: `✅ Application channel created: ${channel}`, ephemeral: true });
  }

  if (interaction.customId.startsWith('apply_staff_') || interaction.customId.startsWith('apply_admin_')) {
    const isAdmin = interaction.customId.startsWith('apply_admin_');
    const userId = interaction.customId.split('_').pop();
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ This is not your application!', ephemeral: true });
    appSessions.set(interaction.user.id, { type: isAdmin ? 'admin' : 'staff', step: 0, answers: [], channelId: interaction.channel.id });
    const questions = isAdmin ? ADMIN_QUESTIONS : STAFF_QUESTIONS;
    await interaction.update({ embeds: [new EmbedBuilder().setColor(isAdmin ? 'Red' : 'Blue').setTitle(`${isAdmin ? '👑 Admin' : '🛡️ Staff'} Application`).setDescription(`Let's begin! 12 questions total.\n\n${questions[0]}\n\n⚠️ Minimum age: **${MIN_AGE}+**`).setFooter({ text: 'Made by Niyas 💙 | Type your answer here' })], components: [] });
    return;
  }

  if (interaction.customId === 'close_ticket') {
    const isStaff = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
    const isOwner = interaction.channel.permissionOverwrites.cache.has(interaction.user.id);
    if (!isStaff && !isOwner) return interaction.reply({ content: '❌ Only staff or ticket owner can close this!', ephemeral: true });
    const confirmBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_close').setLabel('✅ Yes, Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel_close').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({ content: 'Are you sure you want to close this ticket?', components: [confirmBtn] });
  }

  if (interaction.customId === 'confirm_close') {
    await interaction.update({ content: '🔒 Closing ticket in 5 seconds...', components: [] });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    return;
  }

  if (interaction.customId === 'cancel_close') {
    return interaction.update({ content: '✅ Close cancelled.', components: [] });
  }

  if (interaction.customId.startsWith('delete_old_app_')) {
    const userId = interaction.customId.replace('delete_old_app_', '');
    const m = interaction.guild.members.cache.get(userId);
    const oldChannel = interaction.guild.channels.cache.find(c => c.name === `staff-${m?.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    if (oldChannel) await oldChannel.delete().catch(() => {});
    appSessions.delete(userId);
    return interaction.update({ content: '✅ Old application deleted! Click **Admin/Staff Apply** again to start fresh.', components: [] });
  }

  if (interaction.customId === 'goto_old_app') {
    return interaction.update({ content: 'Go to your existing application channel!', components: [] });
  }

  if (interaction.customId.startsWith('approve_admin_')) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Only admins can approve!', ephemeral: true });
    const userId = interaction.customId.replace('approve_admin_', '');
    const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!targetMember) return interaction.reply({ content: '❌ User not found!', ephemeral: true });
    const role = interaction.guild.roles.cache.find(r => ['admin', 'staff', 'mod'].includes(r.name.toLowerCase()));
    if (!role) return interaction.reply({ content: '❌ No role named "admin", "staff" or "mod" found!', ephemeral: true });
    await targetMember.roles.add(role).catch(() => {});
    await interaction.update({ embeds: [new EmbedBuilder().setColor('Green').setTitle('✅ Approved!').setDescription(`${targetMember} given **${role.name}** by ${interaction.user}!`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()], components: [] });
    await targetMember.send('🎉 Your application has been **approved**!').catch(() => {});
    return;
  }

  if (interaction.customId.startsWith('deny_admin_')) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Only admins can deny!', ephemeral: true });
    const userId = interaction.customId.replace('deny_admin_', '');
    const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
    await interaction.update({ embeds: [new EmbedBuilder().setColor('Red').setTitle('❌ Denied').setDescription(`${targetMember || userId}'s application was denied by ${interaction.user}.`).setFooter({ text: 'Made by Niyas 💙' }).setTimestamp()], components: [] });
    if (targetMember) await targetMember.send('❌ Your application has been **denied**.').catch(() => {});
    return;
  }
});


// ── SNIPE TRACKER ──
client.on('messageDelete', (message) => {
  if (message.author?.bot) return;
  if (!message.content && !message.attachments.size) return;
  snipeMap.set(message.channel.id, {
    content: message.content || '*(no text)*',
    author: message.author?.tag || 'Unknown',
    authorAvatar: message.author?.displayAvatarURL({ dynamic: true }) || null,
    image: message.attachments.first()?.url || null,
    time: Date.now()
  });
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
