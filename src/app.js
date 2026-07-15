import dotenv from 'dotenv'
import mongoose from 'mongoose'
import TelegramBot from 'node-telegram-bot-api'
const ADMIN_CHAT_ID = 6480933576

dotenv.config()

const TOKEN = process.env.BOT_TOKEN

const MONGO_URI = process.env.MONGODB_URI

const bot = new TelegramBot(TOKEN, { polling: true })

// === MONGODB BOG'LANISHI VA MODEL YARATISH ===

mongoose
	.connect(MONGO_URI)
	.then(() => console.log('✅ MongoDB ga muvaffaqiyatli ulandi!'))
	.catch(err => console.error('❌ MongoDB ga ulanishda xatolik:', err))

// 1. Foydalanuvchi sessiyasi (vaqtinchalik jarayon) sxemasi
const userSchema = new mongoose.Schema({
	chatId: { type: Number, required: true, unique: true },
	state: { type: String, default: 'IDLE' },
	order: {
		name: { type: String, default: '' },
		phone: { type: String, default: '' },
		location: { type: String, default: '' },
		foodName: { type: String, default: '' },
		foodPrice: { type: Number, default: 0 },
	},
})
const User = mongoose.model('User', userSchema)

// 2. YANGI: Tugallangan buyurtmalar tarixi sxemasi (Arxiv uchun)
const orderSchema = new mongoose.Schema({
	chatId: Number,
	customerName: String,
	phoneNumber: String,
	location: String,
	foodName: String,
	foodPrice: Number,
	orderedAt: { type: Date, default: Date.now }, // Buyurtma qilingan vaqt
})
const Order = mongoose.model('Order', orderSchema)

// Sessiya holatlari
const STATES = {
	IDLE: 'IDLE',
	AWAITING_NAME: 'AWAITING_NAME',
	AWAITING_PHONE: 'AWAITING_PHONE',
	AWAITING_LOCATION: 'AWAITING_LOCATION',
	AWAITING_FOOD_SELECT: 'AWAITING_FOOD_SELECT',
}

// === BAZA VA SOZLAMALAR ===
const DEFAULT_IMAGE =
	'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500'

const dbFoods = Array.from({ length: 15 }, (_, i) => ({
	id: `food_${i + 1}`,
	name: `🍽 Taom #${i + 1}`,
	description: `Eng sara masaliqlardan tayyorlangan maxsus taom. Mazasi og'zingizda qoladi!`,
	price: 25000 + i * 2000,
	image: DEFAULT_IMAGE,
}))

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

const getInlineMenu = (actionPrefix = 'view') => {
	const keyboard = []
	let row = []
	dbFoods.forEach((food, index) => {
		row.push({ text: food.name, callback_data: `${actionPrefix}_${food.id}` })
		if (row.length === 2 || index === dbFoods.length - 1) {
			keyboard.push(row)
			row = []
		}
	})
	return { reply_markup: { inline_keyboard: keyboard } }
}

const getUserSession = async chatId => {
	let user = await User.findOne({ chatId })
	if (!user) {
		user = new User({ chatId, state: STATES.IDLE })
		await user.save()
	}
	return user
}

// === XABARLARNI QABUL QILISH ===
bot.on('message', async msg => {
	const chatId = msg.chat.id
	const text = msg.text

	try {
		const user = await getUserSession(chatId)

		if (text === '/start') {
			user.state = STATES.IDLE
			user.order = {
				name: '',
				phone: '',
				location: '',
				foodName: '',
				foodPrice: 0,
			}
			await user.save()

			const welcomeMsg =
				`<b>Assalomu alaykum, ${msg.from.first_name}!</b> 👨‍🍳\n\n` +
				`Restoranimizning rasmiy botiga xush kelibsiz. Quyidagi menyudan kerakli bo'limni tanlang:`
			return bot.sendMessage(chatId, welcomeMsg, {
				parse_mode: 'HTML',
				...getMainMenu(),
			})
		}

		if (user.state === STATES.IDLE) {
			if (text === '🍔 Menu') {
				const msgText = `😋 <b>Bizning taomnomamiz:</b>\n<i>Ma'lumot olish uchun taomni tanlang.</i>`
				return bot.sendMessage(chatId, msgText, {
					parse_mode: 'HTML',
					...getInlineMenu('view'),
				})
			} else if (text === '🚖 Dostavka') {
				user.state = STATES.AWAITING_NAME
				user.order = {
					name: '',
					phone: '',
					location: '',
					foodName: '',
					foodPrice: 0,
				}
				await user.save()
				return bot.sendMessage(
					chatId,
					`📝 <b>Buyurtma rasmiylashtirishni boshlaymiz.</b>\n\nIltimos, ismingizni kiriting:`,
					{ parse_mode: 'HTML' },
				)
			} else if (text === 'ℹ️ Biz haqimizda') {
				return bot.sendMessage(
					chatId,
					`🏢 <b>Bizning Restoran</b>\nManzil: Toshkent shahar...\nIsh vaqti: 09:00 - 23:00\nTelefon: +998901234567`,
					{ parse_mode: 'HTML' },
				)
			}
		}

		// 1. Ism
		if (user.state === STATES.AWAITING_NAME && text) {
			user.order.name = text
			user.state = STATES.AWAITING_PHONE
			await user.save()

			const phoneKeyboard = {
				reply_markup: {
					keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }]],
					resize_keyboard: true,
					one_time_keyboard: true,
				},
			}
			return bot.sendMessage(
				chatId,
				`Rahmat, <b>${text}</b>!\n\nEndi pastdagi tugmani bosib, telefon raqamingizni yuboring yoki qo'lda yozing:`,
				{ parse_mode: 'HTML', ...phoneKeyboard },
			)
		}

		// 2. Raqam
		if (user.state === STATES.AWAITING_PHONE) {
			const phone = msg.contact ? msg.contact.phone_number : text
			if (!phone)
				return bot.sendMessage(
					chatId,
					`⚠️ Iltimos, raqamingizni to'g'ri kiriting.`,
				)

			user.order.phone = phone
			user.state = STATES.AWAITING_LOCATION
			await user.save()

			const locationKeyboard = {
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
			}
			return bot.sendMessage(
				chatId,
				`Ajoyib! 📞 Raqam qabul qilindi.\n\nYetkazib berish manzilini aniq bilishimiz uchun pastdagi tugma orqali <b>Lokatsiya</b> yuboring:`,
				{ parse_mode: 'HTML', ...locationKeyboard },
			)
		}

		// 3. Lokatsiya
		if (user.state === STATES.AWAITING_LOCATION) {
			user.order.location = msg.location
				? `Kenglik: ${msg.location.latitude}, Uzunlik: ${msg.location.longitude}`
				: text
			user.state = STATES.AWAITING_FOOD_SELECT
			await user.save()

			const foodMsg = `📍 Manzil qabul qilindi.\n\n🍔 <b>Qaysi taomni buyurtma qilmoqchisiz?</b>\nIltimos, tanlang:`
			return bot.sendMessage(chatId, foodMsg, {
				parse_mode: 'HTML',
				...getInlineMenu('order'),
			})
		}
	} catch (error) {
		console.error('Xatolik yuz berdi:', error)
		bot.sendMessage(
			chatId,
			`⚠️ Kechirasiz, tizimda xatolik yuz berdi. Iltimos /start buyrug'ini bosing.`,
		)
	}
})

// === INLINE TUGMALAR ===
bot.on('callback_query', async query => {
	const chatId = query.message.chat.id
	const data = query.data

	try {
		const user = await getUserSession(chatId)

		const [action, ...idParts] = data.split('_')
		const foodId = idParts.join('_')
		const selectedFood = dbFoods.find(f => f.id === foodId)

		if (action === 'view' && selectedFood) {
			const caption =
				`<b>${selectedFood.name}</b>\n\n` +
				`📋 <b>Tarkibi:</b> ${selectedFood.description}\n` +
				`💵 <b>Narxi:</b> ${selectedFood.price.toLocaleString()} so'm`

			await bot.sendPhoto(chatId, selectedFood.image, {
				caption: caption,
				parse_mode: 'HTML',
			})
		}

		// TAOM TANLASH VA BAZAGA SAQLASH
		// TAOM TANLASH VA BAZAGA SAQLASH
		else if (
			action === 'order' &&
			selectedFood &&
			user.state === STATES.AWAITING_FOOD_SELECT
		) {
			// 1. Yangi buyurtmani bazaga (arxivga) saqlaymiz!
			const newOrder = new Order({
				chatId: chatId,
				customerName: user.order.name,
				phoneNumber: user.order.phone,
				location: user.order.location,
				foodName: selectedFood.name,
				foodPrice: selectedFood.price,
			})
			await newOrder.save()

			// 2. Mijozga chek yuboramiz
			const receipt =
				`✅ <b>BUYURTMA MUVAFFAQIYATLI QABUL QILINDI!</b> 🎉\n\n` +
				`👤 <b>Mijoz:</b> ${user.order.name}\n` +
				`📞 <b>Raqam:</b> ${user.order.phone}\n` +
				`📍 <b>Manzil:</b> <i>Qabul qilingan</i>\n` +
				`🍔 <b>Taom:</b> ${selectedFood.name}\n` +
				`💵 <b>Jami to'lov:</b> ${selectedFood.price.toLocaleString()} so'm\n\n` +
				`🛵 <i>Tez orada operatorlarimiz siz bilan bog'lanadi. Xaridingiz uchun rahmat!</i>`

			await bot.sendMessage(chatId, receipt, {
				parse_mode: 'HTML',
				...getMainMenu(),
			})

			// ==========================================
			// 3. YANGI: ADMINGA XABAR YUBORISH QISMI
			// ==========================================
			const adminMsg = `🚨 <b>YANGI BUYURTMA KELDI!</b>\n\n👤 <b>Mijoz:</b> ${user.order.name}\n📞 <b>Telefon:</b> ${user.order.phone}\n📍 <b>Manzil matni:</b> ${user.order.location}\n🍔 <b>Taom:</b> ${selectedFood.name}`
			await bot.sendMessage(ADMIN_CHAT_ID, adminMsg, { parse_mode: 'HTML' })

			// Lokatsiya matnidan sonlarni ajratib olib, xarita yuborish
			if (user.order.location.includes('Kenglik:')) {
				try {
					// Matnni tozalaymiz: "Kenglik: 41.387256, Uzunlik: 60.362101" -> 41.387256 va 60.362101
					const parts = user.order.location.split(', ')
					const lat = parts[0].replace('Kenglik: ', '').trim()
					const lon = parts[1].replace('Uzunlik: ', '').trim()

					// Adminga xaritani yuboramiz
					await bot.sendLocation(
						ADMIN_CHAT_ID,
						parseFloat(lat),
						parseFloat(lon),
					)
				} catch (e) {
					console.error('Xarita yuborishda xatolik:', e)
				}
			}
			// ==========================================

			// 4. User sessiyasini (vaqtinchalik xotirani) tozalaymiz
			user.state = STATES.IDLE
			user.order = {
				name: '',
				phone: '',
				location: '',
				foodName: '',
				foodPrice: 0,
			}
			await user.save()
		}

		await bot.answerCallbackQuery(query.id)
	} catch (error) {
		console.error('Callback xatoligi:', error)
		bot.answerCallbackQuery(query.id, {
			text: "Xatolik yuz berdi. Qaytadan urinib ko'ring.",
			show_alert: true,
		})
	}

	// ... oldingi kodlar ...

	// Lokatsiyani linkka aylantiruvchi qism
	const lat = msg.location ? msg.location.latitude : null
	const lon = msg.location ? msg.location.longitude : null
	const mapLink =
		lat && lon
			? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
			: user.order.location

	const adminMsg =
		`🚨 <b>YANGI BUYURTMA KELDI!</b>\n\n` +
		`👤 <b>Mijoz:</b> ${user.order.name}\n` +
		`📞 <b>Telefon:</b> ${user.order.phone}\n` +
		`📍 <b>Manzil:</b> ${mapLink}\n` + // Endi bu yerda link chiqadi
		`🍔 <b>Taom:</b> ${selectedFood.name}\n` +
		`💵 <b>To'lov:</b> ${selectedFood.price.toLocaleString()} so'm`

	await bot.sendMessage(ADMIN_CHAT_ID, adminMsg, { parse_mode: 'HTML' })

	// AGAR ADMINGA XARITANI O'ZINI YUBORMANGIZ KELSA (Qo'shimcha):
	if (lat && lon) {
		await bot.sendLocation(ADMIN_CHAT_ID, lat, lon)
	}
})
