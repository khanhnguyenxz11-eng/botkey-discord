require("dotenv").config();
const fs = require("fs");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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
let panelMessage = null;

const QR_IMAGE = "https://cdn.discordapp.com/attachments/1424762608694853809/1476463256519442452/IMG_1910.png?ex=69a1370f&is=699fe58f&hm=853e9d763f078b2b17867b5d2aa84bc75e213f1b2ff387bfffa7a5acf34089f3&";

function saveBalances() {
  fs.writeFileSync("./balances.json", JSON.stringify(balances, null, 2));
}

function saveKeys() {
  fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));
}

function createUserPanel() {
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
      .setLabel(`📅 Ngày (15K) [${keys.day.length}]`)
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("buy_week")
      .setLabel(`📆 Tuần (70K) [${keys.week.length}]`)
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("buy_month")
      .setLabel(`🗓 Tháng (120K) [${keys.month.length}]`)
      .setStyle(ButtonStyle.Secondary)
  );
}

function createAdminPanel() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("add_day")
      .setLabel("➕ Add Day")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("add_week")
      .setLabel("➕ Add Week")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("add_month")
      .setLabel("➕ Add Month")
      .setStyle(ButtonStyle.Danger)
  );
}

async function sendOrUpdatePanel() {
  const channel = await client.channels.fetch(process.env.CHANNEL_ID);
  if (!channel) return;

  if (!panelMessage) {
    panelMessage = await channel.send({
      content: "🎯 PANEL MUA KEY IPA",
      files: [QR_IMAGE],
      components: [
        createUserPanel(),
        createAdminPanel()
      ]
    });
  } else {
    await panelMessage.edit({
      content: "🎯 PANEL MUA KEY IPA",
      components: [
        createUserPanel(),
        createAdminPanel()
      ]
    });
  }
}

client.once("ready", async () => {
  console.log("Bot ready");
  await sendOrUpdatePanel();
});

client.on("interactionCreate", async interaction => {

  if (interaction.isButton()) {

    const userId = interaction.user.id;
    if (!balances[userId]) balances[userId] = 0;

    // ====================
    // NẠP TIỀN
    // ====================
    if (interaction.customId === "nap") {

      const code =
        "NAP" +
        userId.slice(-5) +
        Math.floor(Math.random() * 100);

      pendingDeposits[code] = userId;

      return interaction.reply({
        content:
          `🏦 Quét QR để nạp tiền\n\n` +
          `📌 Nội dung chuyển khoản:\n${code}\n\n` +
          `⚠ Ghi đúng nội dung để được cộng tiền.`,
        ephemeral: true
      });
    }

    if (interaction.customId === "balance") {
      return interaction.reply({
        content: `💳 Số dư: ${balances[userId]} VNĐ`,
        ephemeral: true
      });
    }

    // ====================
    // MUA KEY
    // ====================
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

      if (keys[type].length === 0) {
        return interaction.reply({
          content: "❌ Hết key",
          ephemeral: true
        });
      }

      const key = keys[type].shift();
      balances[userId] -= prices[interaction.customId];

      saveBalances();
      saveKeys();
      await sendOrUpdatePanel();

      return interaction.reply({
        content: `✅ Mua thành công\n🔑 ${key}`,
        ephemeral: true
      });
    }

    // ====================
    // ADMIN ADD KEY
    // ====================
    if (interaction.user.id !== process.env.ADMIN_ID)
      return interaction.reply({ content: "Không có quyền", ephemeral: true });

    if (interaction.customId.startsWith("add_")) {

      const type = interaction.customId.split("_")[1];

      const modal = new ModalBuilder()
        .setCustomId(`modal_${type}`)
        .setTitle("Nhập Key");

      const input = new TextInputBuilder()
        .setCustomId("key_input")
        .setLabel("Nhập key cần thêm")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(input)
      );

      return interaction.showModal(modal);
    }
  }

  // ====================
  // XỬ LÝ MODAL ADD KEY
  // ====================
  if (interaction.isModalSubmit()) {

    if (interaction.user.id !== process.env.ADMIN_ID)
      return interaction.reply({ content: "Không có quyền", ephemeral: true });

    const type = interaction.customId.split("_")[1];
    const key = interaction.fields.getTextInputValue("key_input");

    keys[type].push(key);
    saveKeys();
    await sendOrUpdatePanel();

    return interaction.reply({
      content: "✅ Đã thêm key",
      ephemeral: true
    });
  }
});

// ====================
// WEBHOOK SEPAY
// ====================
app.post("/webhook", (req, res) => {

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

  console.log(`+${amount} cho ${userId}`);

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000);
client.login(process.env.TOKEN);
