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

// fix: needs some kind of sorting? "trentatre" fails (produces 13) as "tre" is found before "trentatre"
// fix: should not capture "a" if partial word match e.g. "one and a half" -> "2 nd a half"
export function parseWrittenNumber(
	input: string,
	language: SupportedLanguages
): [quantity: string | null, restOfIngredient: string] {
	// split string by 1 or more whitespace characters or dashes
	const sections = input.split(/[\s-]+/);

	let [smallValue, result]: number[] = [0, 0];
	let restOfIngredient: string = input;
	const { numbersSmall, numbersMagnitude, additiveJoiners } = i18nMap[language];
	let previousMatch: number | null = null;

	const parseSection = (section: string) => {
		// ignore additive joiners and continue to parse next section
		if (additiveJoiners.includes(section)) {
			return true;
		}

		const applyMatch = (
			match: number,
			type: "small" | "magnitude",
			trimFromIngredient: string
		) => {
			if (type === "small") {
				// addition accounts for juxtaposed small values, e.g. "twenty one"
				smallValue += match;
			} else {
				// process magnitude value
				if (previousMatch && previousMatch >= 100) {
					// previous match was a magnitude value, e.g. "hundred thousand"
					result = result * match;
				} else {
					// previous match was a small value, e.g. "one thousand"
					result += (smallValue ? smallValue : 1) * match;
				}
				// after magnitude value, small value no longer has been expended (e.g. "five thousand" -- five has been applied and should be reset)
				smallValue = 0;
			}
			if (trimFromIngredient) {
				let partialRegex = new RegExp(`^${trimFromIngredient}\\s*`, "g");
				restOfIngredient = restOfIngredient.replace(partialRegex, "");
				previousMatch = match;
				return true;
			}
		};

		// entire string matches small value
		let match: number = numbersSmall[section];
		if (!!match) {
			applyMatch(match, "small", section);
			return true;
		}
		// entire string matches magnitude value
		match = numbersMagnitude[section];
		if (!!match) {
			applyMatch(match, "magnitude", section);
			return true;
		}

		const getPartialMatches = (
			section: string
		): { match: [string, number]; type: "small" | "magnitude" }[] | null => {
			let partialMatches: { match: [string, number]; type: string }[] = [];
			let match: [string, number] | null = null;
			let findMatch = (workingSection: string): any => {
				match =
					Object.entries(numbersSmall).find(([key, _]) => {
						return workingSection.startsWith(key);
					}) ?? null;
				if (match) {
					partialMatches.push({ match, type: "small" });
					workingSection = workingSection.replace(match[0], "");
				} else {
					match =
						Object.entries(numbersMagnitude).find(([key, _]) => {
							return workingSection.startsWith(key);
						}) ?? null;
					if (match) {
						partialMatches.push({ match, type: "magnitude" });
						workingSection = workingSection.replace(match[0], "");
					}
				}
				if (workingSection.length === 0) {
					// entire string parsed and all sections matched
					return partialMatches;
				} else if (match) {
					// match found, keep parsing
					return findMatch(workingSection);
				} else {
					// non-matching section found, reject result
					return null;
				}
			};
			return findMatch(section);
		};

		// perf: check for simple matches before partials
		let partialMatches = getPartialMatches(section);
		if (partialMatches) {
			partialMatches.forEach(({ match, type }) =>
				applyMatch(match[1], type, match[0])
			);
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

	// test for words with numeric value at beginning of string
	const [quantity, restOfIngredient]: [
		quantity: string | null,
		restOfIngredient: string
	] = parseWrittenNumber(ingredientLine, language);

	if (quantity) return [quantity, restOfIngredient];
	// no matches -- return untransformed ingredient
	return [null, ingredientLine];
}
