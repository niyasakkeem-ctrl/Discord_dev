const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const axios = require("axios");
const express = require("express");

// ---------------- KEEP ALIVE ----------------
const app = express();
app.get("/", (req, res) => res.send("Bot running"));
app.listen(3000);

// ---------------- BOT ----------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = "YOUR_BOT_TOKEN";
const CLIENT_ID = "YOUR_CLIENT_ID";

let startTime = Date.now();

// ---------------- AI FUNCTION ----------------
async function getAIReply(text) {
    try {
        const res = await axios.get("https://api.affiliateplus.xyz/api/chatbot", {
            params: {
                message: text,
                botname: "StromMc AI",
                ownername: "User"
            }
        });
        return res.data.message;
    } catch {
        return "AI not working 😢";
    }
}

// ---------------- SLASH COMMANDS ----------------
const commands = [
    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Show server info"),

    new SlashCommandBuilder()
        .setName("uptime")
        .setDescription("Show bot uptime"),

    new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a user")
        .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user")
        .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout user (minutes)")
        .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
        .addIntegerOption(o => o.setName("time").setDescription("Minutes").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

// register commands
(async () => {
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commands.map(c => c.toJSON())
    });
    console.log("Slash commands registered");
})();

// ---------------- READY ----------------
client.once("ready", () => {
    console.log(`${client.user.tag} online`);
});

// ---------------- SLASH HANDLER ----------------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // SERVER INFO
    if (commandName === "serverinfo") {
        const guild = interaction.guild;

        return interaction.reply({
            content: `📊 Server: ${guild.name}\n👥 Members: ${guild.memberCount}`
        });
    }

    // UPTIME
    if (commandName === "uptime") {
        const uptime = Date.now() - startTime;
        const sec = Math.floor(uptime / 1000);

        return interaction.reply(`⏱ Uptime: ${sec} seconds`);
    }

    // KICK
    if (commandName === "kick") {
        const user = interaction.options.getUser("user");
        const member = await interaction.guild.members.fetch(user.id);

        await member.kick();
        return interaction.reply(`👢 Kicked ${user.tag}`);
    }

    // BAN
    if (commandName === "ban") {
        const user = interaction.options.getUser("user");
        const member = await interaction.guild.members.fetch(user.id);

        await member.ban();
        return interaction.reply(`⛔ Banned ${user.tag}`);
    }

    // TIMEOUT
    if (commandName === "timeout") {
        const user = interaction.options.getUser("user");
        const time = interaction.options.getInteger("time");

        const member = await interaction.guild.members.fetch(user.id);
        await member.timeout(time * 60 * 1000);

        return interaction.reply(`⏳ Timed out ${user.tag} for ${time} min`);
    }
});

// ---------------- MENTION AI ----------------
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user)) {
        const question = message.content.replace(/<@!?\\d+>/g, "").trim();

        if (!question) return message.reply("🤖 Ask something!");

        const reply = await getAIReply(question);
        message.reply(reply);
    }
});

// ---------------- LOGIN ----------------
client.login(TOKEN);
