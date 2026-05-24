const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");

const express = require("express");
const fetch = require("node-fetch");

// ================= WEB SERVER =================
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(10000, () => {
  console.log("Web server running");
});

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// ================= READY =================
client.once("ready", () => {
  console.log(`${client.user.tag} is online!`);
});

// ================= ERROR HANDLING =================
client.on("error", console.error);
client.on("warn", console.warn);

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ================= ANTI LINK =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const linkRegex = /(https?:\/\/|discord\.gg)/gi;

  if (linkRegex.test(message.content)) {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      await message.delete().catch(() => {});
      message.channel.send("❌ Links are not allowed!");
    }
  }
});

// ================= ANTI SPAM =================
const spamMap = new Map();

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;
  const now = Date.now();

  const arr = spamMap.get(id) || [];

  const recent = arr.filter((t) => now - t < 4000);

  recent.push(now);

  spamMap.set(id, recent);

  if (recent.length >= 5) {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      await message.delete().catch(() => {});
      message.channel.send("⚠️ Stop spamming!");
    }
  }
});

// ================= SLASH COMMANDS =================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // ================= PING =================
  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  // ================= TROLL =================
  if (interaction.commandName === "troll") {
    const user = interaction.options.getUser("user");

    const trolls = [
      `${user.username} eats cement for breakfast 💀`,
      `${user.username} sleeps in math class 😭`,
      `${user.username} got defeated by WiFi router 🤡`,
      `${user.username} drinks ketchup 🗿`
    ];

    const random =
      trolls[Math.floor(Math.random() * trolls.length)];

    const embed = new EmbedBuilder()
      .setTitle("😂 Troll Command")
      .setDescription(random)
      .setColor("Blue");

    return interaction.reply({ embeds: [embed] });
  }

  // ================= SERVER INFO =================
  if (interaction.commandName === "serverinfo") {
    const embed = new EmbedBuilder()
      .setTitle("📊 Server Info")
      .addFields(
        {
          name: "Server Name",
          value: interaction.guild.name,
          inline: true
        },
        {
          name: "Members",
          value: `${interaction.guild.memberCount}`,
          inline: true
        }
      )
      .setColor("Blue");

    return interaction.reply({ embeds: [embed] });
  }

  // ================= AVATAR =================
  if (interaction.commandName === "avatar") {
    const user =
      interaction.options.getUser("user") ||
      interaction.user;

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Avatar`)
      .setImage(user.displayAvatarURL({ size: 1024 }))
      .setColor("Blue");

    return interaction.reply({ embeds: [embed] });
  }

  // ================= USER INFO =================
  if (interaction.commandName === "userinfo") {
    const user =
      interaction.options.getUser("user") ||
      interaction.user;

    const member = interaction.guild.members.cache.get(
      user.id
    );

    const embed = new EmbedBuilder()
      .setTitle("👤 User Info")
      .addFields(
        {
          name: "Username",
          value: user.tag,
          inline: true
        },
        {
          name: "Joined Server",
          value: `<t:${parseInt(
            member.joinedTimestamp / 1000
          )}:R>`,
          inline: true
        }
      )
      .setThumbnail(user.displayAvatarURL())
      .setColor("Blue");

    return interaction.reply({ embeds: [embed] });
  }
});

// ================= AI CHAT =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.mentions.has(client.user)) {

    const msg = message.content
      .replace(`<@${client.user.id}>`, "")
      .trim();

    if (!msg)
      return message.reply("👋 Ask me something!");

    try {

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: msg
                  }
                ]
              }
            ]
          })
        }
      );

      const data = await response.json();

      const reply =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "❌ AI no response";

      message.reply(reply.slice(0, 2000));

    } catch (err) {
      console.log(err);
      message.reply("❌ AI error");
    }
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
