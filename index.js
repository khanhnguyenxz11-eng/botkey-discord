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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const app = express();
app.use(express.json());

let balances = fs.existsSync("./balances.json")
  ? JSON.parse(fs.readFileSync("./balances.json"))
  : {};

let keys = fs.existsSync("./keys.json")
  ? JSON.parse(fs.readFileSync("./keys.json"))
  : { day: [], week: [], month: [] };

let pendingDeposits = {};
let panelMessage;

function saveBalances() {
  fs.writeFileSync("./balances.json", JSON.stringify(balances, null, 2));
}

function saveKeys() {
  fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));
}

function createEmbed() {
  return new EmbedBuilder()
    .setTitle("🛒 IPA Shop")
    .setDescription(
      `📅 Gói Ngày (15K)\nKho: ${keys.day.length}\n\n` +
      `📆 Gói Tuần (70K)\nKho: ${keys.week.length}\n\n` +
      `🗓 Gói Tháng (120K)\nKho: ${keys.month.length}`
    )
    .setColor("#5865F2");
}

function createComponents() {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("select_buy")
    .setPlaceholder("Chọn gói cần mua")
    .addOptions([
      { label: "Gói Ngày (15K)", value: "day" },
      { label: "Gói Tuần (70K)", value: "week" },
      { label: "Gói Tháng (120K)", value: "month" }
    ]);

  const row1 = new ActionRowBuilder().addComponents(selectMenu);

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("nap")
      .setLabel("💰 Nạp tiền")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("balance")
      .setLabel("💵 Số dư")
      .setStyle(ButtonStyle.Primary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("add_day")
      .setLabel("➕ Add Day")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("add_week")
      .setLabel("➕ Add Week")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("add_month")
      .setLabel("➕ Add Month")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3];
}

async function sendOrUpdatePanel() {
  const channel = await client.channels.fetch(process.env.CHANNEL_ID);

  if (!panelMessage) {
    panelMessage = await channel.send({
      embeds: [createEmbed()],
      components: createComponents()
    });
  } else {
    await panelMessage.edit({
      embeds: [createEmbed()],
      components: createComponents()
    });
  }
}

client.once("ready", async () => {
  console.log("Bot ready");
  await sendOrUpdatePanel();
});

client.on("interactionCreate", async interaction => {

  const userId = interaction.user.id;
  if (!balances[userId]) balances[userId] = 0;

  // ====================
  // MUA KEY
  // ====================
  if (interaction.isStringSelectMenu()) {
    const type = interaction.values[0];
    const prices = { day: 15000, week: 70000, month: 120000 };

    if (balances[userId] < prices[type])
      return interaction.reply({ content: "❌ Không đủ tiền", ephemeral: true });

    if (keys[type].length === 0)
      return interaction.reply({ content: "❌ Hết key", ephemeral: true });

    const key = keys[type].shift();
    balances[userId] -= prices[type];

    saveBalances();
    saveKeys();
    await sendOrUpdatePanel();

    return interaction.reply({
      content: `✅ Mua thành công\n🔑 ${key}`,
      ephemeral: true
    });
  }

  // ====================
  // BUTTON
  // ====================
  if (interaction.isButton()) {

    // ===== MỞ FORM NẠP =====
    if (interaction.customId === "nap") {

      const modal = new ModalBuilder()
        .setCustomId("nap_modal")
        .setTitle("Nhập số tiền muốn nạp");

      const amountInput = new TextInputBuilder()
        .setCustomId("amount_input")
        .setLabel("Nhập số tiền (VNĐ)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(amountInput);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }

    // ===== XEM SỐ DƯ =====
    if (interaction.customId === "balance") {
      return interaction.reply({
        content: `💵 Số dư: ${balances[userId]} VNĐ`,
        ephemeral: true
      });
    }

    // ===== ADD KEY ADMIN =====
    if (interaction.customId.startsWith("add_")) {

      const adminList = process.env.ADMIN_IDS.split(",");
      if (!adminList.includes(userId))
        return interaction.reply({
          content: "❌ Không phải admin",
          ephemeral: true
        });

      const type = interaction.customId.split("_")[1];
      const newKey = "KEY-" + Date.now();

      keys[type].push(newKey);
      saveKeys();
      await sendOrUpdatePanel();

      return interaction.reply({
        content: "✅ Đã thêm key",
        ephemeral: true
      });
    }
  }

  // ====================
  // SUBMIT MODAL
  // ====================
  if (interaction.isModalSubmit()) {

    if (interaction.customId === "nap_modal") {

      const amount = interaction.fields.getTextInputValue("amount_input");

      if (isNaN(amount) || Number(amount) < 1000)
        return interaction.reply({
          content: "❌ Số tiền không hợp lệ",
          ephemeral: true
        });

      const code = `NAP_${userId}_${Date.now()}`;
      pendingDeposits[code] = userId;

      const qrLink =
        `https://qr.sepay.vn/img?bank=${process.env.BANK}` +
        `&acc=${process.env.ACC}` +
        `&amount=${amount}` +
        `&des=${code}`;

      return interaction.reply({
        content:
          `💳 Quét QR để nạp ${amount} VNĐ\n\n${qrLink}\n\n` +
          `📌 Nội dung: ${code}`,
        ephemeral: true
      });
    }
  }
});

// ====================
// WEBHOOK
// ====================
app.post("/webhook", async (req, res) => {

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

  try {
    const user = await client.users.fetch(userId);
    await user.send(`✅ Nạp thành công +${amount} VNĐ`);
  } catch {}

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000);
client.login(process.env.TOKEN);
