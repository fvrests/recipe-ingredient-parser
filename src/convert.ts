import { i18nMap, SupportedLanguages } from "./i18n/index.js";

function keepThreeDecimals(val: number, delimiter: string): string {
	const strVal = val.toString();
	return (
		strVal.split(".")[0] + delimiter + strVal.split(".")[1].substring(0, 3)
	);
}

export function convertFromFraction(
	value: string,
	language: SupportedLanguages
): string {
	const { isCommaDelimited } = i18nMap[language];

	const delimiter = isCommaDelimited ? "," : ".";

	// number comes in, for example: 1 1/3
	if (value && value.split(" ").length > 1) {
		const [whole, fraction] = value.split(" ");
		const [a, b] = fraction.split("/");
		const remainder = parseFloat(a) / parseFloat(b);
		const wholeAndFraction = parseInt(whole)
			? parseInt(whole) + remainder
			: remainder;
		return keepThreeDecimals(wholeAndFraction, delimiter);
	} else if (!value || value.split("-").length > 1) {
		return value;
	} else {
		const [a, b] = value.split("/");
		return b ? keepThreeDecimals(parseFloat(a) / parseFloat(b), delimiter) : a;
	}
}

export function getFirstMatch(line: string, regex: RegExp): string {
	const match = line.match(regex);
	return (match && match[0]) || "";
}

const unicodeObj: { [key: string]: string } = {
	"½": "1/2",
	"⅓": "1/3",
	"⅔": "2/3",
	"¼": "1/4",
	"¾": "3/4",
	"⅕": "1/5",
	"⅖": "2/5",
	"⅗": "3/5",
	"⅘": "4/5",
	"⅙": "1/6",
	"⅚": "5/6",
	"⅐": "1/7",
	"⅛": "1/8",
	"⅜": "3/8",
	"⅝": "5/8",
	"⅞": "7/8",
	"⅑": "1/9",
	"⅒": "1/10",
};

// fix: deal with numbers that are combined in non-english languages - e.g.
// German einhundert / zweihunderttausend(https://mylanguagebreak.com/basics-of-german-numbering/) &
// Italian duecento / seimila
// right now, is tested / handled but must be "due-cento" / "sei-mila"
// (https://www.italyheritage.com/learn-italian/course/grammar/numbers.htm)
export function parseWrittenNumber(
	input: string,
	language: SupportedLanguages
): [quantity: string | null, restOfIngredient: string] {
	// split string by 1 or more whitespace characters or dashes
	const sections = input.split(/[\s-]+/);
	console.log({ sections });
	let [smallValue, result]: number[] = [0, 0];
	let restOfIngredient: string = input;
	const { numbersSmall, numbersMagnitude } = i18nMap[language];

	let previousMatch: number | null = null;
	const processMatch = (
		match: number,
		type: "small" | "magnitude",
		trimFromIngredient: string
	) => {
		if (type === "small") {
			smallValue += match;
		} else {
			// previous match was a magnitude value
			if (previousMatch && previousMatch >= 100) {
				result = result * match;
			} else {
				// previous match was a small value
				result += (smallValue ? smallValue : 1) * match;
			}
			smallValue = 0;
		}
		if (trimFromIngredient) {
			let partialRegex = new RegExp(`^${trimFromIngredient}\\s*`, "g");
			restOfIngredient = restOfIngredient.replace(partialRegex, "");
			console.log({ restOfIngredient });
			// todo: process rest of section if partial match found
			// if (restOfIngredient.length > 0) {
			// 	processSection(restOfIngredient);
			// }
			previousMatch = match;
			return true;
		}
	};
	const parseSection = (section: string) => {
		let match: number = numbersSmall[section];
		// entire string matches small value
		if (!!match) {
			console.log("small match", match);
			processMatch(match, "small", section);
			return true;
		}
		// entire string matches magnitude value
		match = numbersMagnitude[section];
		if (!!match) {
			console.log("magnitude match", match);
			processMatch(match, "magnitude", section);
			return true;
		}
		// starts with small value
		let partialMatch: [string, number] | null =
			Object.entries(numbersSmall).find(([key, _]) => {
				return section.startsWith(key);
			}) ?? null;
		if (!!partialMatch) {
			processMatch(partialMatch[1], "small", partialMatch[0]);
			console.log("small match found", { partialMatch });
			return true;
		}
		// starts with magnitude value
		partialMatch =
			Object.entries(numbersMagnitude).find(([key, _]) => {
				return section.startsWith(key);
			}) ?? null;
		if (!!partialMatch) {
			processMatch(partialMatch[1], "magnitude", partialMatch[0]);
			console.log("magnitude match found", { partialMatch });
			return true;
		}
		// no matches - return false
		return false;
	};

	sections.every((section) => {
		// if no matches found in section, loop will break
		return parseSection(section);
	});
	// no matches found -- return full string
	if (result + smallValue < 0) {
		return [null, input];
	} else {
		// add any remaining small value to result
		let quantity = result + smallValue;
		console.log({ quantity });
		return [quantity.toString(), restOfIngredient];
	}
}

export function findQuantityAndConvertIfUnicode(
	ingredientLine: string,
	language: SupportedLanguages
): [string | null, string] {
	const { joiners, isCommaDelimited } = i18nMap[language];

	// Supports any of "1/3" "1 1/3" "1,000" "1,000.01" "1000"

	const delimiter = isCommaDelimited ? "," : "\\.";
	const magnitudeSeperator = isCommaDelimited ? "\\." : ",";

	const numericAndFractionRegex = new RegExp(
		`(\\d+\\/\\d+|\\d+\\s\\d+\\/\\d+|\\d+(?:${magnitudeSeperator}?\\d+)*${delimiter}\\d+|\\d+)`,
		"g"
	);

	const numericRangeWithSpaceRegex = new RegExp(
		`^(\\d+\\-\\d+)|^(\\d+\\s\\-\\s\\d+)|^(\\d+\\s(?:${joiners.join(
			"|"
		)})\\s\\d+)`,
		"g"
	); // for ex: "1 to 2" or "1 - 2"
	// const unicodeFractionRegex = /(\d*)\s*([^\u0000-\u007F]+)/g;
	const unicodeFractionRegex = new RegExp(
		`(\\d*)\\s*(${Object.keys(unicodeObj).join("|")})`,
		""
	);

	// found a unicode quantity inside our regex, for ex: '⅝'
	const unicodeQuantityMatch = ingredientLine.match(unicodeFractionRegex);
	if (unicodeQuantityMatch) {
		const [str, numericPart, unicodePart] = unicodeQuantityMatch;

		// If there's a match for the unicodePart in our dictionary above
		if (unicodeObj[unicodePart]) {
			return [
				`${numericPart} ${unicodeObj[unicodePart]}`,
				ingredientLine.replace(str, "").trim(),
			];
		}
	}

	// found a quantity range, for ex: "2 to 3"
	const quantityRangeMatch = ingredientLine.match(numericRangeWithSpaceRegex);
	if (quantityRangeMatch) {
		const quantity = getFirstMatch(ingredientLine, numericRangeWithSpaceRegex)
			.replace(new RegExp(`${joiners.join("|")}`), "-")
			.split(" ")
			.join("");
		const restOfIngredient = ingredientLine
			.replace(getFirstMatch(ingredientLine, numericRangeWithSpaceRegex), "")
			.trim();
		return [quantity, restOfIngredient];
	}

	// found a numeric/fraction quantity, for example: "1 1/3"
	const numericFractionMatch = ingredientLine.match(numericAndFractionRegex);
	if (numericFractionMatch) {
		const quantity = getFirstMatch(ingredientLine, numericAndFractionRegex);
		const restOfIngredient = ingredientLine
			.replace(getFirstMatch(ingredientLine, numericAndFractionRegex), "")
			.trim();
		return [quantity, restOfIngredient];
	}

	// found a word which we can test for numeric value
	console.log({ ingredientLine });
	const [quantity, restOfIngredient]: [
		quantity: string | null,
		restOfIngredient: string
	] = parseWrittenNumber(ingredientLine, language);
	if (quantity) return [quantity, restOfIngredient];

	// no matches -- return untransformed ingredient
	return [null, ingredientLine];
}
