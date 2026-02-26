require("dotenv").config();
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

const express = require("express");
const fs = require("fs");

// ================= FILE INIT =================

if (!fs.existsSync("./balances.json"))
  fs.writeFileSync("./balances.json", "{}");

if (!fs.existsSync("./keys.json"))
  fs.writeFileSync("./keys.json", JSON.stringify({
    ipa_day: [],
    ipa_week: [],
    ipa_month: []
  }, null, 2));

let balances = JSON.parse(fs.readFileSync("./balances.json"));
let keys = JSON.parse(fs.readFileSync("./keys.json"));

const products = [
  { id: "ipa_day", name: "Key IPA - Ngày", price: 15000 },
  { id: "ipa_week", name: "Key IPA - Tuần", price: 70000 },
  { id: "ipa_month", name: "Key IPA - Tháng", price: 120000 }
];

// ================= DISCORD =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
});

// ================= WEBHOOK =================

const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  try {
    const userId = req.body.content;
    const amount = Number(req.body.transferAmount);

    if (!userId || !amount) return res.sendStatus(400);

    if (!balances[userId]) balances[userId] = 0;
    balances[userId] += amount;

    fs.writeFileSync("./balances.json", JSON.stringify(balances, null, 2));

    console.log(`💰 +${amount} cho ${userId}`);
    res.sendStatus(200);

  } catch {
    res.sendStatus(500);
  }
});

app.listen(process.env.PORT || 3000);

// ================= ADMIN COMMAND =================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.author.id !== process.env.ADMIN_ID) return;

  // ===== PANEL =====
  if (message.content === "!panel") {

    const select = new StringSelectMenuBuilder()
      .setCustomId("buy_key")
      .setPlaceholder("Chọn sản phẩm...")
      .addOptions(products.map(p => ({
        label: `${p.name} - ${p.price}đ`,
        value: p.id
      })));

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("nap_tien")
        .setLabel("Nạp tiền")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("so_du")
        .setLabel("Số dư")
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({
      content: "🛒 SHOP KEY IPA",
      components: [
        new ActionRowBuilder().addComponents(select),
        buttons
      ]
    });
  }

  // ===== ADD KEY =====
  if (message.content.startsWith("!addkey")) {
    const args = message.content.split(" ");
    const type = args[1];
    const key = args.slice(2).join(" ");

    if (!keys[type]) return message.reply("❌ Sai loại key");

    keys[type].push(key);
    fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));

    message.reply("✅ Đã thêm key");
  }

  // ===== CHECK BALANCE =====
  if (message.content.startsWith("!check")) {
    const userId = message.content.split(" ")[1];
    const bal = balances[userId] || 0;
    message.reply(`💰 Số dư: ${bal} VNĐ`);
  }
});

// ================= BUTTON =================

client.on(Events.InteractionCreate, async interaction => {

  if (interaction.isButton()) {

    // ===== NẠP TIỀN =====
    if (interaction.customId === "nap_tien") {
      return interaction.reply({
        content: `🏦 Quét QR để nạp

📌 Nội dung:
${interaction.user.id}`,
        files: ["./qr.png"],
        ephemeral: true
      });
    }

    // ===== SỐ DƯ =====
    if (interaction.customId === "so_du") {
      const bal = balances[interaction.user.id] || 0;
      return interaction.reply({
        content: `💰 Số dư của bạn: ${bal} VNĐ`,
        ephemeral: true
      });
    }
  }

  // ===== MUA KEY =====
  if (interaction.isStringSelectMenu()) {

    const product = products.find(p => p.id === interaction.values[0]);
    const bal = balances[interaction.user.id] || 0;

    if (bal < product.price)
      return interaction.reply({ content: "❌ Không đủ tiền", ephemeral: true });

    if (!keys[product.id] || keys[product.id].length === 0)
      return interaction.reply({ content: "❌ Hết key", ephemeral: true });

    const key = keys[product.id].shift();
    balances[interaction.user.id] -= product.price;

    fs.writeFileSync("./balances.json", JSON.stringify(balances, null, 2));
    fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));

    return interaction.reply({
      content: `✅ Mua thành công\n🔑 Key của bạn:\n\`${key}\``,
      ephemeral: true
    });
  }
});

// ================= LOGIN =================

client.login(process.env.TOKEN);
