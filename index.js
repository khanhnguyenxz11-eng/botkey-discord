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

/* ================== SAFE MODE ================== */

process.on("uncaughtException", err => console.log("Error:", err));
process.on("unhandledRejection", err => console.log("Reject:", err));

/* ================== WEB ================== */

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("OK"));

app.listen(process.env.PORT || 3000);

/* ================== DISCORD ================== */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DATA_FILE = "./data.json";

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    users: {},
    transactions: [],
    keys: { thang: [], tuan: [], ngay: [] }
  }));
}

const loadData = () => JSON.parse(fs.readFileSync(DATA_FILE));
const saveData = data => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

/* ================== PANEL ================== */

async function sendPanel() {
  try {
    if (!process.env.PANEL_CHANNEL) return;

    const channel = await client.channels.fetch(process.env.PANEL_CHANNEL).catch(() => null);
    if (!channel) return;

    const data = loadData();

    const embed = new EmbedBuilder()
      .setColor("#00ff99")
      .setTitle("🛒 BUY KEY IPA AUTO")
      .addFields(
        { name: "Key Tháng", value: `${data.keys.thang.length} key`, inline: true },
        { name: "Key Tuần", value: `${data.keys.tuan.length} key`, inline: true },
        { name: "Key Ngày", value: `${data.keys.ngay.length} key`, inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("nap").setLabel("💳 Nạp tiền").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("balance").setLabel("💰 Số dư").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("buy").setLabel("🛒 Mua Key").setStyle(ButtonStyle.Secondary)
    );

    await channel.bulkDelete(5).catch(() => {});
    await channel.send({ embeds: [embed], components: [row] });

  } catch {}
}

/* ================== READY ================== */

client.once(Events.ClientReady, () => {
  console.log("Bot ready");
  sendPanel();
});

/* ================== INTERACTION ================== */

client.on(Events.InteractionCreate, async interaction => {
  try {

    const data = loadData();
    const userId = interaction.user.id;

    if (!data.users[userId]) data.users[userId] = { balance: 0 };

    /* BUTTON */

    if (interaction.isButton()) {

      if (interaction.customId === "balance")
        return interaction.reply({
          content: `💰 ${data.users[userId].balance}đ`,
          ephemeral: true
        });

      if (interaction.customId === "nap") {
        const modal = new ModalBuilder()
          .setCustomId("nap_modal")
          .setTitle("Nạp tiền");

        const input = new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Nhập số tiền (VNĐ)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.customId === "buy") {
        const menu = new StringSelectMenuBuilder()
          .setCustomId("buy_select")
          .setPlaceholder("Chọn key")
          .addOptions([
            { label: "Tháng - 120K", value: "thang" },
            { label: "Tuần - 70K", value: "tuan" },
            { label: "Ngày - 15K", value: "ngay" }
          ]);

        return interaction.reply({
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true
        });
      }
    }

    /* MODAL */

    if (interaction.isModalSubmit()) {

      const amount = parseInt(interaction.fields.getTextInputValue("amount"));

      if (!amount || amount < 1000)
        return interaction.reply({ content: "❌ Tiền không hợp lệ", ephemeral: true });

      const bank = process.env.BANK_NAME || "MBBANK";
      const acc = process.env.BANK_ACC || "0000000000";

      const qr = `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${amount}&addInfo=ID${userId}`;

      const embed = new EmbedBuilder()
        .setTitle("💳 Quét QR để thanh toán")
        .setDescription(`Số tiền: ${amount}đ\nNội dung: ID${userId}`)
        .setImage(qr);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    /* SELECT */

    if (interaction.isStringSelectMenu()) {

      const prices = { thang: 120000, tuan: 70000, ngay: 15000 };
      const type = interaction.values[0];

      if (data.users[userId].balance < prices[type])
        return interaction.reply({ content: "❌ Không đủ tiền", ephemeral: true });

      if (data.keys[type].length === 0)
        return interaction.reply({ content: "❌ Hết key", ephemeral: true });

      const key = data.keys[type].shift();
      data.users[userId].balance -= prices[type];

      saveData(data);

      return interaction.reply({
        content: `✅ Key: ${key}`,
        ephemeral: true
      });
    }

  } catch (err) {
    console.log("Interaction error:", err);
  }
});

/* ================== WEBHOOK ================== */

app.post("/webhook", (req, res) => {
  try {

    const body = req.body;
    if (!body?.description) return res.sendStatus(200);

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

    res.sendStatus(200);

  } catch {
    res.sendStatus(200);
  }
});

/* ================== LOGIN ================== */

client.login(process.env.TOKEN);
