client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  console.log("MSG:", message.content); // DEBUG

  if (!message.content.startsWith("?play")) return;

  console.log("VOICE:", message.member.voice.channel);
console.log("GUILD:", message.guild.id);

  const query = message.content.slice(5).trim();

  if (!query) return message.reply("Give a song name 🎧");

  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) return message.reply("Join VC first 🎧");

  try {
    const search = await play.search(query, { limit: 1 });
    if (!search.length) return message.reply("No song found ❌");

    const video = search[0];

    const streamData = await play.stream(video.url);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator
    });

    const player = createAudioPlayer();

    const resource = createAudioResource(streamData.stream, {
      inputType: streamData.type
    });

    connection.subscribe(player);
    player.play(resource);

    message.reply(`🎶 Now playing: **${video.title}**`);

  } catch (err) {
    console.log(err);
    message.reply("Music error ❌");
  }
});                 }
