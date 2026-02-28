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

if (!process.env.TOKEN) {
  console.error("❌ Missing TOKEN");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const app = express();
app.use(express.json());

/* ================= HEALTH CHECK ROUTE ================= */
/* Railway sẽ ping route này */
app.get("/", (req, res) => {
  res.status(200).send("Bot is running ✅");
});

/* ================= FILE SAFE ================= */

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

/* ================= DATA ================= */

let balances = load("./balances.json", {});
let pending = load("./pending.json", {});
let processed = load("./processed.json", []);
let keys = load("./keys.json", { day: [], week: [], month: [] });
let panel = load("./panel.json", { messageId: null });

/* ================= PANEL ================= */

function embed() {
  return new EmbedBuilder()
    .setTitle("🛒 IPA SHOP")
    .setDescription(
      `📅 Ngày (15K): ${keys.day.length}\n` +
      `📆 Tuần (70K): ${keys.week.length}\n` +
      `🗓 Tháng (120K): ${keys.month.length}`
    )
    .setColor("#5865F2");
}

function components() {
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
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("admin_add")
        .setLabel("🔑 Admin Add Key")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function updatePanel() {
  try {
    if (!process.env.CHANNEL_ID) return;

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    if (!channel) return;

    if (!panel.messageId) {
      const msg = await channel.send({
        embeds: [embed()],
        components: components()
      });
      panel.messageId = msg.id;
      save("./panel.json", panel);
    } else {
      const msg = await channel.messages.fetch(panel.messageId);
      await msg.edit({
        embeds: [embed()],
        components: components()
      });
    }
  } catch (err) {
    console.error("Panel error:", err);
  }
}

/* ================= READY ================= */

client.once("clientReady", async () => {
  console.log("🤖 BOT READY:", client.user.tag);
  await updatePanel();
});

/* ================= INTERACTION ================= */

client.on("interactionCreate", async (i) => {
  const userId = i.user.id;
  if (!balances[userId]) balances[userId] = 0;

  if (i.isStringSelectMenu()) {
    const price = { day: 15000, week: 70000, month: 120000 };
    const type = i.values[0];

    if (balances[userId] < price[type])
      return i.reply({ content: "❌ Không đủ tiền", flags: MessageFlags.Ephemeral });

    if (!keys[type].length)
      return i.reply({ content: "❌ Hết key", flags: MessageFlags.Ephemeral });

    const key = keys[type].shift();
    balances[userId] -= price[type];

    save("./balances.json", balances);
    save("./keys.json", keys);
    await updatePanel();

    return i.reply({
      content: `✅ Thành công\n🔑 ${key}`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (i.isButton()) {
    if (i.customId === "balance")
      return i.reply({
        content: `💵 Số dư: ${balances[userId].toLocaleString()} VNĐ`,
        flags: MessageFlags.Ephemeral
      });

    if (i.customId === "nap") {
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

  if (i.isModalSubmit()) {
    if (i.customId === "nap_modal") {
      const amount = Number(i.fields.getTextInputValue("amount"));
      if (isNaN(amount) || amount < 1000)
        return i.reply({
          content: "❌ Số tiền không hợp lệ",
          flags: MessageFlags.Ephemeral
        });

      const code = `NAP${Date.now()}`;
      pending[code] = { userId, amount };
      save("./pending.json", pending);

      const qr =
        `https://qr.sepay.vn/img?bank=${process.env.BANK || ""}` +
        `&acc=${process.env.ACC || ""}` +
        `&amount=${amount}` +
        `&des=${code}`;

      return i.reply({
        content:
          `💳 Quét QR để nạp ${amount.toLocaleString()} VNĐ\n\n${qr}\n\n📌 Nội dung: ${code}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
});

/* ================= WEBHOOK ================= */

app.post("/webhook", (req, res) => {
  res.sendStatus(200);
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🌐 Server running on port", PORT);
});

client.login(process.env.TOKEN)
  .then(() => console.log("✅ Bot login success"))
  .catch(err => {
    console.error("Login error:", err);
    process.exit(1);
  });

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
