const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [

  // ================= PING =================
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Bot ping"),

  // ================= TROLL =================
  new SlashCommandBuilder()
    .setName("troll")
    .setDescription("Troll a user")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
        .setRequired(true)
    ),

  // ================= SERVER INFO =================
  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server info"),

  // ================= AVATAR =================
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show user avatar")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
        .setRequired(false)
    ),

  // ================= USER INFO =================
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show user info")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select user")
        .setRequired(false)
    )

].map(command => command.toJSON());

// ================= REST =================
const rest = new REST({
  version: "10"
}).setToken(process.env.TOKEN);

// ================= DEPLOY =================
(async () => {
  try {

    console.log("Started refreshing application commands.");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("Successfully reloaded application commands.");

  } catch (error) {
    console.error(error);
  }
})();
