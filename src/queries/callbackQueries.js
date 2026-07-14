export const handleFoodSelection = (bot, chatId, data, replyMarkup) => {
	switch (data) {
		case 'select_burger':
			bot.sendPhoto(chatId, './assets/foods/burger.jpg', {
				caption: `
🍔 <b>Chicken Burger</b>

💰 Narxi: <b>45 000 so'm</b>

🥬 Tarkibi:
• Tovuq go'shti
• Pishloq
• Pomidor
• Salat
• Maxsus sous
`,
				parse_mode: 'HTML',
				reply_markup: {
					keyboard: [[{ text: '🏠 Asosiy menyu' }]],
					resize_keyboard: true,
				},
			})
			break
		case 'select_lavash':
			bot.sendPhoto(chatId, './assets/foods/lavash.jpg', {
				caption: `
🌯 <b>Chicken Lavash</b>

💰 Narxi: <b>38 000 so'm</b>

🥬 Tarkibi:
• Lavash noni
• Tovuq go'shti
• Kartoshka fri
• Pomidor
• Bodring
• Pishloq
• Maxsus sous
`,
				parse_mode: 'HTML',
				reply_markup: {
					keyboard: [[{ text: '🏠 Asosiy menyu' }]],
					resize_keyboard: true,
				},
			})
			break
		case 'select_pizza':
		case 'select_hot_dog':
			bot.sendPhoto(chatId, "./assets/foods/hotdog.jpg", {
  caption: `
🌭 <b>Classic Hot Dog</b>

💰 Narxi: <b>25 000 so'm</b>

🥬 Tarkibi:
• Sosiska
• Hot Dog bulochkasi
• Ketchup
• Mayonez
• Xantal
• Qovurilgan piyoz
`,
				parse_mode: 'HTML',
				reply_markup: {
					keyboard: [[{ text: '🏠 Asosiy menyu' }]],
					resize_keyboard: true,
				},
});
			break
		case 'select_non_kebab':
			bot.sendMessage(
				chatId,
				`Siz ${data.replace('select_', '').replace(/_/g, ' ')}ni tanladingiz. 👍`,
			)
			break
		case 'back_main':
			bot.sendMessage(chatId, 'Asosiy menyuga qaytildi.', replyMarkup)
			break
		default:
			bot.sendMessage(chatId, "Noma'lum tanlov. Iltimos qayta urinib ko'ring.")
	}
}
