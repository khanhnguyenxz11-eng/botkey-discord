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
const bodyParser = require("body-parser");
const fs = require("fs");

// ================= DATABASE FILE =================

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

// ================= DISCORD CLIENT =================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
});

// ================= SLASH COMMAND DEPLOY =================

const commands = [
  new SlashCommandBuilder().setName("shop").setDescription("Mở shop"),
  new SlashCommandBuilder().setName("admin").setDescription("Admin panel"),

  new SlashCommandBuilder()
    .setName("addkey")
    .setDescription("Thêm key")
    .addStringOption(o => o.setName("type").setRequired(true).setDescription("ipa_day / ipa_week / ipa_month"))
    .addStringOption(o => o.setName("keys").setRequired(true).setDescription("key1,key2")),

  new SlashCommandBuilder()
    .setName("addmoney")
    .setDescription("Cộng tiền user")
    .addStringOption(o => o.setName("userid").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Xem số dư user")
    .addStringOption(o => o.setName("userid").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );
  console.log("✅ Slash commands deployed");
})();

// ================= SEPAY WEBHOOK =================

const app = express();
app.use(bodyParser.json());

app.post("/webhook", (req, res) => {

  const data = req.body;

  const userId = data.content; // nội dung chuyển khoản = ID Discord
  const amount = Number(data.transferAmount);

  if (!userId || !amount) return res.sendStatus(400);

  if (!balances[userId]) balances[userId] = 0;

  balances[userId] += amount;

  fs.writeFileSync("./balances.json", JSON.stringify(balances, null, 2));

  console.log(`💰 Cộng ${amount} cho ${userId}`);

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () =>
  console.log("🌐 Webhook đang chạy")
);

// ================= INTERACTION =================

client.on(Events.InteractionCreate, async interaction => {

  // ================= SHOP =================
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
        .setCustomId("buy_key")
        .setPlaceholder("Chọn gói key...")
        .addOptions(products.map(p => ({
          label: p.name,
          value: p.id
        })));

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("nap_tien").setLabel("Nạp tiền").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("so_du").setLabel("Số dư").setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(select),
          buttons
        ]
      });
    }

    // ================= ADMIN =================
    if (interaction.commandName === "admin") {

      if (interaction.user.id !== process.env.ADMIN_ID)
        return interaction.reply({ content: "❌ Không phải admin", ephemeral: true });

      await interaction.reply({
        content: "🔐 ADMIN PANEL\n/addkey\n/addmoney\n/balance",
        ephemeral: true
      });
    }

    // ADD KEY
    if (interaction.commandName === "addkey") {

      if (interaction.user.id !== process.env.ADMIN_ID)
        return interaction.reply({ content: "❌ Không phải admin", ephemeral: true });

      const type = interaction.options.getString("type");
      const keyInput = interaction.options.getString("keys");
      const newKeys = keyInput.split(",");

      if (!keys[type]) keys[type] = [];

      keys[type].push(...newKeys);

      fs.writeFileSync("./keys.json", JSON.stringify(keys, null, 2));

      await interaction.reply({ content: "✅ Đã thêm key", ephemeral: true });
    }

    // ADD MONEY
    if (interaction.commandName === "addmoney") {

      if (interaction.user.id !== process.env.ADMIN_ID)
        return interaction.reply({ content: "❌ Không phải admin", ephemeral: true });

      const userId = interaction.options.getString("userid");
      const amount = interaction.options.getInteger("amount");

      if (!balances[userId]) balances[userId] = 0;
      balances[userId] += amount;

      fs.writeFileSync("./balances.json", JSON.stringify(balances, null, 2));

      await interaction.reply({ content: "✅ Đã cộng tiền", ephemeral: true });
    }

    // CHECK BALANCE
    if (interaction.commandName === "balance") {

      if (interaction.user.id !== process.env.ADMIN_ID)
        return interaction.reply({ content: "❌ Không phải admin", ephemeral: true });

      const userId = interaction.options.getString("userid");
      const bal = balances[userId] || 0;

      await interaction.reply({ content: `💰 ${bal} VNĐ`, ephemeral: true });
    }
  }

  // ================= BUTTON =================

  if (interaction.isButton()) {

    if (interaction.customId === "nap_tien") {
      await interaction.reply({
        content: `🏦 Chuyển khoản nội dung:\n${interaction.user.id}\nBot tự cộng tiền sau vài giây.`,
        ephemeral: true
      });
    }

    if (interaction.customId === "so_du") {
      const bal = balances[interaction.user.id] || 0;
      await interaction.reply({ content: `💰 ${bal} VNĐ`, ephemeral: true });
    }
  }

  // ================= BUY KEY =================

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

});

client.login(process.env.TOKEN);
