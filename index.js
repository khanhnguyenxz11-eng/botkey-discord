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
  EmbedBuilder
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

const QR_IMAGE = "https://cdn.discordapp.com/attachments/1424762608694853809/1476463256519442452/IMG_1910.png?ex=69a1370f&is=699fe58f&hm=853e9d763f078b2b17867b5d2aa84bc75e213f1b2ff387bfffa7a5acf34089f3&";

function saveBalances() {
  fs.writeFileSync("./balances.json", JSON.stringify(balances, null, 2));
}

function saveKeys() {
  fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));
}

function createEmbed() {
  return new EmbedBuilder()
    .setTitle("🛒 ShopClone - Auto Buy")
    .setDescription(
      `🔥 **Danh mục đang bán**\n\n` +
      `📅 **Gói Ngày**\n` +
      `Kho còn: ${keys.day.length} key\n\n` +
      `📆 **Gói Tuần**\n` +
      `Kho còn: ${keys.week.length} key\n\n` +
      `🗓 **Gói Tháng**\n` +
      `Kho còn: ${keys.month.length} key\n\n` +
      `Vui lòng chọn danh mục bên dưới để tiếp tục`
    )
    .setImage(QR_IMAGE)
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

  return [row1, row2];
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
  // SELECT MUA
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
  // NẠP TIỀN
  // ======================
  if (interaction.isButton()) {

    if (interaction.customId === "nap") {

      const code =
        "NAP" +
        userId.slice(-5) +
        Math.floor(Math.random() * 100);

      pendingDeposits[code] = userId;

      return interaction.reply({
        content:
          `🏦 Quét QR bên trên để nạp\n\n` +
          `📌 Nội dung chuyển khoản:\n${code}\n\n` +
          `Sau khi chuyển tiền sẽ tự động cộng.`,
        ephemeral: true
      });
    }

    if (interaction.customId === "balance") {
      return interaction.reply({
        content: `💵 Số dư: ${balances[userId]} VNĐ`,
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
