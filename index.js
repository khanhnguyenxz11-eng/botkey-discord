require("dotenv").config();
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
  Events
} = require("discord.js");

const express = require("express");
const fs = require("fs");

// ===== FILE INIT =====
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

const QR_IMAGE = "https://cdn.discordapp.com/attachments/1424762608694853809/1476463256519442452/IMG_1910.png?ex=69a1370f&is=699fe58f&hm=853e9d763f078b2b17867b5d2aa84bc75e213f1b2ff387bfffa7a5acf34089f3";

// ===== DISCORD =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let panelMessage = null;

async function sendOrUpdatePanel() {
  const channel = await client.channels.fetch(process.env.CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setTitle("🛒 SHOP KEY IPA")
    .setColor("Purple");

  products.forEach(p => {
    embed.addFields({
      name: `${p.name}`,
      value: `💰 ${p.price}đ\n📦 Còn lại: ${keys[p.id].length}`
    });
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId("buy_key")
    .setPlaceholder("Chọn sản phẩm...")
    .addOptions(products.map(p => ({
      label: `${p.name} (${keys[p.id].length})`,
      value: p.id
    })));

  const userButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("nap_tien")
      .setLabel("Nạp tiền")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("so_du")
      .setLabel("Số dư")
      .setStyle(ButtonStyle.Primary)
  );

  const adminButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("add_day")
      .setLabel("Add Day")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("add_week")
      .setLabel("Add Week")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("add_month")
      .setLabel("Add Month")
      .setStyle(ButtonStyle.Secondary)
  );

  if (!panelMessage) {
    panelMessage = await channel.send({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(select),
        userButtons,
        adminButtons
      ]
    });
  } else {
    await panelMessage.edit({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(select),
        userButtons,
        adminButtons
      ]
    });
  }
}

client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
  await sendOrUpdatePanel();
});

// ===== WEBHOOK =====
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

// ===== INTERACTION =====
client.on(Events.InteractionCreate, async interaction => {

  // ===== NẠP TIỀN =====
  if (interaction.isButton() && interaction.customId === "nap_tien") {
    return interaction.reply({
      content: `🏦 Quét QR để nạp

📌 Nội dung chuyển khoản:
${interaction.user.id}

Ảnh QR: ${QR_IMAGE}`,
      ephemeral: true
    });
  }

  // ===== SỐ DƯ =====
  if (interaction.isButton() && interaction.customId === "so_du") {
    const bal = balances[interaction.user.id] || 0;
    return interaction.reply({
      content: `💰 Số dư của bạn: ${bal} VNĐ`,
      ephemeral: true
    });
  }

  // ===== MUA KEY =====
  if (interaction.isStringSelectMenu()) {
    const product = products.find(p => p.id === interaction.values[0]);
    const bal = balances[interaction.user.id] || 0;

    if (bal < product.price)
      return interaction.reply({ content: "❌ Không đủ tiền", ephemeral: true });

    if (keys[product.id].length === 0)
      return interaction.reply({ content: "❌ Hết key", ephemeral: true });

    const key = keys[product.id].shift();
    balances[interaction.user.id] -= product.price;

    fs.writeFileSync("./balances.json", JSON.stringify(balances, null, 2));
    fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));

    await interaction.reply({
      content: `✅ Mua thành công\n🔑 Key:\n\`${key}\``,
      ephemeral: true
    });

    await sendOrUpdatePanel();
  }

  // ===== ADMIN ADD KEY =====
  if (interaction.isButton() &&
      ["add_day","add_week","add_month"].includes(interaction.customId)) {

    if (interaction.user.id !== process.env.ADMIN_ID)
      return interaction.reply({ content: "❌ Không phải admin", ephemeral: true });

    const typeMap = {
      add_day: "ipa_day",
      add_week: "ipa_week",
      add_month: "ipa_month"
    };

    const modal = new ModalBuilder()
      .setCustomId(`modal_${typeMap[interaction.customId]}`)
      .setTitle("Thêm Key");

    const input = new TextInputBuilder()
      .setCustomId("key_input")
      .setLabel("Nhập key")
      .setStyle(TextInputStyle.Short);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ===== MODAL SUBMIT =====
  if (interaction.isModalSubmit()) {

    const type = interaction.customId.replace("modal_", "");
    const key = interaction.fields.getTextInputValue("key_input");

    keys[type].push(key);
    fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));

    await interaction.reply({ content: "✅ Đã thêm key", ephemeral: true });
    await sendOrUpdatePanel();
  }

});

client.login(process.env.TOKEN);
