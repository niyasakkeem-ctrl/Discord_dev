const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const readline = require("readline");

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

client.distube = new DisTube(client, {
    plugins: [new SpotifyPlugin(), new SoundCloudPlugin()],
    leaveOnStop: true,
    emitNewSongOnly: true
});

let config = {
    welcomeChannel: null,
    welcomeMessage: "Welcome {user} to {server} 🎉",
    announcementChannel: null
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(q) {
    return new Promise(resolve => rl.question(q, ans => resolve(ans)));
}

const antiNuke = new Map();

client.on("channelDelete", async (channel) => {
    const logs = await channel.guild.fetchAuditLogs({ type: 12 });
    const executor = logs.entries.first()?.executor;
    if (!executor) return;

    const count = (antiNuke.get(executor.id) || 0) + 1;
    antiNuke.set(executor.id, count);

    if (count >= 3) {
        const member = await channel.guild.members.fetch(executor.id).catch(() => {});
        if (member) member.ban({ reason: "Anti-Nuke System" }).catch(() => {});
    }
});

client.on("roleDelete", async (role) => {
    const logs = await role.guild.fetchAuditLogs({ type: 32 });
    const executor = logs.entries.first()?.executor;
    if (!executor) return;

    const member = await role.guild.members.fetch(executor.id).catch(() => {});
    if (member) member.ban({ reason: "Anti-Nuke Role Delete" }).catch(() => {});
});

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    config.welcomeChannel = await ask("WELCOME channel ID: ");
    config.welcomeMessage = await ask("Welcome message ({user},{server}): ");
    config.announcementChannel = await ask("Announcement channel ID: ");

    rl.close();
});

client.on("guildMemberAdd", (member) => {
    const channel = member.guild.channels.cache.get(config.welcomeChannel);
    if (!channel) return;

    const msg = config.welcomeMessage
        .replace("{user}", `<@${member.id}>`)
        .replace("{server}", member.guild.name);

    const embed = new EmbedBuilder()
        .setTitle("Welcome")
        .setDescription(msg)
        .setColor("Green");

    channel.send({ embeds: [embed] });
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith("!play")) {
        const args = message.content.split(" ").slice(1);
        if (!args.length) return message.reply("Give song name");

        if (!message.member.voice.channel)
            return message.reply("Join voice channel first");

        client.distube.play(message.member.voice.channel, args.join(" "), {
            textChannel: message.channel,
            member: message.member
        });
    }

    if (message.content === "!stop") {
        client.distube.stop(message);
        message.channel.send("Stopped music");
    }

    if (message.content.startsWith("!troll")) {
        const args = message.content.split(" ").slice(1);
        const user = message.mentions.users.first();
        const text = args.slice(1).join(" ");

        if (!user || !text) return message.reply("!troll @user msg");

        message.channel.send(`😂 ${user} ${text}`);
    }

    if (message.content.startsWith("!announce")) {
        const text = message.content.split(" ").slice(1).join(" ");
        const channel = message.guild.channels.cache.get(config.announcementChannel);

        if (!channel) return message.reply("Announcement channel not set");

        const embed = new EmbedBuilder()
            .setTitle("Announcement")
            .setDescription(text)
            .setColor("Blue");

        channel.send({ embeds: [embed] });
    }

    if (message.content === "!serverinfo") {
        const guild = message.guild;

        const embed = new EmbedBuilder()
            .setTitle("Server Info")
            .addFields(
                { name: "Name", value: guild.name },
                { name: "Members", value: `${guild.memberCount}` },
                { name: "Owner", value: `<@${guild.ownerId}>` }
            )
            .setColor("Purple");

        message.channel.send({ embeds: [embed] });
    }
});

client.login("YOUR_BOT_TOKEN_HERE");
