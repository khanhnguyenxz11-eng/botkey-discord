require("dotenv").config();
const fs = require("fs");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

/* ================= WEB SERVER ================= */

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("Bot running"));

app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Web server running");
});

/* ================= DATA ================= */

function loadData() {
  if (!fs.existsSync("data.json")) {
    fs.writeFileSync("data.json", JSON.stringify({
      users: {},
      transactions: [],
      keys: { thang: [], tuan: [], ngay: [] }
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync("data.json"));
}

function saveData(data) {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

/* ================= DISCORD BOT ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ================= PANEL FUNCTION ================= */

async function sendPanel() {
  try {
    const channel = await client.channels.fetch(process.env.PANEL_CHANNEL);
    if (!channel) return;

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("nap").setLabel("💳 Nạp tiền").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("balance").setLabel("💰 Số dư").setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("buy_thang").setLabel("Key Tháng 120k").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("buy_tuan").setLabel("Key Tuần 70k").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("buy_ngay").setLabel("Key Ngày 15k").setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder();
    if (process.env.ADMIN_ID) {
      row3.addComponents(
        new ButtonBuilder().setCustomId("add_key").setLabel("➕ Add Key").setStyle(ButtonStyle.Danger)
      );
    }

    const embed = new EmbedBuilder()
      .setTitle("SHOP KEY PANEL")
      .setDescription("Chọn chức năng bên dưới")
      .setColor(0x00AE86)
      .setTimestamp();

    await channel.bulkDelete(5).catch(()=>{});
    await channel.send({ embeds: [embed], components: [row1, row2, row3] });

  } catch (err) {
    console.error("Panel error:", err);
  }
}

/* ================= READY ================= */

client.once("clientReady", async () => {
  console.log("Bot online:", client.user.tag);
  sendPanel();
});

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {
  try {
    if (req.headers.authorization !== process.env.SEPAY_SECRET)
      return res.sendStatus(403);

    const { amount, content, transaction_id } = req.body;

    if (!content || !content.startsWith("NAP_"))
      return res.sendStatus(200);

    const data = loadData();

    if (data.transactions.includes(transaction_id))
      return res.sendStatus(200);

    const userId = content.replace("NAP_", "");

    if (!data.users[userId])
      data.users[userId] = { balance: 0 };

    data.users[userId].balance += parseInt(amount);
    data.transactions.push(transaction_id);

    saveData(data);

    const channel = await client.channels.fetch(process.env.SUCCESS_CHANNEL);

    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle("💳 NẠP TIỀN THÀNH CÔNG")
        .setDescription(`👤 Người nạp: <@${userId}>\n💰 Số tiền: ${amount}đ`)
        .setColor(0x00ff99)
        .setTimestamp();

      await channel.send({
        content: `<@${userId}>`,
        embeds: [embed],
        allowedMentions: { users: [userId] }
      });
    }

    const user = await client.users.fetch(userId);
    user?.send(`✅ Bạn đã nạp thành công ${amount}đ`);

    await sendPanel(); // 🔥 RELOAD PANEL

    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction => {

  const data = loadData();
  const prices = { thang: 120000, tuan: 70000, ngay: 15000 };

  if (interaction.isButton()) {

    if (interaction.customId === "nap") {
      const modal = new ModalBuilder()
        .setCustomId("modal_nap")
        .setTitle("Nhập số tiền");

      const input = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Nhập số tiền muốn nạp")
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "balance") {
      const bal = data.users[interaction.user.id]?.balance || 0;
      return interaction.reply({ content: `💰 Số dư: ${bal}đ`, ephemeral: true });
    }

    if (interaction.customId.startsWith("buy_")) {

      const type = interaction.customId.replace("buy_", "");
      const price = prices[type];

      if (!data.users[interaction.user.id])
        data.users[interaction.user.id] = { balance: 0 };

      if (data.users[interaction.user.id].balance < price)
        return interaction.reply({ content: "Không đủ tiền", ephemeral: true });

      if (data.keys[type].length === 0)
        return interaction.reply({ content: "Hết key", ephemeral: true });

      const key = data.keys[type].shift();
      data.users[interaction.user.id].balance -= price;

      saveData(data);

      await interaction.user.send(`🔑 Key của bạn: ${key}`);
      await interaction.reply({ content: "✅ Mua thành công. Check DM", ephemeral: true });

      await sendPanel(); // 🔥 RELOAD

    }

    if (interaction.customId === "add_key") {

      if (interaction.user.id !== process.env.ADMIN_ID)
        return interaction.reply({ content: "Không phải admin", ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId("modal_addkey")
        .setTitle("Thêm key");

      const typeInput = new TextInputBuilder()
        .setCustomId("type")
        .setLabel("Loại (thang/tuan/ngay)")
        .setStyle(TextInputStyle.Short);

      const keyInput = new TextInputBuilder()
        .setCustomId("key")
        .setLabel("Nhập key")
        .setStyle(TextInputStyle.Paragraph);

      modal.addComponents(
        new ActionRowBuilder().addComponents(typeInput),
        new ActionRowBuilder().addComponents(keyInput)
      );

      return interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit()) {

    if (interaction.customId === "modal_nap") {

      const amount = interaction.fields.getTextInputValue("amount");
      const code = `NAP_${interaction.user.id}`;

      const qr = `https://qr.sepay.vn/img?acc=${process.env.BANK_ACC}&bank=${process.env.BANK_NAME}&amount=${amount}&des=${code}`;

      return interaction.reply({
        content: `Chuyển khoản nội dung:\n${code}\nQR:\n${qr}`,
        ephemeral: true
      });
    }

    if (interaction.customId === "modal_addkey") {

      const type = interaction.fields.getTextInputValue("type");
      const key = interaction.fields.getTextInputValue("key");

      if (!data.keys[type])
        return interaction.reply({ content: "Sai loại", ephemeral: true });

      data.keys[type].push(key);
      saveData(data);

      await interaction.reply({ content: "✅ Đã thêm key", ephemeral: true });
      await sendPanel(); // 🔥 RELOAD
    }
  }
});

/* ================= ANTI CRASH ================= */

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(process.env.TOKEN);
