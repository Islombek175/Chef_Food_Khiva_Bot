import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import foodsKeyboard from '../handlers/menu.handler.js'
import startMessage from '../handlers/start.handler.js'
import deliveryReplyKeyboard from './keyboards/delivery.js'
import menuReplyKeyboard from './keyboards/menu.js'

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

const replyMarkup = {
	reply_markup: {
		keyboard: [
			[
				...deliveryReplyKeyboard.reply_markup.keyboard[0],
				...menuReplyKeyboard.reply_markup.keyboard[0],
			],
			deliveryReplyKeyboard.reply_markup.keyboard[1],
		],
		resize_keyboard: true,
		one_time_keyboard: true,
	},
}

bot.on('message', msg => {
	const chatId = msg.chat.id
	const firstName = msg.from.first_name

	switch (msg.text) {
		case '/start':
			bot.sendMessage(chatId, startMessage(firstName), replyMarkup)
			break
		case '🍔 Menu':
			bot.sendMessage(chatId, 'Iltimos, taom tanlang:', foodsKeyboard)
			break
		case '🛒 Buyurtma berish':
			bot.sendMessage(chatId, 'Buyurtma berish', replyMarkup)
			break
		case '❌ Bekor qilish':
			bot.sendMessage(chatId, 'Buyurtma bekor qilindi.', replyMarkup)
			break
		default:
			bot.sendMessage(chatId, 'Iltimos, menyudan tanlang.', replyMarkup)
			break
	}
})

bot.on('callback_query', callbackQuery => {
	const chatId = callbackQuery.message.chat.id
	const data = callbackQuery.data

	switch (data) {
		case 'select_burger':
		case 'select_lavash':
		case 'select_pizza':
		case 'select_hot_dog':
		case 'select_non_kebab':
			bot.sendMessage(
				chatId,
				`Siz ${data.replace('select_', '').replace(/_/g, ' ')}ni tanladingiz. 👍`,
			)
			break
		case 'back_main':
			bot.sendMessage(chatId, 'Asosiy menyuga qaytildi.', replyMarkup)
			break
	}
	bot.answerCallbackQuery(callbackQuery.id)
})
