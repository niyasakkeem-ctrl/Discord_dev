const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const axios = require("axios");
const express = require("express");

// ---------------- KEEP ALIVE ----------------
const app = express();
app.get("/", (req, res) => res.send("Security Bot Running ✅"));
app.listen(3000);

// ---------------- BOT ----------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const TOKEN = "YOUR_BOT_TOKEN";
const CLIENT_ID = "YOUR_CLIENT_ID";

let startTime = Date.now();

// ---------------- SECURITY STORAGE ----------------
const whitelist = new Set(["YOUR_ID_HERE"]);

const spamMap = new Map();
const linkRegex = /(https?:\/\/|discord\.gg\/)/i;

const antiNuke = {
    channel: {},
    role: {}
};

// ---------------- AI FUNCTION ----------------
async function getAIReply(text) {
    try {
        const res = await axios.get("https://api.affiliateplus.xyz/api/chatbot", {
            params: {
                message: text,
                botname: "StromMc AI",
                ownername: "Security Bot"
            }
        });
        return res.data.message;
    } catch {
        return "AI error 😢";
    }
}

// ---------------- SLASH COMMANDS ----------------
const commands = [
    new SlashCommandBuilder().setName("serverinfo").setDescription("Server info"),
    new SlashCommandBuilder().setName("uptime").setDescription("Bot uptime"),

    new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick user")
        .addUserOption(o => o.setName("user").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban user")
        .addUserOption(o => o.setName("user").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout user")
        .addUserOption(o => o.setName("user").setRequired(true))
        .addIntegerOption(o => o.setName("time").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commands.map(c => c.toJSON())
    });
    console.log("Slash commands loaded ✅");
})();

// ---------------- READY ----------------
client.once("ready", () => {
    console.log(`${client.user.tag} ONLINE 🚀`);
});

// ---------------- SLASH HANDLER ----------------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "serverinfo") {
        const g = interaction.guild;
        return interaction.reply(`📊 ${g.name}\n👥 Members: ${g.memberCount}`);
    }

    if (commandName === "uptime") {
        const sec = Math.floor((Date.now() - startTime) / 1000);
        return interaction.reply(`⏱ Uptime: ${sec}s`);
    }

    if (commandName === "kick") {
        const user = interaction.options.getUser("user");
        const m = await interaction.guild.members.fetch(user.id);
        await m.kick();
        return interaction.reply(`👢 Kicked ${user.tag}`);
    }

    if (commandName === "ban") {
        const user = interaction.options.getUser("user");
        const m = await interaction.guild.members.fetch(user.id);
        await m.ban();
        return interaction.reply(`⛔ Banned ${user.tag}`);
    }

    if (commandName === "timeout") {
        const user = interaction.options.getUser("user");
        const time = interaction.options.getInteger("time");
        const m = await interaction.guild.members.fetch(user.id);

        await m.timeout(time * 60000);
        return interaction.reply(`⏳ Timed out ${user.tag} for ${time} min`);
    }
});

// ---------------- AUTO ROLE ----------------
client.on("guildMemberAdd", async (member) => {
    const role = member.guild.roles.cache.find(r => r.name === "Member");
    if (role) member.roles.add(role).catch(() => {});
});

// ---------------- ANTI-NUKER ----------------
client.on("channelDelete", async (channel) => {
    const guild = channel.guild;
    const executor = (await guild.fetchAuditLogs({ type: 12 })).entries.first()?.executor;

    if (!executor || whitelist.has(executor.id)) return;

    antiNuke.channel[executor.id] = (antiNuke.channel[executor.id] || 0) + 1;

    setTimeout(() => {
        antiNuke.channel[executor.id] = 0;
    }, 10000);

    if (antiNuke.channel[executor.id] >= 3) {
        const m = await guild.members.fetch(executor.id).catch(() => null);
        if (m) m.ban({ reason: "Anti-Nuke Channel Delete" });
    }
});

client.on("roleDelete", async (role) => {
    const guild = role.guild;
    const executor = (await guild.fetchAuditLogs({ type: 32 })).entries.first()?.executor;

    if (!executor || whitelist.has(executor.id)) return;

    antiNuke.role[executor.id] = (antiNuke.role[executor.id] || 0) + 1;

    setTimeout(() => {
        antiNuke.role[executor.id] = 0;
    }, 10000);

    if (antiNuke.role[executor.id] >= 3) {
        const m = await guild.members.fetch(executor.id).catch(() => null);
        if (m) m.ban({ reason: "Anti-Nuke Role Delete" });
    }
});

// ---------------- ANTI-SPAM + ANTI-LINK + AI ----------------
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const id = message.author.id;
    const now = Date.now();

    // ---------------- AI MENTION ----------------
    if (message.mentions.has(client.user)) {
        const q = message.content.replace(/<@!?\\d+>/g, "").trim();
        if (!q) return message.reply("Ask something 🤖");

        const reply = await getAIReply(q);
        return message.reply(reply);
    }

    // ---------------- ANTI-SPAM ----------------
    if (!spamMap.has(id)) spamMap.set(id, []);
    const arr = spamMap.get(id);

    arr.push(now);
    const recent = arr.filter(t => now - t < 10000);
    spamMap.set(id, recent);

    if (recent.length >= 6) {
        const m = await message.member;
        if (m?.moderatable) {
            await m.timeout(60000, "Anti-Spam");
            message.channel.send(`🚫 ${message.author.tag} muted for spam`);
        }
        spamMap.set(id, []);
    }

    // ---------------- ANTI-LINK ----------------
    if (linkRegex.test(message.content)) {
        if (message.member.permissions.has("Administrator")) return;

        await message.delete().catch(() => {});

        message.channel.send(`🚫 ${message.author} links not allowed`);

        if (message.member.moderatable) {
            await message.member.timeout(60000, "Anti-Link");
        }
    }
});

// ---------------- LOGIN ----------------
client.login(TOKEN);
