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

// ================= SAFE FILE INIT =================

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
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
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

  } catch (err) {
    console.log("Webhook lỗi:", err);
    res.sendStatus(500);
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("🌐 Webhook running")
);

// ================= INTERACTION =================

client.on(Events.InteractionCreate, async interaction => {

  try {

    // ================= BUTTON: MỞ SHOP =================
    if (interaction.isButton() && interaction.customId === "open_shop") {

      const embed = new EmbedBuilder()
        .setTitle("🛒 SHOP KEY IPA")
        .setColor("Purple");

      products.forEach(p => {
        embed.addFields({
          name: p.name,
          value: `💰 ${p.price} VNĐ`
        });
      });

      const select = new StringSelectMenuBuilder()
        .setCustomId("buy_key")
        .setPlaceholder("Chọn gói key...")
        .addOptions(products.map(p => ({
          label: p.name,
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

      return interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(select),
          buttons
        ],
        ephemeral: true
      });
    }

    // ================= NẠP TIỀN =================
    if (interaction.isButton() && interaction.customId === "nap_tien") {

      return interaction.reply({
        content: `🏦 QUÉT QR ĐỂ NẠP TIỀN

📌 Nội dung bắt buộc:
${interaction.user.id}

💰 Chuyển bao nhiêu cũng được.`,
        files: ["./qr.png"],
        ephemeral: true
      });
    }

    // ================= SỐ DƯ =================
    if (interaction.isButton() && interaction.customId === "so_du") {

      const bal = balances[interaction.user.id] || 0;

      return interaction.reply({
        content: `💰 Số dư: ${bal} VNĐ`,
        ephemeral: true
      });
    }

    // ================= MUA KEY =================
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

  } catch (err) {
    console.log("Bot lỗi:", err);
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
