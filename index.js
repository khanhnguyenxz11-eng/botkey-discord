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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} = require("discord.js");

/* ================= WEB SERVER ================= */

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("Bot is running"));

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running");
});

/* ================= DISCORD ================= */

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
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ================= PANEL ================= */

async function sendPanel() {
  const channel = await client.channels.fetch(process.env.PANEL_CHANNEL);
  if (!channel) return;

  const data = loadData();

  const content =
`🎮 **PANEL MUA KEY**

🔑 Tháng còn: ${data.keys.thang.length}
🔑 Tuần còn: ${data.keys.tuan.length}
🔑 Ngày còn: ${data.keys.ngay.length}
`;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("nap")
      .setLabel("💳 Nạp tiền")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("balance")
      .setLabel("💰 Số dư")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("select_product")
      .setLabel("🛒 Chọn sản phẩm")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("admin_panel")
      .setLabel("🔐 Admin")
      .setStyle(ButtonStyle.Danger)
  );

  if (!panelMessage) {
    panelMessage = await channel.send({
      content,
      components: [row1, row2]
    });
  } else {
    await panelMessage.edit({
      content,
      components: [row1, row2]
    });
  }
}

/* ================= READY ================= */

client.once(Events.ClientReady, async () => {
  console.log(`Bot online: ${client.user.tag}`);
  sendPanel();
});

/* ================= INTERACTION ================= */

client.on(Events.InteractionCreate, async interaction => {

  const data = loadData();
  const userId = interaction.user.id;

  if (!data.users[userId]) {
    data.users[userId] = { balance: 0 };
  }

  /* ===== BUTTON ===== */
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
`💳 Chuyển khoản nội dung:

ID${userId}

Ngân hàng: ${process.env.BANK_NAME}
STK: ${process.env.BANK_ACC}`,
        ephemeral: true
      });
    }

    if (interaction.customId === "select_product") {

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("buy_menu")
          .setPlaceholder("Chọn sản phẩm")
          .addOptions([
            { label: "Key Tháng - 120000đ", value: "thang" },
            { label: "Key Tuần - 70000đ", value: "tuan" },
            { label: "Key Ngày - 15000đ", value: "ngay" }
          ])
      );

      return interaction.reply({
        content: "🛒 Chọn loại key:",
        components: [menu],
        ephemeral: true
      });
    }

    /* ===== ADMIN PANEL ===== */
    if (interaction.customId === "admin_panel") {
      if (userId !== process.env.ADMIN_ID)
        return interaction.reply({ content: "❌ Không phải admin", ephemeral: true });

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("admin_add_key")
          .setPlaceholder("Chọn loại key để thêm")
          .addOptions([
            { label: "Thêm Key Tháng", value: "thang" },
            { label: "Thêm Key Tuần", value: "tuan" },
            { label: "Thêm Key Ngày", value: "ngay" }
          ])
      );

      return interaction.reply({
        content: "🔐 Admin thêm key:",
        components: [menu],
        ephemeral: true
      });
    }
  }

  /* ===== ADMIN ADD KEY ===== */
  if (interaction.isStringSelectMenu() && interaction.customId === "admin_add_key") {

    const type = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`addkey_${type}`)
      .setTitle("Thêm Key");

    const input = new TextInputBuilder()
      .setCustomId("key_input")
      .setLabel("Nhập key (mỗi dòng 1 key)")
      .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  /* ===== BUY MENU ===== */
  if (interaction.isStringSelectMenu() && interaction.customId === "buy_menu") {

    const type = interaction.values[0];
    const prices = { thang: 120000, tuan: 70000, ngay: 15000 };
    const price = prices[type];

    if (data.users[userId].balance < price)
      return interaction.reply({ content: "❌ Không đủ số dư!", ephemeral: true });

    if (data.keys[type].length === 0)
      return interaction.reply({ content: "❌ Hết key!", ephemeral: true });

    const key = data.keys[type].shift();
    data.users[userId].balance -= price;
    saveData(data);

    await interaction.reply({
      content: `✅ Mua thành công!\n🔑 Key: ${key}`,
      ephemeral: true
    });

    sendPanel();
  }

  /* ===== MODAL SUBMIT ===== */
  if (interaction.isModalSubmit()) {

    if (!interaction.customId.startsWith("addkey_")) return;

    if (interaction.user.id !== process.env.ADMIN_ID)
      return interaction.reply({ content: "❌ Không phải admin", ephemeral: true });

    const type = interaction.customId.split("_")[1];
    const keys = interaction.fields.getTextInputValue("key_input")
      .split("\n")
      .map(k => k.trim())
      .filter(Boolean);

    data.keys[type].push(...keys);
    saveData(data);

    await interaction.reply({
      content: `✅ Đã thêm ${keys.length} key`,
      ephemeral: true
    });

    sendPanel();
  }
});

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {
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

  const channel = await client.channels.fetch(process.env.SUCCESS_CHANNEL);
  channel.send(`💰 <@${userId}> đã nạp thành công ${amount}đ`);

  sendPanel();

  res.sendStatus(200);
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
