require("dotenv").config();
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const app = express();
app.use(express.json());

// ================= WEB SERVER (CHO RAILWAY) =================

// Route chính
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

// Webhook test (sau này dùng cho bank)
app.post("/webhook", (req, res) => {
  console.log("Webhook received:", req.body);
  res.status(200).send("OK");
});

// Bắt buộc Railway dùng PORT này
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Web server running on port " + PORT);
});

// ================= DISCORD BOT =================

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

// Lệnh !panel
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!panel") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("nap_tien")
        .setLabel("Nạp Tiền")
        .setStyle(ButtonStyle.Success)
    );

    const embed = new EmbedBuilder()
      .setTitle("💳 Hệ thống nạp tiền")
      .setDescription("Nhấn nút bên dưới để nạp tiền")
      .setColor(0x00AE86);

    await message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }
});

// Xử lý button
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "nap_tien") {
    await interaction.reply({
      content: "Vui lòng nhập số tiền bạn muốn nạp.",
      ephemeral: true
    });
  }
});

// ================= CHỐNG CRASH =================

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// ================= LOGIN =================

if (!process.env.TOKEN) {
  console.log("❌ TOKEN chưa được thêm vào Railway Variables");
} else {
  client.login(process.env.TOKEN).catch(err => {
    console.error("Login error:", err);
  });
}
