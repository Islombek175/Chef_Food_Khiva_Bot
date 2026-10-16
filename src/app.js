import dotenv from 'dotenv'
import fs from 'fs'
import mongoose from 'mongoose'
import TelegramBot from 'node-telegram-bot-api'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const TOKEN = process.env.BOT_TOKEN
const MONGO_URI = process.env.MONGODB_URI
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 6480933576

if (!TOKEN) throw new Error('BOT_TOKEN is required')
if (!MONGO_URI) throw new Error('MONGODB_URI is required')

// ================= PERFORMANCE: BOT & CACHE =================
const bot = new TelegramBot(TOKEN, {
	polling: {
		interval: 300,
		autoStart: true,
		params: { timeout: 10 },
	},
})

// In-memory cache to avoid DB hit on every message (HUGE speed boost)
const userCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 min

// Pre-cache menu image once at startup (instead of sharp on every request)
let CACHED_MENU_PHOTO = null
async function initMenuCache() {
	const possiblePaths = [
		path.join(__dirname, 'menu.png'),
		path.join(__dirname, 'images', 'menu.png'),
		'/mnt/data/menu.png',
	]
	let foundPath = null
	for (const p of possiblePaths) {
		if (fs.existsSync(p)) {
			foundPath = p
			break
		}
	}
	if (!foundPath) {
		console.log('⚠️ menu.png topilmadi, rasm cache qilinmadi')
		return
	}
	try {
		const buffer = await sharp(foundPath)
			.resize({
				width: 1280,
				height: 1280,
				fit: 'inside',
				withoutEnlargement: true,
			})
			.jpeg({ quality: 80 })
			.toBuffer()
		CACHED_MENU_PHOTO = buffer
		console.log('✅ Menu rasmi cache qilindi (bir marta)')
	} catch (e) {
		console.error('Menu cache xatolik:', e.message)
	}
}

// ================= MONGODB =================
mongoose.set('strictQuery', true)
mongoose
	.connect(MONGO_URI)
	.then(() => console.log('✅ MongoDB ulandi!'))
	.catch(err => console.error('❌ MongoDB xatolik:', err))

const userSchema = new mongoose.Schema({
	chatId: { type: Number, required: true, unique: true, index: true },
	firstName: String,
	username: String,
	registeredAt: { type: Date, default: Date.now },
	lastActivity: { type: Date, default: Date.now },
	state: { type: String, default: 'IDLE' },
	currentCategory: { type: String, default: '' },
	order: {
		name: { type: String, default: '' },
		phone: { type: String, default: '' },
		location: { type: String, default: '' },
		cart: { type: Array, default: [] },
	},
})
const User = mongoose.model('User', userSchema)

const orderSchema = new mongoose.Schema({
	chatId: Number,
	customerName: String,
	phoneNumber: String,
	location: String,
	cart: Array,
	totalPrice: Number,
	status: { type: String, default: 'new' },
	orderedAt: { type: Date, default: Date.now },
})
const Order = mongoose.model('Order', orderSchema)

const STATES = {
	IDLE: 'IDLE',
	NAME: 'NAME',
	PHONE: 'PHONE',
	LOCATION: 'LOCATION',
	CATEGORY: 'CATEGORY',
	ITEMS: 'ITEMS',
	CART: 'CART',
}

// ================= FOOD DATABASE (from your menu.png) =================
// Prices are taken from your original code - update here if needed
// ================= UPDATED PRICES FROM YOUR 3 PHOTOS (Oct 9) =================
const dbFoods = [
	// from Screenshot_205832.png
	{ id: 'sendvich', name: 'SENDVICH', emoji: '🥪', price: 45000, cat: 'other' },
	{ id: 'xod2', name: 'XOD-DOG 2X', emoji: '🌭', price: 22000, cat: 'hotdog' },
	{ id: 'xod3', name: 'XOD-DOG 3X', emoji: '🌭', price: 25000, cat: 'hotdog' },
	{ id: 'doner', name: 'DONER', emoji: '🥙', price: 40000, cat: 'doner' },
	{ id: 'gibrid', name: 'GIBRID', emoji: '🌯', price: 40000, cat: 'hotdog' },
	{ id: 'chefdog', name: 'CHEF DOG', emoji: '🌭', price: 43000, cat: 'hotdog' },
	{ id: 'xanskiy', name: 'XANSKIY', emoji: '🌯', price: 28000, cat: 'lavash' },
	// from Screenshot_205800.png
	{
		id: 'abichniy',
		name: 'ABICHNIY',
		emoji: '🌭',
		price: 13000,
		priceRange: '13000-15000',
		cat: 'hotdog',
	},
	{
		id: 'nankebab',
		name: 'NAN KEBAB',
		emoji: '🥙',
		price: 45000,
		cat: 'doner',
	},
	{ id: 'orama', name: "O'RAMA GAM", emoji: '🌯', price: 40000, cat: 'doner' },
	{
		id: 'gamburger',
		name: 'GAMBURGER',
		emoji: '🍔',
		price: 30000,
		cat: 'burger',
	},
	{ id: 'chiz', name: 'CHIZBURGER', emoji: '🍔', price: 35000, cat: 'burger' },
	{ id: 'meat', name: 'MEAT BURGER', emoji: '🍔', price: 40000, cat: 'burger' },
	{ id: 'xaggi', name: 'XAGGI', emoji: '🌯', price: 45000, cat: 'lavash' },
	// from Screenshot_205841.png
	{
		id: 'chiz2',
		name: 'CHIZBURGER 2X',
		emoji: '🍔',
		price: 45000,
		cat: 'burger',
	},
	{
		id: 'xodpekin_t',
		name: 'XOD PEKIN TOVUQ',
		emoji: '🌯',
		price: 25000,
		cat: 'pekin',
	},
	{
		id: 'xodpekin_g',
		name: "XOD PEKIN GO'SHT",
		emoji: '🌯',
		price: 30000,
		cat: 'pekin',
	},
	{
		id: 'uzb',
		name: 'UZB GAMBURGER',
		emoji: '🍔',
		price: 20000,
		cat: 'burger',
	},
	{ id: 'shaurma', name: 'SHAURMA', emoji: '🌯', price: 30000, cat: 'doner' },
	{
		id: 'lavash_cl',
		name: 'LAVASH CLASSIC',
		emoji: '🌯',
		price: 40000,
		cat: 'lavash',
	},
	{
		id: 'lavash_bbq',
		name: 'LAVASH BBQ',
		emoji: '🌯',
		price: 35000,
		cat: 'lavash',
	},
	// extras not in new photos - keep old prices
	{
		id: 'patirli',
		name: 'PATIRLI GAM',
		emoji: '🍕',
		price: 15000,
		cat: 'burger',
	},
	{
		id: 'shaverma2',
		name: 'SHAVERMA 2X',
		emoji: '🌯',
		price: 35000,
		cat: 'doner',
	},
	{
		id: 'lavash2',
		name: 'LAVASH 2X',
		emoji: '🌯',
		price: 45000,
		cat: 'lavash',
	},
	{
		id: 'lavash_bbq2',
		name: 'LAVASH BBQ 2X',
		emoji: '🌯',
		price: 40000,
		cat: 'lavash',
	},
	{
		id: 'pekin_t2',
		name: 'PEKIN TOVUQ 2X',
		emoji: '🌯',
		price: 35000,
		cat: 'pekin',
	},
	{
		id: 'pekin_g2',
		name: "PEKIN GO'SHT 2X",
		emoji: '🌯',
		price: 38000,
		cat: 'pekin',
	},
	{ id: 'fri', name: 'FRI', emoji: '🍟', price: 15000, cat: 'other' },
]

const CATEGORIES = [
	{ id: 'lavash', name: '🌯 Lavashlar', desc: 'Lavash, Xaggi, Xanskiy' },
	{ id: 'burger', name: '🍔 Burgerlar', desc: 'Gamburger, Chizburger' },
	{ id: 'hotdog', name: '🌭 Xod-Doglar', desc: 'Oddiy, 2X, 3X, Chef' },
	{ id: 'doner', name: '🥙 Doner & Shaurma', desc: 'Doner, Shaverma' },
	{ id: 'pekin', name: '🍗 Pekin', desc: "Tovuq & Go'sht" },
	{ id: 'other', name: '🍟 Boshqalar', desc: 'Sendvich, Fri, Patirli' },
]

// ================= HELPERS - FAST =================
async function getUserSession(chatId, fromObj = {}) {
	// 1. Cache check
	const cached = userCache.get(chatId)
	if (cached && Date.now() - cached._cachedAt < CACHE_TTL) {
		return cached
	}
	// 2. DB
	let user = await User.findOne({ chatId })
	if (!user) {
		user = new User({
			chatId,
			firstName: fromObj.first_name || '',
			username: fromObj.username || '',
			state: STATES.IDLE,
		})
		await user.save()
		console.log(`👤 Yangi: ${user.firstName} (${chatId})`)
	}
	user._cachedAt = Date.now()
	userCache.set(chatId, user)
	return user
}

async function saveUser(user) {
	user.lastActivity = new Date()
	user._cachedAt = Date.now()
	user.markModified('order')
	user.markModified('order.cart')
	userCache.set(user.chatId, user)
	await user.save()
}

function formatPrice(n) {
	return n.toLocaleString('uz-UZ') + " so'm"
}

function getCartTotal(cart) {
	return cart.reduce((s, i) => s + i.price * i.quantity, 0)
}

function getCartText(cart) {
	if (!cart.length) return "🛒 Savat bo'sh"
	let t = '🛒 <b>Savatchangiz:</b>\n\n'
	cart.forEach((item, idx) => {
		t += `${idx + 1}. ${item.emoji || ''} ${item.name} — ${item.quantity} x ${formatPrice(item.price)} = <b>${formatPrice(item.price * item.quantity)}</b>\n`
	})
	t += `\n💵 <b>JAMI: ${formatPrice(getCartTotal(cart))}</b>`
	return t
}

// ================= KEYBOARDS - SIMPLE & BIG =================
function mainKeyboard() {
	return {
		reply_markup: {
			keyboard: [
				[{ text: '🛒 BUYURTMA BERISH' }],
				[{ text: '📋 Menyu rasm' }, { text: '🛍 Savatcham' }],
				[{ text: "📞 Biz bilan bog'lanish" }],
			],
			resize_keyboard: true,
			is_persistent: true,
		},
	}
}

function phoneKeyboard() {
	return {
		reply_markup: {
			keyboard: [
				[{ text: '📱 Raqamni yuborish', request_contact: true }],
				[{ text: '⬅️ Orqaga' }],
			],
			resize_keyboard: true,
			one_time_keyboard: true,
		},
	}
}

function locationKeyboard() {
	return {
		reply_markup: {
			keyboard: [
				[{ text: '📍 Lokatsiyani yuborish (Telefon uchun)' }],
				[
					{ text: '🗺 Google / Yandex Maps linki' },
					{ text: '✍️ Manzilni yozaman' },
				],
				[{ text: '⬅️ Orqaga' }],
			],
			resize_keyboard: true,
			one_time_keyboard: true,
		},
	}
}

function categoryInlineKeyboard() {
	const rows = CATEGORIES.map(c => [
		{ text: c.name, callback_data: `cat_${c.id}` },
	])
	rows.push([{ text: "🛍 Savatni ko'rish", callback_data: 'show_cart' }])
	return { reply_markup: { inline_keyboard: rows } }
}

function foodsInlineKeyboard(catId, cart = []) {
	const foods = dbFoods.filter(f => f.cat === catId)
	const keyboard = []
	foods.forEach(food => {
		const inCart = cart.find(c => c.id === food.id)
		const qty = inCart ? ` ✅ ${inCart.quantity} ta` : ''
		keyboard.push([
			{
				text: `${food.emoji} ${food.name} - ${formatPrice(food.price)}${qty}`,
				callback_data: `add_${food.id}`,
			},
		])
	})
	keyboard.push([{ text: "⬅️ Boshqa bo'lim", callback_data: 'back_cat' }])
	if (cart.length > 0) {
		keyboard.push([
			{
				text: `🛍 Savat (${formatPrice(getCartTotal(cart))})`,
				callback_data: 'show_cart',
			},
		])
	}
	return { reply_markup: { inline_keyboard: keyboard } }
}

function cartInlineKeyboard(cart) {
	const keyboard = []
	cart.forEach(item => {
		// Har bir taom uchun bitta ixcham qator: [-] [miqdori] [+] [❌]
		keyboard.push([
			{ text: '➖ Kamaytirish', callback_data: `dec_${item.id}` },
			{ text: `${item.quantity} ta`, callback_data: `noop` },
			{ text: "➕ Qo'shish", callback_data: `inc_${item.id}` },
			{ text: "❌ O'chirish", callback_data: `del_${item.id}` },
		])
	})
	if (cart.length > 0) {
		keyboard.push([
			{
				text: `✅ BUYURTMANI TASDIQLASH - ${formatPrice(getCartTotal(cart))}`,
				callback_data: 'confirm',
			},
		])
		keyboard.push([{ text: '🗑 Hammasini tozalash', callback_data: 'clear' }])
	}
	keyboard.push([{ text: "⬅️ Taom qo'shish", callback_data: 'back_cat' }])
	return { reply_markup: { inline_keyboard: keyboard } }
}

// ================= MESSAGE HANDLER =================
bot.on('message', async msg => {
	const chatId = msg.chat.id
	const text = msg.text?.trim()
	const contact = msg.contact
	const location = msg.location

	try {
		const user = await getUserSession(chatId, msg.from)

		// Global commands
		if (text === '/start') {
			user.state = STATES.IDLE
			user.order.cart = []
			user.currentCategory = ''
			await saveUser(user)
			return bot.sendMessage(
				chatId,
				`👨‍🍳 <b>Assalomu alaykum, ${msg.from.first_name || 'hurmatli mijoz'}!</b>\n\n` +
					`🍔 <b>Chef Food</b> ga xush kelibsiz!\n\n` +
					`👇 Pastdagi katta tugmadan buyurtma bering:\n` +
					`1️⃣ Ism va telefon\n` +
					`2️⃣ Manzil (1 tugma bosish)\n` +
					`3️⃣ Taom tanlash\n\n` +
					`Hammasi 1 daqiqada!`,
				{ parse_mode: 'HTML', ...mainKeyboard() },
			)
		}

		if (text === '⬅️ Orqaga' || text === '/cancel') {
			user.state = STATES.IDLE
			await saveUser(user)
			return bot.sendMessage(chatId, '🏠 Bosh menyu:', mainKeyboard())
		}

		// Main menu routing
		if (user.state === STATES.IDLE) {
			if (
				text === '🛒 BUYURTMA BERISH' ||
				text === '🚖 Dostavka' ||
				text === '/order'
			) {
				// If we already know name/phone, skip
				if (user.order.name && user.order.phone) {
					user.state = STATES.LOCATION
					await saveUser(user)
					return bot.sendMessage(
						chatId,
						`📍 <b>3️⃣ Manzilni yuboring</b>\n\n` +
							`Iltimos, avval telefoningizda <b>GPS / Joylashuv (Location)</b> ni yoqib qo'ying.\n` +
							`Keyin pastdagi <b>📍 Lokatsiyani yuborish</b> tugmasini bosing.`,
						{ parse_mode: 'HTML', ...locationKeyboard() },
					)
				}
				user.state = STATES.NAME
				await saveUser(user)
				return bot.sendMessage(
					chatId,
					`1️⃣ <b>Ismingizni yozing:</b>\n\nMasalan: <i>Anvar</i>`,
					{ parse_mode: 'HTML' },
				)
			}

			if (text === '📋 Menyu rasm' || text === '🍔 Menu' || text === '/menu') {
				if (CACHED_MENU_PHOTO) {
					await bot.sendPhoto(chatId, CACHED_MENU_PHOTO, {
						caption:
							'📋 <b>Chef Food menyusi</b>\n\nTaom tanlash uchun "🛒 BUYURTMA BERISH" ni bosing.',
						parse_mode: 'HTML',
					})
				}
				return bot.sendMessage(
					chatId,
					'👇 Qaysi turdagi taomni xohlaysiz?',
					categoryInlineKeyboard(),
				)
			}

			if (text === '🛍 Savatcham' || text === '/cart') {
				if (!user.order.cart.length) {
					return bot.sendMessage(
						chatId,
						"🛒 Savatingiz bo'sh.\n🛒 BUYURTMA BERISH ni bosing.",
						mainKeyboard(),
					)
				}
				return bot.sendMessage(chatId, getCartText(user.order.cart), {
					parse_mode: 'HTML',
					...cartInlineKeyboard(user.order.cart),
				})
			}

			if (text === "📞 Biz bilan bog'lanish" || text === 'ℹ️ Biz haqimizda') {
				return bot.sendMessage(
					chatId,
					`📌 <b>Chef Food</b>\n\n📍 <b>Manzil:</b> Xiva, Qosmo Poliklinika yaqinida\n📞 <b>Tel:</b> +998 99 116 16 51\n⏰ <b>Vaqt:</b> 09:00 - 23:00\n🚖 <b>Dostavka:</b> Tez va bepul\n\nSavol bo'lsa telefon qiling!`,
					{ parse_mode: 'HTML' },
				)
			}
		}

		// STEP 1: NAME
		if (user.state === STATES.NAME && text && !text.startsWith('/')) {
			if (text.length < 2)
				return bot.sendMessage(chatId, 'Ism juda qisqa, qaytadan yozing:')
			user.order.name = text
			user.state = STATES.PHONE
			await saveUser(user)
			return bot.sendMessage(
				chatId,
				`Rahmat, <b>${text}</b>! 👍\n\n2️⃣ <b>Telefon raqamingizni yuboring:</b>\nPastdagi tugmani bosing.`,
				{ parse_mode: 'HTML', ...phoneKeyboard() },
			)
		}

		// STEP 2: PHONE
		if (user.state === STATES.PHONE) {
			let phone = null
			if (contact) phone = contact.phone_number
			else if (text && /^\+?[0-9\s\-()]{9,15}$/.test(text)) phone = text

			if (!phone) {
				return bot.sendMessage(
					chatId,
					"⚠️ Iltimos raqamni tugma orqali yuboring yoki to'g'ri yozing. Masalan: +998901234567",
					phoneKeyboard(),
				)
			}
			user.order.phone = phone
			user.state = STATES.LOCATION
			await saveUser(user)
			return bot.sendMessage(
				chatId,
				`✅ Raqam qabul qilindi!\n\n` +
					`3️⃣ <b>Oxirgi qadam - manzil</b>\n\n` +
					`🙏 Iltimos, avval telefoningizda <b>GPS ni yoqing</b> - aks holda joylashuv yuborilmaydi.\n\n` +
					`🔹 iPhone: Sozlamalar → Maxfiylik → Joylashuv xizmatlari → Yoqish\n` +
					`🔹 Android: Ekran tepasidan pastga tushiring → 📍 Joylashuv ni yoqing\n\n` +
					`Tayyor bo'lgach pastdagi tugmani bosing 👇`,
				{ parse_mode: 'HTML', ...locationKeyboard() },
			)
		}

		// STEP 3: LOCATION
		// STEP 3: LOCATION
		if (user.state === STATES.LOCATION) {
			let lat = null,
				lon = null,
				addrText = ''

			if (location) {
				lat = location.latitude
				lon = location.longitude
			} else if (
				text === '✍️ Manzilni yozaman' ||
				text === '🗺 Google / Yandex Maps linki'
			) {
				return bot.sendMessage(
					chatId,
					'💻 <b>Kompyuter (Desktop) foydalanuvchilari uchun:</b>\n\n' +
						'1. Google Maps yoki Yandex Maps ga kiring.\n' +
						"2. O'z manzilingizni tanlab, uning <b>linkini (havolasini)</b> nusxalang va shu yerga yuboring.\n" +
						"3. Yoki uyingiz manzilibni matn ko'rinishida yozib yuboring (masalan: <i>Xiva shahar, Pahlavon Mahmud ko'chasi, 12-uy</i>).",
					{ parse_mode: 'HTML' },
				)
			} else if (text && text.length > 5 && !text.includes('BUYURTMA')) {
				// User typed address manually or sent a map link
				addrText = text
			} else if (text && text.includes('http')) {
				const m = text.match(/(-?\d+\.\d+)[,%2C\s]+(-?\d+\.\d+)/)
				if (m) {
					lat = m[1]
					lon = m[2]
				} else {
					// Agar koordinata topilmasa ham, linkning o'zini manzil sifatida saqlab qolamiz
					addrText = text
				}
			}

			if (!lat && !lon && !addrText) {
				return bot.sendMessage(
					chatId,
					'⚠️ Manzil qabul qilinmadi!\n\n' +
						"Iltimos, xarita havolasini (linkini) yoki manzilingizni matn ko'rinishida yuboring.",
					locationKeyboard(),
				)
			}

			if (addrText) user.order.location = addrText
			else user.order.location = `Kenglik: ${lat}, Uzunlik: ${lon}`

			user.state = STATES.CATEGORY
			await saveUser(user)

			return bot.sendMessage(
				chatId,
				`📍 <b>Manzil qabul qilindi!</b>\n\n4️⃣ Endi <b>taom turini tanlang:</b>`,
				{ parse_mode: 'HTML', ...categoryInlineKeyboard() },
			)
		}

		// If user types while in category/items, show categories
		if (
			(user.state === STATES.CATEGORY || user.state === STATES.ITEMS) &&
			text
		) {
			return bot.sendMessage(
				chatId,
				'👇 Taom turini tanlang:',
				categoryInlineKeyboard(),
			)
		}
	} catch (e) {
		console.error('Message error:', e)
		bot
			.sendMessage(chatId, '⚠️ Xatolik yuz berdi. /start ni bosing.')
			.catch(() => {})
	}
})

// ================= CALLBACK (INLINE BUTTONS) =================
bot.on('callback_query', async query => {
	const chatId = query.message.chat.id
	const data = query.data

	try {
		const user = await getUserSession(chatId, query.from)

		// Ignore
		if (data === 'noop') {
			return bot.answerCallbackQuery(query.id)
		}

		// Category selected
		if (data.startsWith('cat_')) {
			const catId = data.replace('cat_', '')
			user.currentCategory = catId
			user.state = STATES.ITEMS
			await saveUser(user)
			const cat = CATEGORIES.find(c => c.id === catId)
			await bot.editMessageText(
				`<b>${cat.name}</b> - ${cat.desc}\n\nTaom ustiga bosing:`,
				{
					chat_id: chatId,
					message_id: query.message.message_id,
					parse_mode: 'HTML',
					...foodsInlineKeyboard(catId, user.order.cart),
				},
			)
			return bot.answerCallbackQuery(query.id, { text: cat.name })
		}

		// Add food to cart
		if (data.startsWith('add_')) {
			if (user.state !== STATES.ITEMS && user.state !== STATES.CATEGORY) {
				// If user tries to add before giving info, redirect to order
				return bot.answerCallbackQuery(query.id, {
					text: 'Avval buyurtma berishni boshlang!',
					show_alert: true,
				})
			}
			const foodId = data.replace('add_', '')
			const food = dbFoods.find(f => f.id === foodId)
			if (!food) return bot.answerCallbackQuery(query.id, { text: 'Topilmadi' })

			const idx = user.order.cart.findIndex(i => i.id === foodId)
			if (idx > -1) user.order.cart[idx].quantity += 1
			else
				user.order.cart.push({
					id: foodId,
					name: food.name,
					emoji: food.emoji,
					price: food.price,
					quantity: 1,
				})

			await saveUser(user)
			// Update buttons to show quantity
			await bot
				.editMessageReplyMarkup(
					foodsInlineKeyboard(user.currentCategory, user.order.cart)
						.reply_markup,
					{ chat_id: chatId, message_id: query.message.message_id },
				)
				.catch(() => {})
			return bot.answerCallbackQuery(query.id, {
				text: `${food.name} qo'shildi ✅`,
			})
		}

		// Cart operations
		if (
			data.startsWith('inc_') ||
			data.startsWith('dec_') ||
			data.startsWith('del_')
		) {
			const action = data.split('_')[0]
			const foodId = data.substring(4)
			const idx = user.order.cart.findIndex(i => i.id === foodId)
			if (idx === -1) return bot.answerCallbackQuery(query.id)

			if (action === 'inc') user.order.cart[idx].quantity += 1
			if (action === 'dec') {
				user.order.cart[idx].quantity -= 1
				if (user.order.cart[idx].quantity <= 0) user.order.cart.splice(idx, 1)
			}
			if (action === 'del') user.order.cart.splice(idx, 1)

			await saveUser(user)

			if (user.order.cart.length === 0) {
				await bot.editMessageText(
					"🗑 Savat bo'shatildi.\nYana taom qo'shing:",
					{
						chat_id: chatId,
						message_id: query.message.message_id,
						...categoryInlineKeyboard(),
					},
				)
			} else {
				await bot.editMessageText(getCartText(user.order.cart), {
					chat_id: chatId,
					message_id: query.message.message_id,
					parse_mode: 'HTML',
					...cartInlineKeyboard(user.order.cart),
				})
			}
			return bot.answerCallbackQuery(query.id)
		}

		if (data === 'show_cart') {
			if (!user.order.cart.length) {
				return bot.answerCallbackQuery(query.id, {
					text: "Savat bo'sh!",
					show_alert: true,
				})
			}
			await bot.editMessageText(getCartText(user.order.cart), {
				chat_id: chatId,
				message_id: query.message.message_id,
				parse_mode: 'HTML',
				...cartInlineKeyboard(user.order.cart),
			})
			return bot.answerCallbackQuery(query.id)
		}

		if (data === 'back_cat') {
			user.state = STATES.CATEGORY
			await saveUser(user)
			await bot.editMessageText('👇 Qaysi turdagi taomni xohlaysiz?', {
				chat_id: chatId,
				message_id: query.message.message_id,
				...categoryInlineKeyboard(),
			})
			return bot.answerCallbackQuery(query.id)
		}

		if (data === 'clear') {
			user.order.cart = []
			await saveUser(user)
			await bot.editMessageText('🗑 Savat tozalandi.\nYangi taom tanlang:', {
				chat_id: chatId,
				message_id: query.message.message_id,
				...categoryInlineKeyboard(),
			})
			return bot.answerCallbackQuery(query.id, { text: 'Tozalandi' })
		}

		// CONFIRM ORDER - Final step
		if (data === 'confirm') {
			if (!user.order.cart.length) {
				return bot.answerCallbackQuery(query.id, {
					text: "Savat bo'sh!",
					show_alert: true,
				})
			}
			const total = getCartTotal(user.order.cart)
			let cartText = ''
			user.order.cart.forEach((it, i) => {
				cartText += `${i + 1}. ${it.name} x ${it.quantity} = ${formatPrice(it.price * it.quantity)}\n`
			})

			// Save to archive
			const newOrder = new Order({
				chatId,
				customerName: user.order.name,
				phoneNumber: user.order.phone,
				location: user.order.location,
				cart: user.order.cart,
				totalPrice: total,
			})
			await newOrder.save()

			// Client receipt (Yaxshilangan UX)
			await bot.deleteMessage(chatId, query.message.message_id).catch(() => {})
			await bot.sendMessage(
				chatId,
				`✅ <b>BUYURTMANINGIZ QABUL QILINDI!</b> 🎉\n\n` +
					`👤 <b>Mijoz:</b> ${user.order.name}\n` +
					`📞 <b>Telefon:</b> ${user.order.phone}\n\n` +
					`🛒 <b>Buyurtma tarkibi:</b>\n${cartText}\n` +
					`💵 <b>JAMI TO'LOV: ${formatPrice(total)}</b>\n\n` +
					`⏱ <b>Taxminiy yetkazib berish vaqti:</b> 20-30 daqiqa\n` +
					`💳 <b>To'lov turi:</b> Kuryer kelganda naqd pul yoki karta orqali\n\n` +
					`ℹ️ <i>Ma'lumotlarni aniqlashtirish zarur bo'lsagina operatorimiz siz bilan bog'lanadi. Yoqimli ishtaha!</i>`,
				{ parse_mode: 'HTML', ...mainKeyboard() },
			)

			// Admin
			const adminMsg =
				`🚨 <b>YANGI BUYURTMA #${newOrder._id.toString().slice(-5).toUpperCase()}</b>\n\n` +
				`👤 ${user.order.name} (@${user.username || 'yoq'})\n` +
				`📞 ${user.order.phone}\n` +
				`📍 ${user.order.location}\n\n` +
				`🛒\n${cartText}\n` +
				`💵 ${formatPrice(total)}\n` +
				`🕒 ${new Date().toLocaleString('uz-UZ')}`

			await bot.sendMessage(ADMIN_CHAT_ID, adminMsg, { parse_mode: 'HTML' })

			// Location if GPS
			if (user.order.location.includes('Kenglik')) {
				try {
					const parts = user.order.location.split(',')
					const lat = parseFloat(parts[0].replace('Kenglik:', '').trim())
					const lon = parseFloat(parts[1].replace('Uzunlik:', '').trim())
					if (!isNaN(lat) && !isNaN(lon)) {
						await bot.sendLocation(ADMIN_CHAT_ID, lat, lon)
					}
				} catch {}
			}

			// Reset but keep name/phone for next order (adults love this)
			user.order.cart = []
			user.state = STATES.IDLE
			await saveUser(user)
			return bot.answerCallbackQuery(query.id, {
				text: 'Buyurtma yuborildi! ✅',
			})
		}
	} catch (e) {
		console.error('Callback error:', e)
		bot
			.answerCallbackQuery(query.id, { text: 'Xatolik', show_alert: true })
			.catch(() => {})
	}
})

// ================= ERROR HANDLERS =================
bot.on('polling_error', err => console.log('Polling:', err.code))
process.on('uncaughtException', err => console.error('uncaughtException:', err))
process.on('unhandledRejection', r => console.error('unhandledRejection:', r))

// Init
initMenuCache()
console.log('🤖 Chef Food Bot - FAST & SIMPLE mode started')

// Graceful
process.on('SIGINT', async () => {
	await mongoose.disconnect()
	process.exit(0)
})
