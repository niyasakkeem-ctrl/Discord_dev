const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(3000, () => {
  console.log("Web server running");
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (message.content === "hi") {
    message.reply("Hello 👋");
  }

  if (message.content === "ping") {
    message.reply("pong 🏓");
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
