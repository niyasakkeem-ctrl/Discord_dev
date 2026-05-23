const express = require("express");
const play = require("play-dl");

const {
  Client,
  GatewayIntentBits
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource
} = require("@discordjs/voice");

// ===== KEEP ALIVE SERVER =====
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(3000, () => console.log("Server running"));

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ===== READY =====
client.once("ready", () => {
  console.log(`${client.user.tag} is online`);
});

// ===== FUN COMMENTS =====
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  // 😂 troll command
  if (message.content === "!troll") {
    const replies = [
      "😂 Nee romba funny da",
      "💀 Bro got roasted",
      "🔥 Skill issue moment",
      "🤣 Ultimate troll activated"
    ];

    return message.reply(replies[Math.floor(Math.random() * replies.length)]);
  }

  // 🎧 MUSIC COMMAND
  if (!message.content.startsWith("!play")) return;

  const query = message.content.slice(6).trim();

  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) return message.reply("Join VC first 🎧");

  try {
    const search = await play.search(query, { limit: 1 });
    if (!search.length) return message.reply("Song not found ❌");

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

// ===== LOGIN =====
client.login(process.env.DISCORD_BOT_TOKEN);
