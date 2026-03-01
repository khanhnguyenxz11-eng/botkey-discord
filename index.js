require("dotenv").config();
const fs = require("fs");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  Events
} = require("discord.js");

/* ================= WEB SERVER ================= */

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

/* ================= DISCORD ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ================= DATA (LOAD 1 LẦN) ================= */

const DATA_FILE = "./data.json";

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    users: {},
    transactions: [],
    keys: { thang: [], tuan: [], ngay: [] }
  }));
}

let data = JSON.parse(fs.readFileSync(DATA_FILE));

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

/* ================= PANEL ================= */

async function sendPanel() {
  try {
    if (!process.env.PANEL_CHANNEL) return;

    const channel = await client.channels.fetch(process.env.PANEL_CHANNEL);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor("#00ff99")
      .setTitle("🛒 BUY KEY IPA AUTO")
      .addFields(
        { name: "Tháng (120K)", value: `${data.keys.thang.length}`, inline: true },
        { name: "Tuần (70K)", value: `${data.keys.tuan.length}`, inline: true },
        { name: "Ngày (15K)", value: `${data.keys.ngay.length}`, inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("nap").setLabel("💳 Nạp tiền").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("balance").setLabel("💰 Số dư").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("buy").setLabel("🛒 Mua Key").setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [row] });

  } catch {}
}

/* ================= READY ================= */

client.once(Events.ClientReady, () => {
  console.log("Bot Online");
  sendPanel();
});

/* ================= INTERACTION ================= */

client.on(Events.InteractionCreate, async interaction => {

  const userId = interaction.user.id;
  if (!data.users[userId]) data.users[userId] = { balance: 0 };

  /* ===== BUTTON ===== */

  if (interaction.isButton()) {

    if (interaction.customId === "balance") {
      return interaction.reply({
        content: `💰 Số dư: ${data.users[userId].balance}đ`,
        ephemeral: true
      });
    }

    if (interaction.customId === "nap") {
      return interaction.reply({
        content:
`💳 Nhập số tiền bạn muốn nạp bằng lệnh:

/nap 50000

Nội dung chuyển khoản: ID${userId}`,
        ephemeral: true
      });
    }

    if (interaction.customId === "buy") {
      const menu = new StringSelectMenuBuilder()
        .setCustomId("buy_select")
        .setPlaceholder("Chọn loại key")
        .addOptions([
          { label: "Key Tháng - 120000đ", value: "thang" },
          { label: "Key Tuần - 70000đ", value: "tuan" },
          { label: "Key Ngày - 15000đ", value: "ngay" }
        ]);

      return interaction.reply({
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }
  }

  /* ===== SELECT ===== */

  if (interaction.isStringSelectMenu()) {

    const prices = { thang: 120000, tuan: 70000, ngay: 15000 };
    const type = interaction.values[0];

    if (data.users[userId].balance < prices[type])
      return interaction.reply({ content: "❌ Không đủ tiền", ephemeral: true });

    if (data.keys[type].length === 0)
      return interaction.reply({ content: "❌ Hết key", ephemeral: true });

    const key = data.keys[type].shift();
    data.users[userId].balance -= prices[type];

    save();

    return interaction.reply({
      content: `✅ Key của bạn: ${key}`,
      ephemeral: true
    });
  }

});

/* ================= WEBHOOK ================= */

app.post("/webhook", (req, res) => {

  const body = req.body;
  if (!body?.description) return res.sendStatus(200);

  const match = body.description.match(/ID(\d+)/);
  if (!match) return res.sendStatus(200);

  const userId = match[1];
  const amount = parseInt(body.transferAmount);

  if (data.transactions.includes(body.transactionID))
    return res.sendStatus(200);

  data.transactions.push(body.transactionID);

  if (!data.users[userId]) data.users[userId] = { balance: 0 };
  data.users[userId].balance += amount;

  save();

  res.sendStatus(200);
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
