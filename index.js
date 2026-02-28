require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const app = express();
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Web server running on port " + PORT);
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

client.on("messageCreate", async message => {
  if (message.author.bot) return;

  if (message.content === "!panel") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("nap_tien")
        .setLabel("Nạp Tiền")
        .setStyle(ButtonStyle.Success)
    );

    const embed = new EmbedBuilder()
      .setTitle("Hệ thống nạp tiền")
      .setDescription("Nhấn nút bên dưới để nạp tiền");

    message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "nap_tien") {
    await interaction.reply({
      content: "Vui lòng nhập số tiền bạn muốn nạp.",
      ephemeral: true
    });
  }
});

client.login(process.env.TOKEN);
