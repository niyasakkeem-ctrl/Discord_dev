const express = require("express");
const play = require("play-dl");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource
} = require("@discordjs/voice");

// ===== EXPRESS =====
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot alive"));
app.listen(PORT, () => console.log("Server running"));

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ===== SLASH COMMANDS =====
const commands = [

  // 🎧 MUSIC
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play music")
    .addStringOption(opt =>
      opt.setName("song").setDescription("Song name").setRequired(true)
    ),

  // 😂 TROLL
  new SlashCommandBuilder()
    .setName("troll")
    .setDescription("Troll a user")
    .addUserOption(opt =>
      opt.setName("user").setDescription("User").setRequired(true)
    ),

  // 🎟️ TICKET
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Create ticket"),

  // 📢 ANNOUNCEMENT
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Make announcement")
    .addStringOption(opt =>
      opt.setName("message").setDescription("Message").setRequired(true)
    ),

].map(cmd => cmd.toJSON());

// ===== REGISTER COMMANDS =====
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("Slash commands registered");
  } catch (err) {
    console.log(err);
  }
})();

// ===== READY =====
client.once("ready", () => {
  console.log(`${client.user.tag} online`);
});

// ===== WELCOME =====
client.on("guildMemberAdd", member => {
  const channel = member.guild.systemChannel;
  if (!channel) return;
  channel.send(`👋 Welcome ${member} to **${member.guild.name}**`);
});

// ===== COMMANDS =====
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isChatInputCommand()) return;

  // 🎧 PLAY
  if (interaction.commandName === "play") {

    const query = interaction.options.getString("song");

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.reply("Join VC first 🎧");

    const search = await play.search(query, { limit: 1 });
    if (!search.length) return interaction.reply("No song found ❌");

    const video = search[0];

    const streamData = await play.stream(video.url);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator
    });

    const player = createAudioPlayer();

    const resource = createAudioResource(streamData.stream, {
      inputType: streamData.type
    });

    connection.subscribe(player);
    player.play(resource);

    return interaction.reply(`🎶 Playing: **${video.title}**`);
  }

  // 😂 TROLL
  if (interaction.commandName === "troll") {

    const user = interaction.options.getUser("user");

    const msgs = [
      `${user} is funny 😂`,
      `${user} got roasted 💀`,
      `${user} skill issue moment 🔥`
    ];

    return interaction.reply(msgs[Math.floor(Math.random() * msgs.length)]);
  }

  // 🎟️ TICKET
  if (interaction.commandName === "ticket") {
    return interaction.reply("🎟️ Ticket created! Staff will help you soon.");
  }

  // 📢 ANNOUNCE
  if (interaction.commandName === "announce") {

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply("❌ No permission");

    const msg = interaction.options.getString("message");

    return interaction.reply(`📢 **ANNOUNCEMENT**\n\n${msg}`);
  }
});

// ===== LOGIN =====
client.login(process.env.DISCORD_BOT_TOKEN);
