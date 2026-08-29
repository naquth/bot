const ZODIAC = [
	{ sign: '♑ Capricorn', lastDay: 19 },
	{ sign: '♒ Aquarius', lastDay: 18 },
	{ sign: '♓ Pisces', lastDay: 20 },
	{ sign: '♈ Aries', lastDay: 19 },
	{ sign: '♉ Taurus', lastDay: 20 },
	{ sign: '♊ Gemini', lastDay: 20 },
	{ sign: '♋ Cancer', lastDay: 22 },
	{ sign: '♌ Leo', lastDay: 22 },
	{ sign: '♍ Virgo', lastDay: 22 },
	{ sign: '♎ Libra', lastDay: 22 },
	{ sign: '♏ Scorpio', lastDay: 21 },
	{ sign: '♐ Sagittarius', lastDay: 21 },
	{ sign: '♑ Capricorn', lastDay: 31 },
];

function getZodiac(day, month) {
	return day > ZODIAC[month - 1].lastDay ? ZODIAC[month].sign : ZODIAC[month - 1].sign;
}

module.exports = { getZodiac };
