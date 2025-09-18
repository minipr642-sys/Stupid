const { Telegraf, Markup } = require('telegraf');
const { Keypair } = require('@solana/web3.js');
const { generateMnemonic, mnemonicToSeedSync } = require('bip39');
const express = require('express');
const crypto = require('crypto');

// Bot token (set via environment variable for security)
const BOT_TOKEN = process.env.BOT_TOKEN || '8324063009:AAG2SDn5GrlCYlUAygYfDl6-8lGrb8RLNHQ';

// Initialize bot and Express app
const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = `/${crypto.randomBytes(16).toString('hex')}`; // Random webhook path for security
const WEBHOOK_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}${WEBHOOK_PATH}`; // Set in Render environment variables

// Rate limiting
const rateLimit = new Map();
const COOLDOWN_MS = 30000; // 30 seconds cooldown

// Middleware to parse JSON
app.use(express.json());
app.use(bot.webhookCallback(WEBHOOK_PATH));

// Start command
bot.start((ctx) => {
  ctx.reply(
    'Welcome to Solana Seed Generator Bot! 🚀\n\n' +
    'Use /generate to create a new Solana seed phrase (12 words by default).\n' +
    'Use /generate24 for 24 words.\n' +
    'Use /multiple <number> to generate multiple (max 5).\n\n' +
    '⚠️ Warning: These seed phrases control real Solana wallets. Never share them! Import into Phantom, Solflare, etc., at your own risk.',
    Markup.inlineKeyboard([
      [Markup.button.callback('Generate 12-word Seed', 'generate12')],
      [Markup.button.callback('Generate 24-word Seed', 'generate24')],
      [Markup.button.callback('Generate Multiple', 'multiple')]
    ])
  );
});

// Generate commands
bot.command('generate', (ctx) => handleGenerate(ctx, 12));
bot.command('generate24', (ctx) => handleGenerate(ctx, 24));

// Multiple generation
bot.command('multiple', (ctx) => {
  ctx.reply('How many seeds to generate? (1-5)', {
    reply_markup: {
      inline_keyboard: [
        [Markup.button.callback('1', 'multi1')],
        [Markup.button.callback('2', 'multi2')],
        [Markup.button.callback('3', 'multi3')],
        [Markup.button.callback('4', 'multi4')],
        [Markup.button.callback('5', 'multi5')],
        [Markup.button.callback('Back', 'start')]
      ]
    }
  });
});

// Callback query handler
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  if (data.startsWith('multi')) {
    const count = parseInt(data.replace('multi', ''));
    if (count >= 1 && count <= 5) {
      await handleMultipleGenerate(ctx, count, 12);
    }
  } else if (data === 'generate12') {
    handleGenerate(ctx, 12);
  } else if (data === 'generate24') {
    handleGenerate(ctx, 24);
  } else if (data === 'multiple') {
    ctx.reply('How many seeds to generate? (1-5)', {
      reply_markup: {
        inline_keyboard: [
          [Markup.button.callback('1', 'multi1')],
          [Markup.button.callback('2', 'multi2')],
          [Markup.button.callback('3', 'multi3')],
          [Markup.button.callback('4', 'multi4')],
          [Markup.button.callback('5', 'multi5')],
          [Markup.button.callback('Back', 'start')]
        ]
      }
    });
  } else if (data === 'start') {
    ctx.reply(
      'Welcome to Solana Seed Generator Bot! 🚀\n\n' +
      'Use /generate to create a new Solana seed phrase (12 words by default).\n' +
      'Use /generate24 for 24 words.\n' +
      'Use /multiple <number> to generate multiple (max 5).',
      Markup.inlineKeyboard([
        [Markup.button.callback('Generate 12-word Seed', 'generate12')],
        [Markup.button.callback('Generate 24-word Seed', 'generate24')],
        [Markup.button.callback('Generate Multiple', 'multiple')]
      ])
    );
  }

  bot.telegram.answerCbQuery(ctx.callbackQuery.id);
});

// Rate limit checker
function checkRateLimit(userId) {
  const now = Date.now();
  const lastUsed = rateLimit.get(userId) || 0;
  if (now - lastUsed < COOLDOWN_MS) {
    return false;
  }
  rateLimit.set(userId, now);
  return true;
}

// Handle single generation
async function handleGenerate(ctx, wordCount) {
  const userId = ctx.from.id;
  if (!checkRateLimit(userId)) {
    return ctx.reply('⏳ Please wait 30 seconds before generating another seed.');
  }

  try {
    const strength = wordCount === 12 ? 128 : 256;
    const mnemonic = generateMnemonic(strength);
    const seed = mnemonicToSeedSync(mnemonic).slice(0, 32);
    const keypair = Keypair.fromSeed(seed);
    const address = keypair.publicKey.toString();

    const message = `
🆕 New Solana Wallet Generated!

**Seed Phrase (${wordCount} words):**
\`${mnemonic}\`

**Wallet Address:**
\`${address}\`

⚠️ **Security Warning:** This seed phrase gives full control over the wallet. Store it securely and never share it. You can import it into Phantom, Solflare, or any Solana-compatible wallet.

Advanced Tip: The private key can be derived from the seed for programmatic use.
    `;

    ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [Markup.button.callback('Generate Another 12-word', 'generate12')],
          [Markup.button.callback('Generate Another 24-word', 'generate24')],
          [Markup.button.url('View on Solana Explorer', `https://solscan.io/account/${address}`)]
        ]
      }
    });
  } catch (error) {
    ctx.reply('❌ Error generating seed. Please try again.');
    console.error(error);
  }
}

// Handle multiple generations
async function handleMultipleGenerate(ctx, count, wordCount) {
  const userId = ctx.from.id;
  if (!checkRateLimit(userId)) {
    return ctx.reply('⏳ Please wait 30 seconds before generating more seeds.');
  }

  let message = `🆕 Generated ${count} Solana Wallets (${wordCount} words each):\n\n`;
  try {
    for (let i = 1; i <= count; i++) {
      const strength = wordCount === 12 ? 128 : 256;
      const mnemonic = generateMnemonic(strength);
      const seed = mnemonicToSeedSync(mnemonic).slice(0, 32);
      const keypair = Keypair.fromSeed(seed);
      const address = keypair.publicKey.toString();

      message += `**Wallet ${i}:**\n`;
      message += `Seed: \`${mnemonic}\`\n`;
      message += `Address: \`${address}\`\n\n`;
    }

    message += '⚠️ **Security Warning:** These seed phrases control real wallets. Store securely!';

    ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [Markup.button.callback('Generate More', 'multiple')],
          [Markup.button.callback('Back to Single', 'start')]
        ]
      }
    });
  } catch (error) {
    ctx.reply('❌ Error generating seeds. Please try again.');
    console.error(error);
  }
}

// Error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('An error occurred. Please try again.');
});

// Set webhook and start server
bot.telegram.setWebhook(WEBHOOK_URL).then(() => {
  console.log(`Webhook set to ${WEBHOOK_URL}`);
}).catch((err) => {
  console.error('Error setting webhook:', err);
});

app.get('/', (req, res) => res.send('Bot is running!'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
