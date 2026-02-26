require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
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

client.once("ready", () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
});

// ================= SLASH COMMAND =================

const commands = [
  new SlashCommandBuilder().setName("shop").setDescription("Mở shop"),
  new SlashCommandBuilder()
    .setName("addkey")
    .setDescription("Thêm key")
    .addStringOption(o => o.setName("type").setRequired(true))
    .addStringOption(o => o.setName("keys").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("✅ Slash deployed");
  } catch (err) {
    console.log("❌ Deploy lỗi:", err);
  }
})();

// ================= WEBHOOK =================

const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  try {
    const data = req.body;

    const userId = data.content;
    const amount = Number(data.transferAmount);

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

// ================= BOT LOGIC =================

client.on(Events.InteractionCreate, async interaction => {

  try {

    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "shop") {

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
          .setCustomId("buy")
          .setPlaceholder("Chọn gói...")
          .addOptions(products.map(p => ({
            label: p.name,
            value: p.id
          })));

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("nap")
            .setLabel("Nạp tiền")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("balance")
            .setLabel("Số dư")
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(select),
            buttons
          ]
        });
      }

      if (interaction.commandName === "addkey") {

        const type = interaction.options.getString("type");
        const keyInput = interaction.options.getString("keys");

        const newKeys = keyInput.split(",");

        if (!keys[type]) keys[type] = [];

        keys[type].push(...newKeys);

        fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));

        await interaction.reply({ content: "✅ Đã thêm key", ephemeral: true });
      }
    }

    // BUTTON
    if (interaction.isButton()) {

      if (interaction.customId === "nap") {
        await interaction.reply({
          content: `🏦 Quét QR bên dưới

📌 Nội dung bắt buộc:
${interaction.user.id}

💰 Chuyển bao nhiêu cũng được`,
          files: ["./qr.png"],
          ephemeral: true
        });
      }

      if (interaction.customId === "balance") {
        const bal = balances[interaction.user.id] || 0;
        await interaction.reply({
          content: `💰 Số dư: ${bal} VNĐ`,
          ephemeral: true
        });
      }
    }

    // BUY
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

      await interaction.reply({
        content: `✅ Mua thành công\n🔑 Key:\n\`${key}\``,
        ephemeral: true
      });
    }

  } catch (err) {
    console.log("Bot lỗi:", err);
  }
});

client.login(process.env.TOKEN);
