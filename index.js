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
  Events
} = require("discord.js");

/* ================== ANTI CRASH ================== */

process.on("uncaughtException", err => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", err => {
  console.error("Unhandled Rejection:", err);
});

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

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      users: {},
      transactions: [],
      keys: { thang: [], tuan: [], ngay: [] }
    })
  );
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
  try {
    if (!process.env.PANEL_CHANNEL) return;

    const channel = await client.channels.fetch(process.env.PANEL_CHANNEL).catch(() => null);
    if (!channel) return;

    const data = loadData();

    const embed = new EmbedBuilder()
      .setColor("#00ff99")
      .setTitle("🛒BUY KEY IPA AUTO")
      .addFields(
        { name: "📦 Key Tháng : 120K", value: `🛍️Kho còn: ${data.keys.thang.length}`, inline: true },
        { name: "📦 Key Tuần : 70K", value: `🛍️Kho còn: ${data.keys.tuan.length}`, inline: true },
        { name: "📦 Key Ngày :15K", value: `🛍️Kho còn: ${data.keys.ngay.length}`, inline: true }
      )
      .setFooter({ text: "Bot buy key tự động . Gặp vấn đề ib Admin" });

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

  } catch (err) {
    console.error("Panel error:", err);
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

    if (interaction.isButton()) {

      if (interaction.customId === "balance") {
        return interaction.reply({
          content: `💰 Số dư: ${data.users[userId].balance}đ`,
          ephemeral: true
        });
      }

      if (interaction.customId === "nap") {
        return interaction.reply({
          content:
`💳 Chuyển khoản:

Nội dung: ID${userId}
Ngân hàng: ${process.env.BANK_NAME || "Chưa cấu hình"}
STK: ${process.env.BANK_ACC || "Chưa cấu hình"}`,
          ephemeral: true
        });
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
      if (channel) channel.send(`💰 <@${userId}> đã nạp ${amount}đ`);
    }

    sendPanel();
    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

/* ================== LOGIN ================== */

if (process.env.TOKEN) {
  client.login(process.env.TOKEN).catch(err => {
    console.error("Login error:", err);
  });
} else {
  console.error("TOKEN chưa được cấu hình.");
}
