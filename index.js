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
    .setTitle("🛒 ShopIPA Key - Auto Buy")
    .setDescription(
      `🔥 **Danh Sách Key IPA QK**\n\n` +
      `📅 **Key Ngày (15K)**\n` +
      `Kho còn: ${keys.day.length} key\n\n` +
      `📆 **Key Tuần (70K)**\n` +
      `Kho còn: ${keys.week.length} key\n\n` +
      `🗓 **Key Tháng (120K)**\n` +
      `Kho còn: ${keys.month.length} key\n\n` +
      `Chọn danh mục bên dưới để mua`
    )
    .setColor("#5865F2");
}

function createComponents() {

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("select_buy")
    .setPlaceholder("📌 Chọn danh mục...")
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
      .setLabel("➕ Add Key Ngày")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("add_week")
      .setLabel("➕ Add Key Tuần")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("add_month")
      .setLabel("➕ Add Key Tháng")
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

  // ======================
  // MUA KEY
  // ======================
  if (interaction.isStringSelectMenu()) {

    const type = interaction.values[0];

    const prices = {
      day: 15000,
      week: 70000,
      month: 120000
    };

    if (balances[userId] < prices[type])
      return interaction.reply({
        content: "❌ Không đủ tiền",
        ephemeral: true
      });

    if (keys[type].length === 0)
      return interaction.reply({
        content: "❌ Hết key",
        ephemeral: true
      });

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

  // ======================
  // BUTTON
  // ======================
  if (interaction.isButton()) {

    // ===== NẠP =====
    if (interaction.customId === "nap") {

      const amount = 20000; // tiền mặc định
      const code = `NAP_${userId}_${Date.now()}`;

      pendingDeposits[code] = userId;

      const qrLink =
        `https://qr.sepay.vn/img?bank=${process.env.BANK}` +
        `&acc=${process.env.ACC}` +
        `&amount=${amount}` +
        `&des=${code}`;

      return interaction.reply({
        content:
          `💳 Quét QR để nạp ${amount} VNĐ\n\n` +
          `${qrLink}\n\n` +
          `📌 Nội dung: ${code}`,
        ephemeral: true
      });
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

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return interaction.reply({
          content: "❌ Bạn không phải admin",
          ephemeral: true
        });

      const type = interaction.customId.split("_")[1];

      const newKey = "KEY-" + Date.now();
      keys[type].push(newKey);

      saveKeys();
      await sendOrUpdatePanel();

      return interaction.reply({
        content: `✅ Đã thêm 1 key ${type}`,
        ephemeral: true
      });
    }
  }
});

// ======================
// WEBHOOK SEPAY
// ======================
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
