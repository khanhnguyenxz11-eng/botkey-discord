require("dotenv").config();
const fs = require("fs");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const app = express();
app.use(express.json());

let balances = JSON.parse(fs.readFileSync("./balances.json"));
let keys = JSON.parse(fs.readFileSync("./keys.json"));

// ✅ THÊM BIẾN LƯU MÃ NẠP
let pendingDeposits = {};

const QR_IMAGE = "https://cdn.discordapp.com/attachments/1424762608694853809/1476458474824011898/IMG_1858.jpg";

function saveBalances() {
  fs.writeFileSync("./balances.json", JSON.stringify(balances, null, 2));
}

function saveKeys() {
  fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));
}

function createPanel() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("nap")
      .setLabel("💰 Nạp tiền")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("balance")
      .setLabel("💳 Số dư")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("buy_day")
      .setLabel(`📅 Ngày (15K)`)
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("buy_week")
      .setLabel(`📆 Tuần (70K)`)
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("buy_month")
      .setLabel(`🗓 Tháng (120K)`)
      .setStyle(ButtonStyle.Secondary)
  );
}

client.once("ready", async () => {
  console.log("Bot ready");
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  if (!balances[userId]) balances[userId] = 0;

  // ===============================
  // 💰 NẠP TIỀN (ĐÃ SỬA TỰ LẤY ID)
  // ===============================
  if (interaction.customId === "nap") {

    const depositCode =
      "NAP" +
      userId.slice(-5) +
      Math.floor(Math.random() * 100);

    pendingDeposits[depositCode] = userId;

    return interaction.reply({
      content:
        `🏦 Quét QR bên trên để nạp tiền\n\n` +
        `📌 Nội dung chuyển khoản:\n${depositCode}\n\n` +
        `⚠ Ghi đúng nội dung để được cộng tiền.`,
      ephemeral: true
    });
  }

  if (interaction.customId === "balance") {
    return interaction.reply({
      content: `💳 Số dư của bạn: ${balances[userId]} VNĐ`,
      ephemeral: true
    });
  }

  const prices = {
    buy_day: 15000,
    buy_week: 70000,
    buy_month: 120000
  };

  if (prices[interaction.customId]) {
    const type = interaction.customId.split("_")[1];

    if (balances[userId] < prices[interaction.customId]) {
      return interaction.reply({
        content: "❌ Không đủ tiền",
        ephemeral: true
      });
    }

    if (!keys[type] || keys[type].length === 0) {
      return interaction.reply({
        content: "❌ Hết key",
        ephemeral: true
      });
    }

    const key = keys[type].shift();
    balances[userId] -= prices[interaction.customId];

    saveBalances();
    saveKeys();

    return interaction.reply({
      content: `✅ Mua thành công\n🔑 Key: ${key}`,
      ephemeral: true
    });
  }
});

// ===============================
// 🔔 WEBHOOK SEPAY
// ===============================
app.post("/webhook", (req, res) => {
  try {

    console.log("Webhook:", req.body);

    const description =
      req.body.content ||
      req.body.description ||
      req.body.transferContent;

    const amount =
      req.body.transferAmount ||
      req.body.amount;

    if (!description || !amount)
      return res.sendStatus(200);

    const matchedCode = Object.keys(pendingDeposits)
      .find(code => description.includes(code));

    if (!matchedCode)
      return res.sendStatus(200);

    const userId = pendingDeposits[matchedCode];

    balances[userId] += Number(amount);

    delete pendingDeposits[matchedCode];

    saveBalances();

    console.log(`💰 +${amount} cho ${userId}`);

    res.sendStatus(200);

  } catch (err) {
    console.log("Webhook lỗi:", err);
    res.sendStatus(500);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});

client.login(process.env.TOKEN);
