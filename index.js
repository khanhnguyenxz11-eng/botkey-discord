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
  TextInputStyle
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const app = express();
app.use(express.json());

/* =======================
   LOAD DATA
======================= */

function load(file, def) {
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file))
    : def;
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let balances = load("./balances.json", {});
let keys = load("./keys.json", { day: [], week: [], month: [] });
let pending = load("./pending.json", {});
let transactions = load("./transactions.json", []);
let panelData = load("./panel.json", { messageId: null });

/* =======================
   PANEL
======================= */

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
  const select = new StringSelectMenuBuilder()
    .setCustomId("buy")
    .setPlaceholder("Chọn gói")
    .addOptions([
      { label: "Gói Ngày (15K)", value: "day" },
      { label: "Gói Tuần (70K)", value: "week" },
      { label: "Gói Tháng (120K)", value: "month" }
    ]);

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("nap")
        .setLabel("💰 Nạp tiền")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("balance")
        .setLabel("💵 Số dư")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

async function sendOrUpdatePanel() {
  const channel = await client.channels.fetch(process.env.CHANNEL_ID);

  try {
    if (!panelData.messageId) {
      const msg = await channel.send({
        embeds: [createEmbed()],
        components: createComponents()
      });
      panelData.messageId = msg.id;
      save("./panel.json", panelData);
    } else {
      const msg = await channel.messages.fetch(panelData.messageId);
      await msg.edit({
        embeds: [createEmbed()],
        components: createComponents()
      });
    }
  } catch {
    panelData.messageId = null;
    save("./panel.json", panelData);
  }
}

/* =======================
   READY
======================= */

client.once("ready", async () => {
  console.log("Bot ready");
  await sendOrUpdatePanel();
});

/* =======================
   INTERACTIONS
======================= */

client.on("interactionCreate", async interaction => {

  const userId = interaction.user.id;
  if (!balances[userId]) balances[userId] = 0;

  /* ===== MUA ===== */
  if (interaction.isStringSelectMenu()) {

    const prices = { day: 15000, week: 70000, month: 120000 };
    const type = interaction.values[0];

    if (balances[userId] < prices[type])
      return interaction.reply({ content: "❌ Không đủ tiền", ephemeral: true });

    if (keys[type].length === 0)
      return interaction.reply({ content: "❌ Hết key", ephemeral: true });

    const key = keys[type].shift();
    balances[userId] -= prices[type];

    transactions.push({
      type: "buy",
      userId,
      package: type,
      key,
      amount: prices[type],
      time: Date.now()
    });

    save("./balances.json", balances);
    save("./keys.json", keys);
    save("./transactions.json", transactions);

    await sendOrUpdatePanel();

    return interaction.reply({
      content: `✅ Mua thành công\n🔑 ${key}\n💵 Số dư còn: ${balances[userId]} VNĐ`,
      ephemeral: true
    });
  }

  /* ===== NẠP ===== */
  if (interaction.isButton() && interaction.customId === "nap") {

    if (Object.values(pending).find(p => p.userId === userId))
      return interaction.reply({
        content: "❌ Bạn đang có 1 giao dịch chờ xử lý",
        ephemeral: true
      });

    const modal = new ModalBuilder()
      .setCustomId("nap_modal")
      .setTitle("Nhập số tiền nạp");

    const input = new TextInputBuilder()
      .setCustomId("amount")
      .setLabel("Nhập số tiền (VNĐ)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isButton() && interaction.customId === "balance") {
    return interaction.reply({
      content: `💵 Số dư: ${balances[userId]} VNĐ`,
      ephemeral: true
    });
  }

  /* ===== SUBMIT MODAL ===== */
  if (interaction.isModalSubmit()) {

    const amount = Number(interaction.fields.getTextInputValue("amount"));
    if (isNaN(amount) || amount < 1000)
      return interaction.reply({ content: "❌ Số tiền không hợp lệ", ephemeral: true });

    const code = `NAP_${userId}_${Date.now()}`;

    pending[code] = {
      userId,
      amount,
      createdAt: Date.now()
    };

    save("./pending.json", pending);

    const qr =
      `https://qr.sepay.vn/img?bank=${process.env.BANK}` +
      `&acc=${process.env.ACC}` +
      `&amount=${amount}` +
      `&des=${code}`;

    return interaction.reply({
      content:
        `💳 Quét QR để nạp ${amount} VNĐ\n\n${qr}\n\n` +
        `📌 Nội dung: ${code}`,
      ephemeral: true
    });
  }
});

/* =======================
   WEBHOOK
======================= */

app.post("/webhook", async (req, res) => {

  if (req.headers["x-secret"] !== process.env.WEBHOOK_SECRET)
    return res.sendStatus(403);

  const desc = req.body.transferContent;
  const amount = Number(req.body.transferAmount);

  if (!desc || !amount) return res.sendStatus(200);

  const code = Object.keys(pending).find(c => desc.includes(c));
  if (!code) return res.sendStatus(200);

  const data = pending[code];
  if (data.amount !== amount) return res.sendStatus(200);

  balances[data.userId] += amount;

  transactions.push({
    type: "deposit",
    userId: data.userId,
    amount,
    time: Date.now()
  });

  delete pending[code];

  save("./balances.json", balances);
  save("./pending.json", pending);
  save("./transactions.json", transactions);

  try {
    const user = await client.users.fetch(data.userId);
    await user.send(
      `✅ Nạp thành công +${amount} VNĐ\n💵 Số dư hiện tại: ${balances[data.userId]} VNĐ`
    );
  } catch {}

  res.sendStatus(200);
});

/* =======================
   CLEAN PENDING 15P
======================= */

setInterval(() => {
  const now = Date.now();
  for (const code in pending) {
    if (now - pending[code].createdAt > 15 * 60 * 1000)
      delete pending[code];
  }
  save("./pending.json", pending);
}, 10 * 60 * 1000);

app.listen(process.env.PORT || 3000);
client.login(process.env.TOKEN);
