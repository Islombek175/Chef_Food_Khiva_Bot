const foodsKeyboard = {
	reply_markup: {
		inline_keyboard: [
			[
				{ text: '🍔 Burger', callback_data: 'select_burger' },
				{ text: '🌯 Lavash', callback_data: 'select_lavash' },
			],
			[
				{ text: '🍕 Pizza', callback_data: 'select_pizza' },
				{ text: '🌭 Hot-Dog', callback_data: 'select_hot_dog' },
			],
			[{ text: '🥙 Non Kebab', callback_data: 'select_non_kebab' }],
			[{ text: '🔙 Asosiy menyu', callback_data: 'back_main' }],
		],
	},
}

export default foodsKeyboard
