const express = require("express");
const {
  const play = require("play-dl");
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require("@discordjs/voice");
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with pong"),

  new SlashCommandBuilder()
    .setName("about")
    .setDescription("About the bot"),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Shows server info"),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Shows user avatar")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select a user")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("troll")
    .setDescription("Troll someone")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("Slash commands registered!");

  } catch (error) {
    console.error(error);
  }
})();

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("guildMemberAdd", member => {

  const channel = member.guild.systemChannel;

  if (!channel) return;

  channel.send(`Welcome ${member} to ${member.guild.name} 🎉`);

});

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  if (interaction.commandName === "about") {
    return interaction.reply("🔥 Multi-purpose Discord bot");
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

    const user =
      interaction.options.getUser("user") || interaction.user;

    return interaction.reply(user.displayAvatarURL());
  }

  if (interaction.commandName === "troll") {

    const user = interaction.options.getUser("user");

    const replies = [
      `${user} forgot how to breathe 💀`,
      `${user} eats Minecraft dirt 😭`,
      `${user} has 999 ping 📶`
    ];

    const randomReply =
      replies[Math.floor(Math.random() * replies.length)];

    return interaction.reply(randomReply);
  }

  if (interaction.commandName === "purge") {

    const amount =
      interaction.options.getInteger("amount");

    await interaction.channel.bulkDelete(amount, true);

    return interaction.reply({
      content: `Deleted ${amount} messages`,
      ephemeral: true
    });
  }

});

client.login(process.env.DISCORD_BOT_TOKEN);
