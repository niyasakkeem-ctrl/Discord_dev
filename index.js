
// ================= IMPORTS =================
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField
} = require("discord.js");

const { DisTube } = require("distube");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const ffmpeg = require("ffmpeg-static");

// ⭐ EXPRESS (RENDER FIX)
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running");
});

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// ================= MUSIC =================
const distube = new DisTube(client, {
  plugins: [new SoundCloudPlugin(), new YtDlpPlugin()],
  ffmpeg
});

// ================= ERROR HANDLING =================
client.on("error", console.error);
client.on("warn", console.warn);

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ================= ANTI-LINK =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const linkRegex = /(https?:\/\/|discord\.gg)/gi;

  if (linkRegex.test(message.content)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await message.delete().catch(() => {});
      message.channel.send("❌ Links not allowed!");
    }
  }
});

// ================= ANTI-SPAM =================
const spamMap = new Map();

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;
  const now = Date.now();
  const arr = spamMap.get(id) || [];

  const recent = arr.filter(t => now - t < 4000);
  recent.push(now);

  spamMap.set(id, recent);

  if (recent.length >= 5) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      message.delete().catch(() => {});
      message.channel.send("⚠️ Stop spamming!");
    }
  }
});

// ================= SLASH COMMANDS =================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // PLAY
  if (interaction.commandName === "play") {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel)
      return interaction.reply({ content: "Join VC first!", ephemeral: true });

    const song = interaction.options.getString("song");

    await interaction.deferReply();

    distube.play(voiceChannel, song, {
      textChannel: interaction.channel,
      member: interaction.member
    });

    interaction.editReply(`🎵 Searching: **${song}**`);
  }

  // SKIP
  if (interaction.commandName === "skip") {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue)
      return interaction.reply({ content: "No music playing!", ephemeral: true });

    distube.skip(interaction.guildId);
    interaction.reply("⏭ Skipped!");
  }
});

// ================= MUSIC EVENTS =================
distube
  .on("playSong", (queue, song) => {
    queue.textChannel.send(`🎵 Now playing: **${song.name}**`);
  })
  .on("error", (channel, error) => {
    console.log(error);
    if (channel) channel.send("❌ Music error occurred");
  });

// ================= LOGIN =================
client.login(process.env.TOKEN);
