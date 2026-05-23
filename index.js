const express = require("express");
const play = require("play-dl");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource
} = require("@discordjs/voice");

// ===== SERVER =====
const app = express();
app.get("/", (req, res) => res.send("Ultra Pro Bot Online"));
app.listen(3000);

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

// ===== COMMANDS =====
const commands = [

  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play music")
    .addStringOption(o =>
      o.setName("song").setDescription("Song name").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open ticket"),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send announcement")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("troll")
    .setDescription("Troll user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Bot ping")

].map(c => c.toJSON());

// ===== REGISTER =====
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
})();

// ===== READY =====
client.once("ready", () => {
  console.log(`${client.user.tag} ONLINE`);
});

// ===== WELCOME + AUTO ROLE =====
client.on("guildMemberAdd", async member => {

  const channel = member.guild.systemChannel;
  if (channel) {
    channel.send(`👋 Welcome ${member}`);
  }

  const role = member.guild.roles.cache.find(r => r.name === "Member");
  if (role) member.roles.add(role);
});

// ===== MUSIC FIXED =====
client.on("interactionCreate", async i => {

  if (!i.isChatInputCommand()) return;

  if (i.commandName === "play") {

    const vc = i.member?.voice?.channel;
    if (!vc) return i.reply("❌ Join VC first");

    const query = i.options.getString("song");

    const search = await play.search(query, { limit: 1 });
    if (!search.length) return i.reply("No song found");

    const video = search[0];
    const stream = await play.stream(video.url);

    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: i.guild.id,
      adapterCreator: i.guild.voiceAdapterCreator
    });

    const player = createAudioPlayer();
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type
    });

    connection.subscribe(player);
    player.play(resource);

    const embed = new EmbedBuilder()
      .setTitle("🎶 Now Playing")
      .setDescription(video.title)
      .setColor("Blue");

    return i.reply({ embeds: [embed] });
  }

  // ===== TICKET SYSTEM =====
  if (i.commandName === "ticket") {

    const btn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel("Create Ticket")
        .setStyle(ButtonStyle.Primary)
    );

    return i.reply({ content: "🎟️ Click to create ticket", components: [btn] });
  }

  // ===== ANNOUNCEMENT =====
  if (i.commandName === "announce") {

    if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
      return i.reply("No permission");

    const msg = i.options.getString("message");

    const embed = new EmbedBuilder()
      .setTitle("📢 Announcement")
      .setDescription(msg)
      .setColor("Red");

    return i.channel.send({ embeds: [embed] });
  }

  // ===== TROLL =====
  if (i.commandName === "troll") {

    const user = i.options.getUser("user");

    const embed = new EmbedBuilder()
      .setTitle("😂 Troll")
      .setDescription(`${user} got roasted 💀`)
      .setColor("Random");

    return i.reply({ embeds: [embed] });
  }

  // ===== PING =====
  if (i.commandName === "ping") {
    return i.reply(`🏓 Pong! ${client.ws.ping}ms`);
  }
});

// ===== BUTTONS (TICKET) =====
client.on("interactionCreate", async i => {

  if (!i.isButton()) return;

  if (i.customId === "create_ticket") {

    const ch = await i.guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: i.guild.id, deny: ["ViewChannel"] },
        { id: i.user.id, allow: ["ViewChannel", "SendMessages"] }
      ]
    });

    const close = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    );

    ch.send({ content: "🎟️ Support ticket", components: [close] });

    return i.reply({ content: `Ticket created: ${ch}`, ephemeral: true });
  }

  if (i.customId === "close_ticket") {
    return i.channel.delete();
  }
});

// ===== ANTI NUKER (BASIC) =====
let deleteCount = {};

client.on("channelDelete", async channel => {
  const guildId = channel.guild.id;

  deleteCount[guildId] = (deleteCount[guildId] || 0) + 1;

  if (deleteCount[guildId] >= 3) {
    const owner = await channel.guild.fetchOwner();
    owner.send("⚠️ Anti-nuke alert: multiple channels deleted");
  }

  setTimeout(() => deleteCount[guildId] = 0, 10000);
});

// ===== LOGIN =====
client.login(process.env.DISCORD_BOT_TOKEN);
