const express = require("express");
const play = require("play-dl");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource
} = require("@discordjs/voice");

// ================= EXPRESS (Render keep alive) =================
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(3000, () => console.log("Web server running"));

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ================= SLASH COMMANDS =================
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Replies with pong"),

  new SlashCommandBuilder().setName("about").setDescription("About bot"),

  new SlashCommandBuilder().setName("serverinfo").setDescription("Server info"),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("User avatar")
    .addUserOption(opt =>
      opt.setName("user").setDescription("user").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("troll")
    .setDescription("Troll user")
    .addUserOption(opt =>
      opt.setName("user").setDescription("user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages")
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("count").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
].map(c => c.toJSON());

// ================= REGISTER COMMANDS =================
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("Slash commands registered!");
  } catch (err) {
    console.log(err);
  }
})();

// ================= READY =================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ================= WELCOME =================
client.on("guildMemberAdd", member => {
  const channel = member.guild.systemChannel;
  if (!channel) return;
  channel.send(`Welcome ${member} 🎉`);
});

// ================= SLASH COMMANDS =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  if (interaction.commandName === "about") {
    return interaction.reply("🔥 StromMc Multi-purpose bot");
  }

  if (interaction.commandName === "serverinfo") {
    const embed = new EmbedBuilder()
      .setTitle("📊 Server Info")
      .addFields(
        { name: "Server Name", value: interaction.guild.name },
        { name: "Members", value: `${interaction.guild.memberCount}` }
      );

    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "avatar") {
    const user = interaction.options.getUser("user") || interaction.user;
    return interaction.reply(user.displayAvatarURL());
  }

  if (interaction.commandName === "troll") {
    const user = interaction.options.getUser("user");

    const replies = [
      `${user} forgot brain 💀`,
      `${user} eats dirt 😂`,
      `${user} has 999 ping 📶`
    ];

    const msg = replies[Math.floor(Math.random() * replies.length)];
    return interaction.reply(msg);
  }

  if (interaction.commandName === "purge") {
    const amount = interaction.options.getInteger("amount");

    await interaction.channel.bulkDelete(amount, true);

    return interaction.reply({
      content: `Deleted ${amount} messages`,
      ephemeral: true
    });
  }
});

// ================= MUSIC COMMAND (FIXED) =================
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!play")) return;

  const query = message.content.slice(6).trim();

  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) return message.reply("Join VC first 🎧");

  try {
    const search = await play.search(query, { limit: 1 });
    if (!search.length) return message.reply("No song found ❌");

    const video = search[0];

    const stream = await play.stream(video.url);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator
    });

    const player = createAudioPlayer();

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type
    });

    connection.subscribe(player);
    player.play(resource);

    message.reply(`🎶 Now playing: **${video.title}**`);

  } catch (err) {
    console.log(err);
    message.reply("Music play failed ❌");
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_BOT_TOKEN);
