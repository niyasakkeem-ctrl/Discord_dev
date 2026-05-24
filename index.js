const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');

// ===================== CONFIG =====================
const PREFIX = '?';
const TOKEN = process.env.DISCORD_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const LOG_CHANNEL_NAME = 'mod-logs';
const TICKET_CATEGORY_NAME = 'Tickets';

// ===================== INIT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
  ]
});

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const spamMap = new Map();
const SPAM_THRESHOLD = 5;
const SPAM_INTERVAL = 4000;

const nukeMap = new Map();
const NUKE_THRESHOLD = 3;
const NUKE_INTERVAL = 10000;

const LINK_REGEX = /https?:\/\/|discord\.gg\/|www\./i;

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
  if (logChannel) logChannel.send({ embeds: [embed] });
}

function checkNuke(userId, action) {
  const now = Date.now();
  if (!nukeMap.has(userId)) nukeMap.set(userId, { deletes: 0, bans: 0, kicks: 0, time: now });
  const data = nukeMap.get(userId);
  if (now - data.time > NUKE_INTERVAL) {
    nukeMap.set(userId, { deletes: 0, bans: 0, kicks: 0, time: now });
  }
  data[action] = (data[action] || 0) + 1;
  return data[action] >= NUKE_THRESHOLD;
}

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity('?help | Made with 💙', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const content = message.content;
  const member = message.member;

  if (LINK_REGEX.test(content) && !member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`🔗 ${message.author}, links are not allowed here!`);
    setTimeout(() => warn.delete().catch(() => {}), 5000);
    return;
  }

  const now = Date.now();
  if (!spamMap.has(message.author.id)) spamMap.set(message.author.id, { count: 0, lastMessage: now });
  const spamData = spamMap.get(message.author.id);
  if (now - spamData.lastMessage < SPAM_INTERVAL) {
    spamData.count++;
    if (spamData.count >= SPAM_THRESHOLD) {
      await message.member.timeout(60000, 'Auto-timeout: Spamming').catch(() => {});
      const spamEmbed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('🚨 Anti-Spam')
        .setDescription(`${message.author} was timed out for **1 minute** for spamming.`)
        .setTimestamp();
      await message.channel.send({ embeds: [spamEmbed] });
      spamMap.set(message.author.id, { count: 0, lastMessage: now });
      await sendLog(message.guild, spamEmbed);
      return;
    }
  } else {
    spamMap.set(message.author.id, { count: 1, lastMessage: now });
  }
  spamData.lastMessage = now;

  if (message.mentions.has(client.user)) {
    const userMsg = content.replace(/<@!?[0-9]+>/g, '').trim();
    if (!userMsg) return message.reply('Mention panni something ask panu bro! 🤖');
    try {
      await message.channel.sendTyping();
      const aiRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{ role: 'user', content: userMsg }]
      });
      const reply = aiRes.content[0].text;
      const aiEmbed = new EmbedBuilder()
        .setColor('Blurple')
        .setAuthor({ name: 'Claude AI 🤖', iconURL: client.user.displayAvatarURL() })
        .setDescription(reply)
        .setFooter({ text: `Asked by ${message.author.tag}` })
        .setTimestamp();
      return message.reply({ embeds: [aiEmbed] });
    } catch {
      return message.reply('AI error achu bro, try again! 😅');
    }
  }

  if (!content.startsWith(PREFIX)) return;
  const args = content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor('Blurple')
      .setTitle('📖 Bot Commands')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: '🎉 Fun', value: '`?fun` `?troll @user` `?roast @user`', inline: false },
        { name: 'ℹ️ Info', value: '`?serverinfo` `?about` `?avatar [@user]` `?userinfo [@user]`', inline: false },
        { name: '🎫 Tickets', value: '`?ticket <reason>` `?closeticket`', inline: false },
        { name: '🔨 Moderation', value: '`?ban @user [reason]` `?kick @user [reason]` `?timeout @user <minutes> [reason]` `?unban <userID>`', inline: false },
        { name: '🛡️ Auto-Mod', value: 'Anti-Spam • Anti-Link • Anti-Nuke (all automatic)', inline: false },
        { name: '🤖 AI', value: 'Just mention the bot and ask anything!', inline: false }
      )
      .setFooter({ text: `Prefix: ${PREFIX} | Made with 💙` })
      .setTimestamp();
    return message.reply({ embeds: [helpEmbed] });
  }

  if (command === 'fun') {
    const pick = funResponses[Math.floor(Math.random() * funResponses.length)];
    const funEmbed = new EmbedBuilder()
      .setColor('Yellow')
      .setDescription(pick)
      .setFooter({ text: `Requested by ${message.author.tag}` });
    return message.reply({ embeds: [funEmbed] });
  }

  if (command === 'troll') {
    const target = message.mentions.members.first();
    const pick = trollResponses[Math.floor(Math.random() * trollResponses.length)];
    const trollEmbed = new EmbedBuilder()
      .setColor('Red')
      .setDescription(target ? `${target} — ${pick}` : pick)
      .setFooter({ text: `Trolled by ${message.author.tag}` });
    return message.reply({ embeds: [trollEmbed] });
  }

  if (command === 'roast') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('Tag someone to roast bro! 😤');
    try {
      await message.channel.sendTyping();
      const aiRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: `Give a funny, savage but harmless roast for a Discord user named ${target.user.username}. Keep it short, playful, and not offensive.` }]
      });
      const roastEmbed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('🔥 Roasted!')
        .setDescription(`${target} — ${aiRes.content[0].text}`)
        .setFooter({ text: `Roasted by ${message.author.tag}` });
      return message.reply({ embeds: [roastEmbed] });
    } catch {
      return message.reply('Roast engine failed 😭 Try again!');
    }
  }

  if (command === 'serverinfo') {
    const guild = message.guild;
    await guild.members.fetch();
    const bots = guild.members.cache.filter(m => m.user.bot).size;
    const humans = guild.members.cache.size - bots;
    const serverEmbed = new EmbedBuilder()
      .setColor('Green')
      .setTitle(`📊 ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '👥 Members', value: `${humans} humans | ${bots} bots`, inline: true },
        { name: '📢 Channels', value: `${guild.channels.cache.size}`, inline: true },
        { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
        { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
        { name: '🔒 Verification', value: `${guild.verificationLevel}`, inline: true },
        { name: '🆔 Server ID', value: guild.id, inline: true }
      )
      .setTimestamp();
    return message.reply({ embeds: [serverEmbed] });
  }

  if (command === 'about') {
    const aboutEmbed = new EmbedBuilder()
      .setColor('Blurple')
      .setTitle('🤖 About This Bot')
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription('A powerful all-in-one Discord bot with moderation, fun, AI and more!')
      .addFields(
        { name: '🧠 AI', value: 'Powered by Claude (Anthropic)', inline: true },
        { name: '⚙️ Built With', value: 'Node.js + discord.js', inline: true },
        { name: '🛡️ Features', value: 'Anti-Spam, Anti-Nuke, Anti-Link, Tickets, Moderation, Fun, AI', inline: false },
        { name: '📌 Prefix', value: `\`${PREFIX}\``, inline: true },
        { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true }
      )
      .setFooter({ text: 'Made with 💙 on Node.js' })
      .setTimestamp();
    return message.reply({ embeds: [aboutEmbed] });
  }

  if (command === 'avatar') {
    const target = message.mentions.members.first() || message.member;
    const avatarEmbed = new EmbedBuilder()
      .setColor('Aqua')
      .setTitle(`🖼️ ${target.user.username}'s Avatar`)
      .setImage(target.user.displayAvatarURL({ dynamic: true, size: 1024 }))
      .setFooter({ text: `Requested by ${message.author.tag}` });
    return message.reply({ embeds: [avatarEmbed] });
  }

  if (command === 'userinfo') {
    const target = message.mentions.members.first() || message.member;
    const roles = target.roles.cache.filter(r => r.id !== message.guild.id).map(r => `${r}`).join(', ') || 'None';
    const userEmbed = new EmbedBuilder()
      .setColor('Purple')
      .setTitle(`👤 ${target.user.username}`)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🆔 User ID', value: target.user.id, inline: true },
        { name: '🤖 Bot?', value: target.user.bot ? 'Yes' : 'No', inline: true },
        { name: '📅 Account Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '📥 Joined Server', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`, inline: true },
        { name: '🎭 Top Role', value: `${target.roles.highest}`, inline: true },
        { name: '📋 Roles', value: roles.length > 1024 ? 'Too many roles' : roles, inline: false }
      )
      .setTimestamp();
    return message.reply({ embeds: [userEmbed] });
  }

  if (command === 'ticket') {
    const reason = args.join(' ') || 'No reason provided';
    const guild = message.guild;
    let category = guild.channels.cache.find(c => c.name === TICKET_CATEGORY_NAME && c.type === ChannelType.GuildCategory);
    if (!category) {
      category = await guild.channels.create({ name: TICKET_CATEGORY_NAME, type: ChannelType.GuildCategory });
    }
    const existing = guild.channels.cache.find(c => c.name === `ticket-${message.author.username.toLowerCase()}`);
    if (existing) return message.reply(`You already have an open ticket: ${existing}!`);
    const ticketChannel = await guild.channels.create({
      name: `ticket-${message.author.username.toLowerCase()}`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ]
    });
    const closeBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
    );
    const ticketEmbed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('🎫 Ticket Opened')
      .setDescription(`Hello ${message.author}! Support will be with you shortly.\n\n**Reason:** ${reason}`)
      .setFooter({ text: 'Click the button below to close this ticket.' })
      .setTimestamp();
    await ticketChannel.send({ embeds: [ticketEmbed], components: [closeBtn] });
    return message.reply(`✅ Ticket created: ${ticketChannel}`);
  }

  if (command === 'closeticket') {
    if (!message.channel.name.startsWith('ticket-')) return message.reply('This is not a ticket channel!');
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
    const banEmbed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('🔨 Member Banned')
      .addFields(
        { name: 'User', value: `${target.user.tag}`, inline: true },
        { name: 'Reason', value: reason, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true }
      )
      .setTimestamp();
    await message.reply({ embeds: [banEmbed] });
    await sendLog(message.guild, banEmbed);
    if (checkNuke(message.author.id, 'bans')) {
      await message.member.ban({ reason: 'Anti-Nuke: Mass banning detected' }).catch(() => {});
    }
    return;
  }

  if (command === 'kick') {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ You need Kick Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Tag someone to kick!');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.kick(reason).catch(() => {});
    const kickEmbed = new EmbedBuilder()
      .setColor('Orange')
      .setTitle('👢 Member Kicked')
      .addFields(
        { name: 'User', value: `${target.user.tag}`, inline: true },
        { name: 'Reason', value: reason, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true }
      )
      .setTimestamp();
    await message.reply({ embeds: [kickEmbed] });
    await sendLog(message.guild, kickEmbed);
    if (checkNuke(message.author.id, 'kicks')) {
      await message.member.ban({ reason: 'Anti-Nuke: Mass kicking detected' }).catch(() => {});
    }
    return;
  }

  if (command === 'timeout') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ You need Moderate Members permission!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Tag someone to timeout!');
    const minutes = parseInt(args[1]) || 5;
    const reason = args.slice(2).join(' ') || 'No reason provided';
    await target.timeout(minutes * 60000, reason).catch(() => {});
    const toEmbed = new EmbedBuilder()
      .setColor('Yellow')
      .setTitle('⏱️ Member Timed Out')
      .addFields(
        { name: 'User', value: `${target.user.tag}`, inline: true },
        { name: 'Duration', value: `${minutes} minutes`, inline: true },
        { name: 'Reason', value: reason, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true }
      )
      .setTimestamp();
    await message.reply({ embeds: [toEmbed] });
    await sendLog(message.guild, toEmbed);
    return;
  }

  if (command === 'unban') {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ You need Ban Members permission!');
    const userId = args[0];
    if (!userId) return message.reply('Provide a user ID to unban!');
    await message.guild.members.unban(userId).catch(() => {});
    return message.reply(`✅ User \`${userId}\` has been unbanned.`);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId === 'close_ticket') {
    if (!interaction.channel.name.startsWith('ticket-')) return;
    await interaction.reply('🔒 Closing ticket in 5 seconds...');
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
});

client.on('channelDelete', async (channel) => {
  const logs = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 }).catch(() => null);
  if (!logs) return;
  const entry = logs.entries.first();
  if (!entry) return;
  const executor = entry.executor;
  if (executor.id === client.user.id) return;
  if (checkNuke(executor.id, 'deletes')) {
    const guild = channel.guild;
    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (member) {
      await member.ban({ reason: 'Anti-Nuke: Mass channel deletion detected' }).catch(() => {});
      const nukeEmbed = new EmbedBuilder()
        .setColor('DarkRed')
        .setTitle('🚨 Anti-Nuke Triggered!')
        .setDescription(`**${executor.tag}** was banned for mass channel deletion!`)
        .setTimestamp();
      await sendLog(guild, nukeEmbed);
    }
  }
});

client.login(TOKEN);
