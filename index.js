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
  MessageFlags
} = require("discord.js");

/* ================= INIT ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const app = express();
app.use(express.json({ limit: "10mb" }));

/* ================= SAFE LOAD ================= */

function load(file, def) {
  try {
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : def;
  } catch {
    return def;
  }
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let balances = load("./balances.json", {});
let pending = load("./pending.json", {});
let processed = load("./processed.json", []);
let keys = load("./keys.json", { day: [], week: [], month: [] });
let panel = load("./panel.json", { messageId: null });

/* ================= PANEL ================= */

function createEmbed() {
  return new EmbedBuilder()
    .setTitle("🛒 IPA SHOP")
    .setDescription(
      `📅 Ngày (15K): ${keys.day.length}\n` +
      `📆 Tuần (70K): ${keys.week.length}\n` +
      `🗓 Tháng (120K): ${keys.month.length}`
    )
    .setColor("#5865F2");
}

function createComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("buy")
        .setPlaceholder("Chọn gói")
        .addOptions([
          { label: "Ngày (15K)", value: "day" },
          { label: "Tuần (70K)", value: "week" },
          { label: "Tháng (120K)", value: "month" }
        ])
    ),
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

async function updatePanel() {
  const channel = await client.channels.fetch(process.env.CHANNEL_ID);

  try {
    if (!panel.messageId) {
      const msg = await channel.send({
        embeds: [createEmbed()],
        components: createComponents()
      });
      panel.messageId = msg.id;
      save("./panel.json", panel);
    } else {
      const msg = await channel.messages.fetch(panel.messageId);
      await msg.edit({
        embeds: [createEmbed()],
        components: createComponents()
      });
    }
  } catch {
    panel.messageId = null;
    save("./panel.json", panel);
  }
}

/* ================= READY ================= */

client.once("clientReady", async () => {
  console.log(`BOT READY: ${client.user.tag}`);
  await updatePanel();
});

/* ================= INTERACTION ================= */

client.on("interactionCreate", async (i) => {

  const userId = i.user.id;
  if (!balances[userId]) balances[userId] = 0;

  /* ===== BUY ===== */
  if (i.isStringSelectMenu()) {

    const price = { day: 15000, week: 70000, month: 120000 };
    const type = i.values[0];

    if (balances[userId] < price[type])
      return i.reply({
        content: "❌ Không đủ tiền",
        flags: MessageFlags.Ephemeral
      });

    if (!keys[type].length)
      return i.reply({
        content: "❌ Hết key",
        flags: MessageFlags.Ephemeral
      });

    const key = keys[type].shift();
    balances[userId] -= price[type];

    save("./balances.json", balances);
    save("./keys.json", keys);

    await updatePanel();

    return i.reply({
      content:
        `✅ Thành công\n🔑 ${key}\n💵 Còn: ${balances[userId]} VNĐ`,
      flags: MessageFlags.Ephemeral
    });
  }

  /* ===== BUTTON ===== */
  if (i.isButton()) {

    if (i.customId === "balance")
      return i.reply({
        content: `💵 Số dư: ${balances[userId]} VNĐ`,
        flags: MessageFlags.Ephemeral
      });

    if (i.customId === "nap") {

      if (Object.values(pending).some(p => p.userId === userId))
        return i.reply({
          content: "❌ Bạn đang có giao dịch chờ",
          flags: MessageFlags.Ephemeral
        });

      const modal = new ModalBuilder()
        .setCustomId("nap_modal")
        .setTitle("Nhập số tiền");

      const input = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Số tiền (VNĐ)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return i.showModal(modal);
    }
  }

  /* ===== MODAL ===== */
  if (i.isModalSubmit()) {

    const amount = Number(i.fields.getTextInputValue("amount"));
    if (isNaN(amount) || amount < 1000)
      return i.reply({
        content: "❌ Số tiền không hợp lệ",
        flags: MessageFlags.Ephemeral
      });

    const code = `NAP${Date.now()}`;

    pending[code] = {
      userId,
      amount
    };

    save("./pending.json", pending);

    const qr =
      `https://qr.sepay.vn/img?bank=${process.env.BANK}` +
      `&acc=${process.env.ACC}` +
      `&amount=${amount}` +
      `&des=${code}`;

    return i.reply({
      content:
        `💳 Quét QR để nạp ${amount} VNĐ\n\n${qr}\n\n📌 Nội dung: ${code}`,
      flags: MessageFlags.Ephemeral
    });
  }
});

/* ================= WEBHOOK REALTIME ================= */

app.post("/webhook", (req, res) => {

  res.sendStatus(200); // trả về ngay cho bank

  setImmediate(async () => {
    try {

      console.log("WEBHOOK:", req.body);

      const desc =
        req.body.transferContent ||
        req.body.content ||
        req.body.description ||
        "";

      const amount =
        Number(req.body.transferAmount) ||
        Number(req.body.amount) ||
        0;

      if (!desc || !amount) return;

      let foundCode = null;

      for (const code in pending) {
        if (desc.includes(code)) {
          foundCode = code;
          break;
        }
      }

      if (!foundCode) return;
      if (processed.includes(foundCode)) return;

      const data = pending[foundCode];
      if (data.amount !== amount) return;

      balances[data.userId] =
        (balances[data.userId] || 0) + amount;

      processed.push(foundCode);
      delete pending[foundCode];

      save("./balances.json", balances);
      save("./pending.json", pending);
      save("./processed.json", processed);

      const user = await client.users.fetch(data.userId);
      await user.send(
        `💰 Nạp thành công ${amount} VNĐ\n💵 Số dư: ${balances[data.userId]} VNĐ`
      );

      console.log("NẠP OK:", data.userId, amount);

    } catch (err) {
      console.error("WEBHOOK ERROR:", err);
    }
  });

});

/* ================= ANTI CRASH ================= */

process.on("unhandledRejection", err =>
  console.error("UNHANDLED:", err)
);

process.on("uncaughtException", err =>
  console.error("UNCAUGHT:", err)
);

app.listen(process.env.PORT || 3000);
client.login(process.env.TOKEN);
