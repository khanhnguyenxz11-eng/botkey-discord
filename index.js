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

// ================= WEB SERVER (BẮT BUỘC CHO RAILWAY) =================

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

// Webhook nhận tiền từ bank (sau này bạn dán webhook ở SePay)
app.post("/webhook", (req, res) => {
  console.log("Webhook data:", req.body);

  // TODO: xử lý cộng tiền ở đây

  res.status(200).send("OK");
});

// Railway bắt buộc phải dùng PORT của nó
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Web server running on port " + PORT);
});

// ================= DISCORD BOT =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Khi bot được mention hoặc gõ lệnh
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "nap_tien") {
    await interaction.reply({
      content: "Nhập số tiền bạn muốn nạp:",
      ephemeral: true
    });
  }
});

client.on("messageCreate", async message => {
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

client.login(process.env.TOKEN);
