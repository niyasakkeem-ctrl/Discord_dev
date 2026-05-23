const { REST, Routes } = require("discord.js");

const commands = [
  {
    name: "play",
    description: "Play a song",
    options: [
      {
        name: "song",
        type: 3,
        description: "Song name or link",
        required: true
      }
    ]
  },
  {
    name: "skip",
    description: "Skip current song"
  }
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("Slash commands registered!");
  } catch (err) {
    console.log(err);
  }
})();
