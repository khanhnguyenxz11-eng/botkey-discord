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
  Events
} = require("discord.js");

/* ================= WEB SERVER ================= */

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running");
});

/* ================= DISCORD ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DATA_FILE = "./data.json";

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      users: {},
      transactions: [],
      keys: { thang: [], tuan: [], ngay: [] }
    })
  );
}

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ================= PANEL ================= */

async function sendPanel() {
  const channel = await client.channels.fetch(process.env.PANEL_CHANNEL);
  if (!channel) return;

  const data = loadData();

  const content =
`🎮 **PANEL MUA KEY**

🔑 Tháng còn: ${data.keys.thang.length}
🔑 Tuần còn: ${data.keys.tuan.length}
🔑 Ngày còn: ${data.keys.ngay.length}
`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("nap")
      .setLabel("💳 Nạp tiền")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("balance")
      .setLabel("💰 Số dư")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("select_product")
      .setLabel("🛒 Chọn sản phẩm")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.messages.fetch({ limit: 10 }).then(msgs => {
    msgs.forEach(m => m.delete().catch(() => {}));
  });

  channel.send({ content, components: [row] });
}

/* ================= READY ================= */

client.once(Events.ClientReady, async () => {
  console.log(`Bot online: ${client.user.tag}`);
  sendPanel();
});

/* ================= INTERACTION ================= */

client.on(Events.InteractionCreate, async interaction => {

  const data = loadData();
  const userId = interaction.user.id;

  if (!data.users[userId]) {
    data.users[userId] = { balance: 0 };
  }

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
`💳 Chuyển khoản đúng nội dung:

ID${userId}

Ngân hàng: ${process.env.BANK_NAME}
STK: ${process.env.BANK_ACC}`,
        ephemeral: true
      });
    }

    if (interaction.customId === "select_product") {

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("buy_menu")
          .setPlaceholder("Chọn sản phẩm muốn mua")
          .addOptions([
            {
              label: "Key Tháng - 120000đ",
              value: "thang"
            },
            {
              label: "Key Tuần - 70000đ",
              value: "tuan"
            },
            {
              label: "Key Ngày - 15000đ",
              value: "ngay"
            }
          ])
      );

      return interaction.reply({
        content: "🛒 Chọn loại key:",
        components: [menu],
        ephemeral: true
      });
    }
  }

  /* ===== SELECT MENU ===== */
  if (interaction.isStringSelectMenu()) {

    const type = interaction.values[0];

    const prices = {
      thang: 120000,
      tuan: 70000,
      ngay: 15000
    };

    const price = prices[type];

    if (data.users[userId].balance < price) {
      return interaction.reply({
        content: "❌ Không đủ số dư!",
        ephemeral: true
      });
    }

    if (data.keys[type].length === 0) {
      return interaction.reply({
        content: "❌ Hết key!",
        ephemeral: true
      });
    }

    const key = data.keys[type].shift();
    data.users[userId].balance -= price;
    saveData(data);

    await interaction.reply({
      content: `✅ Mua thành công!\n🔑 Key: ${key}`,
      ephemeral: true
    });

    sendPanel();
  }
});

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (!body.description) return res.sendStatus(200);

  const match = body.description.match(/ID(\d+)/);
  if (!match) return res.sendStatus(200);

  const userId = match[1];
  const amount = parseInt(body.transferAmount);

  const data = loadData();

  if (data.transactions.includes(body.transactionID)) {
    return res.sendStatus(200);
  }

  data.transactions.push(body.transactionID);

  if (!data.users[userId]) {
    data.users[userId] = { balance: 0 };
  }

  data.users[userId].balance += amount;
  saveData(data);

  const channel = await client.channels.fetch(process.env.SUCCESS_CHANNEL);
  channel.send(`💰 <@${userId}> đã nạp thành công ${amount}đ`);

  sendPanel();

  res.sendStatus(200);
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
