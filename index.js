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
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

/* ================== ANTI CRASH ================== */

process.on("uncaughtException", err => console.error("Uncaught:", err));
process.on("unhandledRejection", err => console.error("Unhandled:", err));

/* ================== WEB SERVER ================== */

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("Bot is alive"));

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running");
});

/* ================== DISCORD ================== */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DATA_FILE = "./data.json";
let panelMessage = null;

/* ================== DATA ================== */

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    users: {},
    transactions: [],
    keys: { thang: [], tuan: [], ngay: [] }
  }));
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch {
    return { users: {}, transactions: [], keys: { thang: [], tuan: [], ngay: [] } };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ================== PANEL ================== */

async function sendPanel() {
  if (!process.env.PANEL_CHANNEL) return;

  const channel = await client.channels.fetch(process.env.PANEL_CHANNEL).catch(() => null);
  if (!channel) return;

  const data = loadData();

  const embed = new EmbedBuilder()
    .setColor("#00ff99")
    .setTitle("🛒 BUY KEY IPA AUTO")
    .addFields(
      { name: "📦 Key Tháng (120K)", value: `Kho: ${data.keys.thang.length}`, inline: true },
      { name: "📦 Key Tuần (70K)", value: `Kho: ${data.keys.tuan.length}`, inline: true },
      { name: "📦 Key Ngày (15K)", value: `Kho: ${data.keys.ngay.length}`, inline: true }
    )
    .setFooter({ text: "Bot tự động - IB admin nếu lỗi" });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("nap").setLabel("💳 Nạp tiền").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("balance").setLabel("💰 Số dư").setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("buy").setLabel("🛒 Mua Key").setStyle(ButtonStyle.Secondary)
  );

  if (!panelMessage) {
    panelMessage = await channel.send({ embeds: [embed], components: [row1, row2] });
  } else {
    await panelMessage.edit({ embeds: [embed], components: [row1, row2] });
  }
}

/* ================== READY ================== */

client.once(Events.ClientReady, () => {
  console.log("Bot online:", client.user.tag);
  sendPanel();
});

/* ================== INTERACTION ================== */

client.on(Events.InteractionCreate, async interaction => {
  try {
    const data = loadData();
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
        const modal = new ModalBuilder()
          .setCustomId("nap_modal")
          .setTitle("Nạp tiền");

        const amountInput = new TextInputBuilder()
          .setCustomId("amount_input")
          .setLabel("Nhập số tiền (VNĐ)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(amountInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      if (interaction.customId === "buy") {
        const menu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("buy_menu")
            .setPlaceholder("Chọn loại key")
            .addOptions([
              { label: "Key Tháng - 120000đ", value: "thang" },
              { label: "Key Tuần - 70000đ", value: "tuan" },
              { label: "Key Ngày - 15000đ", value: "ngay" }
            ])
        );

        return interaction.reply({
          content: "🛒 Chọn sản phẩm:",
          components: [menu],
          ephemeral: true
        });
      }
    }

    /* ===== MODAL ===== */

    if (interaction.isModalSubmit()) {

      if (interaction.customId === "nap_modal") {

        const amount = parseInt(interaction.fields.getTextInputValue("amount_input"));

        if (isNaN(amount) || amount < 1000)
          return interaction.reply({ content: "❌ Số tiền không hợp lệ", ephemeral: true });

        const bank = process.env.BANK_NAME;
        const acc = process.env.BANK_ACC;

        const qrUrl =
          `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${amount}&addInfo=ID${userId}`;

        const embed = new EmbedBuilder()
          .setColor("#00ff99")
          .setTitle("💳 Quét QR để thanh toán")
          .setDescription(
            `💰 Số tiền: ${amount}đ\n` +
            `📌 Nội dung bắt buộc: ID${userId}`
          )
          .setImage(qrUrl);

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    /* ===== MUA KEY ===== */

    if (interaction.isStringSelectMenu()) {

      const type = interaction.values[0];
      const prices = { thang: 120000, tuan: 70000, ngay: 15000 };
      const price = prices[type];

      if (data.users[userId].balance < price)
        return interaction.reply({ content: "❌ Không đủ tiền", ephemeral: true });

      if (data.keys[type].length === 0)
        return interaction.reply({ content: "❌ Hết key", ephemeral: true });

      const key = data.keys[type].shift();
      data.users[userId].balance -= price;

      saveData(data);

      await interaction.reply({
        content: `✅ Thành công!\n🔑 Key: ${key}`,
        ephemeral: true
      });

      sendPanel();
    }

  } catch (err) {
    console.error("Interaction error:", err);
  }
});

/* ================== WEBHOOK ================== */

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (!body.description) return res.sendStatus(200);

    const match = body.description.match(/ID(\d+)/);
    if (!match) return res.sendStatus(200);

    const userId = match[1];
    const amount = parseInt(body.transferAmount);

    const data = loadData();

    if (data.transactions.includes(body.transactionID))
      return res.sendStatus(200);

    data.transactions.push(body.transactionID);

    if (!data.users[userId]) data.users[userId] = { balance: 0 };
    data.users[userId].balance += amount;

    saveData(data);

    if (process.env.SUCCESS_CHANNEL) {
      const channel = await client.channels.fetch(process.env.SUCCESS_CHANNEL).catch(() => null);
      if (channel)
        channel.send(`💰 <@${userId}> đã nạp ${amount}đ`);
    }

    sendPanel();
    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

/* ================== LOGIN ================== */

if (!process.env.TOKEN) {
  console.error("TOKEN chưa cấu hình!");
} else {
  client.login(process.env.TOKEN).catch(console.error);
}
