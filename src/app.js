import dotenv from 'dotenv'
import mongoose from 'mongoose'
import TelegramBot from 'node-telegram-bot-api'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ADMIN_CHAT_ID = 6480933576

dotenv.config()

const TOKEN = process.env.BOT_TOKEN
const MONGO_URI = process.env.MONGODB_URI

if (!TOKEN) {
	throw new Error('BOT_TOKEN is required in the environment')
}
if (!MONGO_URI) {
	throw new Error('MONGODB_URI is required in the environment')
}

const bot = new TelegramBot(TOKEN, { polling: true })

// === MONGODB BOG'LANISHI VA MODEL YARATISH ===

mongoose
	.connect(MONGO_URI)
	.then(() => console.log('✅ MongoDB ga muvaffaqiyatli ulandi!'))
	.catch(err => console.error('❌ MongoDB ga ulanishda xatolik:', err))

// 1. Foydalanuvchi sxemasi (Savatcha - Cart tizimi qo'shildi)
// 1. Foydalanuvchi sxemasi (To'liq ro'yxatga olish tizimi bilan)
const userSchema = new mongoose.Schema({
	chatId: { type: Number, required: true, unique: true },
	firstName: { type: String, default: '' }, // <-- YANGI: Foydalanuvchi ismi
	username: { type: String, default: '' }, // <-- YANGI: Telegram @username
	registeredAt: { type: Date, default: Date.now }, // <-- YANGI: Qachon ro'yxatdan o'tgani
	state: { type: String, default: 'IDLE' },
	order: {
		name: { type: String, default: '' },
		phone: { type: String, default: '' },
		location: { type: String, default: '' },
		cart: { type: Array, default: [] },
	},
})
const User = mongoose.model('User', userSchema)

const getUserSession = async (chatId, fromObj = {}) => {
	let user = await User.findOne({ chatId })

	// Agar foydalanuvchi bazada bo'lmasa, uni to'liq ma'lumotlari bilan ro'yxatga olamiz
	if (!user) {
		user = new User({
			chatId: chatId,
			firstName: fromObj.first_name || '',
			username: fromObj.username || '',
			state: STATES.IDLE,
		})
		await user.save()
		console.log(`👤 Yangi foydalanuvchi ro'yxatdan o'tdi: ${user.firstName}`)
	}
	return user
}

// 2. Buyurtmalar tarixi (Arxiv)
const orderSchema = new mongoose.Schema({
	chatId: Number,
	customerName: String,
	phoneNumber: String,
	location: String,
	cart: Array, // <-- BIR NECHTA TAOMLAR
	totalPrice: Number, // <-- JAMI SUMMA
	orderedAt: { type: Date, default: Date.now },
})
const Order = mongoose.model('Order', orderSchema)

// Holatlar
const STATES = {
	IDLE: 'IDLE',
	AWAITING_NAME: 'AWAITING_NAME',
	AWAITING_PHONE: 'AWAITING_PHONE',
	AWAITING_LOCATION: 'AWAITING_LOCATION',
	AWAITING_FOOD_SELECT: 'AWAITING_FOOD_SELECT',
}

const MENU_IMAGE_PATH = path.join(__dirname, 'images', 'menu.png')
const getTelegramSafeMenu = async () => {
	const resizedBuffer = await sharp(MENU_IMAGE_PATH)
		.resize({
			width: 1280,
			height: 1280,
			fit: 'inside',
			withoutEnlargement: true,
		})
		.jpeg({ quality: 85 })
		.toBuffer()

	return { source: resizedBuffer, filename: 'menu.jpg' }
}
const MENU_PHOTO_URL =
	'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800' // Yoki o'zingizdagi menyu rasm havolasi (linki)

const dbFoods = [
	{
		id: 'food_1',
		name: '🥪 Sendvich',
		description: 'Mazali va to‘yimli sendvich.',
		price: 40000,
	},
	{
		id: 'food_2',
		name: '🌭 Xod-dog 2x',
		description: 'Ikki karza masalliqli xod-dog.',
		price: 22000,
	},
	{
		id: 'food_3',
		name: '🌭 Xod-dog 3x',
		description: 'Katta portsiya uchlik xod-dog.',
		price: 25000,
	},
	{
		id: 'food_4',
		name: '🥙 Doner',
		description: 'Ishtahaochar maxsus doner.',
		price: 38000,
	},
	{
		id: 'food_5',
		name: '🌯 Gibrid',
		description: 'Noyob va mazali gibrid.',
		price: 40000,
	},
	{
		id: 'food_6',
		name: '🌭 Chef Dog',
		description: 'Chef uslubidagi maxsus xot-dog.',
		price: 42000,
	},
	{
		id: 'food_7',
		name: '🌯 Xanskiy',
		description: 'Boyona va to‘yimli xanskiy.',
		price: 28000,
	},
	{
		id: 'food_8',
		name: '🌭 Abichniy',
		description: 'Klassik abichniy xod-dog.',
		price: 13000,
	},
	{
		id: 'food_9',
		name: '🥙 Nan Kebab',
		description: 'Non kebab sharqona usulda.',
		price: 45000,
	},
	{
		id: 'food_10',
		name: '🌯 O‘rama Gam',
		description: 'O‘rama gamburger.',
		price: 45000,
	},
	{
		id: 'food_11',
		name: '🍔 Gamburger',
		description: 'Klassik gamburger.',
		price: 30000,
	},
	{
		id: 'food_12',
		name: '🍔 Chizburger',
		description: 'Pishloqli mazali chizburger.',
		price: 35000,
	},
	{
		id: 'food_13',
		name: '🍔 Meat Burger',
		description: 'Ko‘p go‘shtli maxsus burger.',
		price: 38000,
	},
	{
		id: 'food_14',
		name: '🌯 Xaggi',
		description: 'Mazali xaggi fast-fud.',
		price: 45000,
	},
	{
		id: 'food_15',
		name: '🍔 Chizburger 2x',
		description: 'Ikki qavat pishloqli chizburger.',
		price: 45000,
	},
	{
		id: 'food_16',
		name: '🌯 Xod Pekin Tovuq',
		description: 'Pekincha tovuqli xod-dog.',
		price: 25000,
	},
	{
		id: 'food_17',
		name: '🌯 Xod Pekin Go‘sht',
		description: 'Pekincha go‘shtli xod-dog.',
		price: 28000,
	},
	{
		id: 'food_18',
		name: '🍔 UZB Gamburger',
		description: 'Milliy masalliqlar qo‘shilgan gamburger.',
		price: 17000,
	},
	{
		id: 'food_19',
		name: '🌯 Shaurma',
		description: 'Anʼanaviy mazali shaurma.',
		price: 30000,
	},
	{
		id: 'food_20',
		name: '🌯 Lavash Classic',
		description: 'Klassik tovuqli/go‘shtli lavash.',
		price: 38000,
	},
	{
		id: 'food_21',
		name: '🌯 Lavash BBQ',
		description: 'Barbekyu sousli lavash.',
		price: 35000,
	},
	{
		id: 'food_22',
		name: '🍕 Patirli Gam',
		description: 'Patirli gamburger (pitsa uslubida).',
		price: 15000,
	},
	{
		id: 'food_23',
		name: '🌯 Shaverma 2x',
		description: 'Katta portsiya shaverma.',
		price: 35000,
	},
	{
		id: 'food_24',
		name: '🌯 Lavash 2x',
		description: 'Katta ikkalalik lavash.',
		price: 45000,
	},
	{
		id: 'food_25',
		name: '🌯 Lavash BBQ 2x',
		description: 'Katta BBQ lavash ikki kishilik.',
		price: 40000,
	},
	{
		id: 'food_26',
		name: '🌯 Pekin Tovuq 2x',
		description: 'Pekin tovuqli katta portion.',
		price: 35000,
	},
	{
		id: 'food_27',
		name: '🌯 Pekin Go‘sht 2x',
		description: 'Pekin go‘shtli katta portion.',
		price: 38000,
	},
	{
		id: 'food_28',
		name: '🍟 Fri',
		description: 'Qarsildoq qovurilgan kartoshka fri.',
		price: 15000,
	},
]

// === YORDAMCHI FUNKSIYALAR ===
const getMainMenu = () => ({
	reply_markup: {
		keyboard: [
			[{ text: '🍔 Menu' }, { text: '🚖 Dostavka' }],
			[{ text: 'ℹ️ Biz haqimizda' }],
		],
		resize_keyboard: true,
	},
})

// Menyu yasash funksiyasi (Savatchadagi miqdorlarni ham ko'rsatadi)
const getInlineMenu = (actionPrefix = 'view', cart = []) => {
	const keyboard = []
	let row = []

	dbFoods.forEach((food, index) => {
		// Shu taomdan savatchada nechta borligini topamiz
		const cartItem = cart.find(item => item.id === food.id)
		const qtyText = cartItem ? ` (${cartItem.quantity} ta)` : ''
		const btnText = `${food.name}${qtyText}` // Masalan: "🍽 Taom #1 (2 ta)"

		row.push({ text: btnText, callback_data: `${actionPrefix}_${food.id}` })
		if (row.length === 2 || index === dbFoods.length - 1) {
			keyboard.push(row)
			row = []
		}
	})

	// Agar buyurtma berish rejimida bo'lsak va savatchada kamida 1 ta taom bo'lsa, savat tugmalarini chiqaramiz
	if (actionPrefix === 'order' && cart.length > 0) {
		const total = cart.reduce(
			(sum, item) => sum + item.price * item.quantity,
			0,
		)
		keyboard.push([
			{ text: '🗑 Savatni tozalash', callback_data: 'clear_cart' },
		])
		keyboard.push([
			{
				text: `✅ Tasdiqlash (Jami: ${total.toLocaleString()} so'm)`,
				callback_data: 'confirm_order',
			},
		])
	}

	return { reply_markup: { inline_keyboard: keyboard } }
}

// === XABARLARNI QABUL QILISH ===
bot.on('message', async msg => {
	const chatId = msg.chat.id
	const text = msg.text
	const firstName = msg.from.first_name || ''

	try {
		const user = await getUserSession(chatId, msg.from)

		if (text === '/start') {
			user.state = STATES.IDLE
			user.order = { name: '', phone: '', location: '', cart: [] }
			await user.save()
			return bot.sendMessage(
				chatId,
				`<b>Assalomu alaykum! ${firstName}</b> 👨‍🍳\nQuyidagi menyudan tanlang:`,
				{ parse_mode: 'HTML', ...getMainMenu() },
			)
		}

		if (user.state === STATES.IDLE) {
			if (text === '🍔 Menu' || text === '/menu') {
				// 1. Oldin menyu rasmini yuboramiz (Telegramga sig'adigan qilib caption bilan)
				const menuPhoto = await getTelegramSafeMenu()
				await bot.sendPhoto(chatId, menuPhoto.source, {
					caption:
						'📋 <b>Chef Food restorani menyusi</b>\nQuyidagi taomlardan birini tanlang:',
					parse_mode: 'HTML',
					filename: menuPhoto.filename,
				})

				// 2. Keyin esa 28 ta taom tugmachalarini chiqaramiz
				return bot.sendMessage(
					chatId,
					`😋 <b>Taomni tanlang va ustiga bosing:</b>`,
					{
						parse_mode: 'HTML',
						...getInlineMenu('view'),
					},
				)
			} else if (text === '🚖 Dostavka'  || text === '/delivery') {
				user.state = STATES.AWAITING_NAME
				user.order = { name: '', phone: '', location: '', cart: [] }
				await user.save()
				return bot.sendMessage(chatId, `📝 <b>Ismingizni kiriting:</b>`, {
					parse_mode: 'HTML',
				})
			} else if (text === 'ℹ️ Biz haqimizda') {
				return bot.sendMessage(
					chatId,
					`📌 <b>Biz haqimizda:</b>\n\nBizning restoranimiz eng sifatli taomlarni yetkazib berish bilan mashhur. Siz bizning menyudan tanlab, buyurtma berishingiz mumkin. Tez va ishonchli xizmat ko'rsatamiz!
					Manzil: Khiva, Qosmo Poliklinika yaqinida\nTelefon: +998 99 116 16 51
					`,
					{ parse_mode: 'HTML' },
				)
			}
		}

		if (user.state === STATES.AWAITING_NAME && text) {
			user.order.name = text
			user.state = STATES.AWAITING_PHONE
			await user.save()
			return bot.sendMessage(
				chatId,
				`Rahmat, <b>${text}</b>!\nEndi telefon raqamingizni yuboring:`,
				{
					parse_mode: 'HTML',
					reply_markup: {
						keyboard: [
							[{ text: '📱 Raqamni yuborish', request_contact: true }],
						],
						resize_keyboard: true,
						one_time_keyboard: true,
					},
				},
			)
		}

		if (user.state === STATES.AWAITING_PHONE) {
			let phone = msg.contact
				? msg.contact.phone_number
				: text && /^\+?[0-9\s\-]{9,15}$/.test(text)
					? text
					: null
			if (!phone)
				return bot.sendMessage(
					chatId,
					`⚠️ <b>Noto'g'ri format!</b>\nRaqamni to'g'ri kiriting yoki tugmani bosing.`,
					{ parse_mode: 'HTML' },
				)

			user.order.phone = phone
			user.state = STATES.AWAITING_LOCATION
			await user.save()
			return bot.sendMessage(
				chatId,
				`Ajoyib! Endi iltimos GPS yoqing va <b>Lokatsiya</b> yuboring:`,
				{
					parse_mode: 'HTML',
					reply_markup: {
						keyboard: [
							[
								{
									text: '📍 Manzilni (Lokatsiya) yuborish',
									request_location: true,
								},
							],
						],
						resize_keyboard: true,
						one_time_keyboard: true,
					},
				},
			)
		}

		if (user.state === STATES.AWAITING_LOCATION) {
			let lat = msg.location ? msg.location.latitude : null
			let lon = msg.location ? msg.location.longitude : null

			if (text && text.includes('http')) {
				const match = text.match(/(-?\d{1,3}\.\d+)[,%2C\s]+(-?\d{1,3}\.\d+)/)
				if (match) {
					lat = match[1]
					lon = match[2]
				}
			}

			if (!lat || !lon)
				return bot.sendMessage(
					chatId,
					`⚠️ <b>Manzil qabul qilinmadi!</b>\nTugmani bosing yoki to'g'ri xarita linkini yuboring.`,
					{ parse_mode: 'HTML' },
				)

			user.order.location = `Kenglik: ${lat}, Uzunlik: ${lon}`
			user.state = STATES.AWAITING_FOOD_SELECT
			await user.save()

			const foodMsg = `📍 Manzil qabul qilindi.\n\n🍔 <b>Qaysi taomni buyurtma qilmoqchisiz?</b>\n<i>Bitta taomni bir necha marta bosib miqdorini ko'paytirishingiz mumkin.</i>`
			// Savatchani ham yuboramiz (hozircha bo'sh)
			return bot.sendMessage(chatId, foodMsg, {
				parse_mode: 'HTML',
				...getInlineMenu('order', user.order.cart),
			})
		}
	} catch (error) {
		console.error(error)
	}
})

// === INLINE TUGMALAR (SAVATCHA VA TASDIQLASH) ===
bot.on('callback_query', async query => {
	const chatId = query.message?.chat?.id || query.from?.id
	const data = query.data

	if (!data || !chatId) {
		return bot.answerCallbackQuery(query.id, {
			text: "Noma'lum amal.",
			show_alert: true,
		})
	}

	try {
		const fromObj = query.from || query.message.from || {}
		const user = await getUserSession(chatId, fromObj)
		const [action, ...idParts] = data.split('_')
		const foodId = idParts.join('_')
		const selectedFood = dbFoods.find(f => f.id === foodId)

		// 1. Shunchaki menyudan ko'rish
		if (action === 'view' && selectedFood) {
			const foodInfo = `📋 <b>${selectedFood.name}</b>\n\n${selectedFood.description}\n\n💵 <b>Narxi:</b> ${selectedFood.price.toLocaleString()} so'm`
			await bot.sendMessage(chatId, foodInfo, { parse_mode: 'HTML' })
			await bot.answerCallbackQuery(query.id)
			return
		}

		// 2. Taomni savatchaga qo'shish (Miqdorni oshirish)
		else if (
			action === 'order' &&
			selectedFood &&
			user.state === STATES.AWAITING_FOOD_SELECT
		) {
			// Taom savatchada bormi tekshiramiz
			const existingItemIndex = user.order.cart.findIndex(
				item => item.id === selectedFood.id,
			)

			if (existingItemIndex > -1) {
				// Bor bo'lsa, sonini 1 taga oshiramiz
				user.order.cart[existingItemIndex].quantity += 1
			} else {
				// Yo'q bo'lsa, yangi qo'shamiz
				user.order.cart.push({
					id: selectedFood.id,
					name: selectedFood.name,
					price: selectedFood.price,
					quantity: 1,
				})
			}

			user.markModified('order.cart') // MongoDB ga array o'zgarganini aytish shart
			await user.save()

			// Xabardagi tugmalarni yangilab qo'yamiz (Miqdorlar ko'rinishi uchun)
			await bot.editMessageReplyMarkup(
				getInlineMenu('order', user.order.cart).reply_markup,
				{ chat_id: chatId, message_id: query.message.message_id },
			)
		}

		// 3. SAVATNI TOZALASH (Yangi inline tugma)
		else if (data === 'clear_cart') {
			// Bazadagi foydalanuvchining savatini tozalaymiz
			user.order.cart = []
			await user.save()

			// Xabarni yangilab, savat bo'shaganini bildiramiz
			return bot.editMessageText(
				'🗑 Savatingiz tozalandi. Iltimos, menyudan qaytadan taom tanlang:',
				{
					chat_id: chatId,
					message_id: query.message.message_id,
					reply_markup: {
						inline_keyboard: [
							[{ text: '🍔 Menyu', callback_data: 'open_menu' }], // Menyu qaytadan ochish uchun
						],
					},
				},
			)
		}

		// === 5. OPEN_MENU TUGMASI UCHUN QO'SHIMCHA (YANGI) ===
		else if (data === 'open_menu') {
			// Avval eski xabarni o'chiramiz yoki yangilaymiz
			await bot.deleteMessage(chatId, query.message.message_id).catch(() => {})

			// 1. Menyu rasmini yuboramiz
			const menuPhoto = await getTelegramSafeMenu()
			await bot.sendPhoto(chatId, menuPhoto.source, {
				caption:
					'📋 <b>Chef Food restorani menyusi</b>\nQuyidagi taomlardan birini tanlang:',
				parse_mode: 'HTML',
				filename: menuPhoto.filename,
			})

			// 2. Taomlar tugmachalarini chiqaramiz (hali buyurtma rejimida emas, shunchaki view)
			return bot.sendMessage(
				chatId,
				`😋 <b>Taomni tanlang va ustiga bosing:</b>`,
				{
					parse_mode: 'HTML',
					...getInlineMenu('view', user.order.cart),
				},
			)
		}

		// 4. BUYURTMANI TASDIQLASH (Oxirgi qadam)
		else if (
			data === 'confirm_order' &&
			user.state === STATES.AWAITING_FOOD_SELECT
		) {
			if (!user.order.cart || user.order.cart.length === 0) {
				return bot.answerCallbackQuery(query.id, {
					text: "Savatchangiz bo'sh!",
					show_alert: true,
				})
			}

			const totalSum = user.order.cart.reduce(
				(sum, item) => sum + item.price * item.quantity,
				0,
			)

			// Savatchadagi taomlarni chiroyli ro'yxatga aylantirish
			let cartText = ''
			user.order.cart.forEach((item, index) => {
				cartText += `${index + 1}. ${item.name} x ${item.quantity} = ${(item.price * item.quantity).toLocaleString()} so'm\n`
			})

			// Arxivga saqlash
			const newOrder = new Order({
				chatId: chatId,
				customerName: user.order.name,
				phoneNumber: user.order.phone,
				location: user.order.location,
				cart: user.order.cart,
				totalPrice: totalSum,
			})
			await newOrder.save()

			// Xabardagi tugmalarni o'chirib yuboramiz (buyurtma berib bo'lingani uchun)
			await bot.deleteMessage(chatId, query.message.message_id)

			// Mijozga chek
			const receipt =
				`✅ <b>BUYURTMA MUVAFFAQIYATLI QABUL QILINDI!</b> 🎉\n\n` +
				`👤 <b>Mijoz:</b> ${user.order.name}\n` +
				`📞 <b>Raqam:</b> ${user.order.phone}\n\n` +
				`🛒 <b>Buyurtmalar:</b>\n${cartText}\n` +
				`💵 <b>JAMI TO'LOV:</b> ${totalSum.toLocaleString()} so'm\n\n` +
				`🛵 <i>Tez orada operatorlarimiz siz bilan bog'lanadi.</i>`
			await bot.sendMessage(chatId, receipt, {
				parse_mode: 'HTML',
				...getMainMenu(),
			})

			// Adminga xabar va Lokatsiya
			const adminMsg =
				`🚨 <b>YANGI BUYURTMA KELDI!</b>\n\n` +
				`👤 <b>Mijoz:</b> ${user.order.name}\n` +
				`📞 <b>Telefon:</b> ${user.order.phone}\n` +
				`📍 <b>Manzil:</b> ${user.order.location}\n\n` +
				`🛒 <b>Taomlar ro'yxati:</b>\n${cartText}\n` +
				`💵 <b>Jami to'lov:</b> ${totalSum.toLocaleString()} so'm`
			await bot.sendMessage(ADMIN_CHAT_ID, adminMsg, { parse_mode: 'HTML' })

			if (user.order.location.includes('Kenglik')) {
				try {
					const parts = user.order.location.split(', ')
					const lat = parts[0].replace('Kenglik:', '').trim()
					const lon = parts[1].replace('Uzunlik:', '').trim()
					await bot.sendLocation(
						ADMIN_CHAT_ID,
						parseFloat(lat),
						parseFloat(lon),
					)
				} catch (e) {
					console.error(e)
				}
			}

			// Sessiyani tozalash
			user.state = STATES.IDLE
			user.order = { name: '', phone: '', location: '', cart: [] }
			await user.save()
		}

		await bot.answerCallbackQuery(query.id)
	} catch (error) {
		console.error('Callback xatoligi:', error)
		bot.answerCallbackQuery(query.id, {
			text: 'Xatolik yuz berdi.',
			show_alert: true,
		})
	}
})

// === KUTILMAGAN XATOLIKLARNI USHLASH VA BOTNI QUTQARISH ===

// 1. Polling xatoliklari (Telegram serveri bilan aloqa uzilsa)
bot.on('polling_error', error => {
	console.log('🔄 Polling xatoligi (Bot ishlashda davom etmoqda):', error.code)
})

// 2. Kutilmagan kod xatoliklari (Crash bo'lishning oldini oladi)
process.on('uncaughtException', error => {
	console.error('🔥 Kutilmagan xatolik (uncaughtException):', error)
	// Dastur shu yerdan o'lib qolmasdan ishlashda davom etadi
})

// 3. Ushlanmay qolgan Promise (async/await) xatoliklari
process.on('unhandledRejection', (reason, promise) => {
	console.error("⚠️ Ushlanmagan va'da xatoligi (unhandledRejection):", reason)
})
