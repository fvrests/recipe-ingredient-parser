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

export function parseWrittenNumber(
	input: string,
	language: SupportedLanguages
): [quantity: string | null, restOfIngredient: string] {
	// split string by 1 or more whitespace characters or dashes
	const sections = input.split(/[\s-]+/);

	let restOfIngredient: string = input;
	const { numbersSmall, numbersMagnitude, additiveJoiners, isCommaDelimited } =
		i18nMap[language];
	type Match = [text: string, value: number];
	type MatchType = "small" | "magnitude";
	let [accumulator, result]: number[] = [0, 0];

	sections.every((section) => {
		let match: Match | null = null;
		let partialMatches: {
			partialMatch: [string, number];
			type: MatchType;
		}[] = [];
		// if no matches found in section, returning false will break loop and end parsing

		const applyMatch = (match: Match, type: MatchType) => {
			if (type === "small") {
				// addition accounts for juxtaposed small values, e.g. "twenty one"
				accumulator += match[1];
			} else if (match[1] === 100) {
				// hundreds should be multiplied into accumulator but not total it out yet - "four hundred twenty six thousand" needs to keep accumulating
				accumulator = (accumulator ? accumulator : 1) * match[1];
			} else {
				// process magnitude value
				result += (accumulator ? accumulator : 1) * match[1];
				accumulator = 0;
			}
			// strip match string from beginning of ingredient
			let partialRegex = new RegExp(`^${match[0]}\\s*`, "gi");
			restOfIngredient = restOfIngredient.replace(partialRegex, "");
			return true;
		};

		// additive joiner e.g. 'and' - subtotal and continue to parse next section
		if (additiveJoiners.includes(section)) {
			let partialRegex = new RegExp(`^${section}\\s*`, "gi");
			restOfIngredient = restOfIngredient.replace(partialRegex, "");
			return true;
		}

		let findMatches = (section: string): any => {
			let workingSection = section.toLowerCase();

			match = numbersSmall[workingSection]
				? [workingSection, numbersSmall[workingSection]]
				: null;
			// entire string matches small value
			if (match) {
				if (partialMatches.length > 0) {
					partialMatches.forEach(({ partialMatch, type }) =>
						applyMatch(partialMatch, type)
					);
					partialMatches = [];
				}
				return applyMatch(match, "small");
			}

			match = numbersMagnitude[workingSection]
				? [workingSection, numbersMagnitude[workingSection]]
				: null;
			// entire string matches magnitude value
			if (match) {
				if (partialMatches) {
					partialMatches.forEach(({ partialMatch, type }) =>
						applyMatch(partialMatch, type)
					);
				}
				return applyMatch(match, "magnitude");
			}

			// no complete match found, test for partial matches
			let partialMatch: Match | null = null;
			const recordPartialMatch = (partialMatch: Match, type: MatchType) => {
				let partialRegex = new RegExp(`^${partialMatch[0]}\\s*`, "gi");
				partialMatches.push({ partialMatch, type });
				workingSection = workingSection.replace(partialRegex, "");
			};

			partialMatch = Object.entries(numbersSmall).reduce(
				(longestMatch: Match | null, [key, value]) => {
					if (
						workingSection.startsWith(key) &&
						(!longestMatch || key.length > longestMatch[0].length)
					)
						return [key, value];
					else return longestMatch;
				},
				null
			);
			if (partialMatch) {
				recordPartialMatch(partialMatch, "small");
			} else {
				partialMatch =
					Object.entries(numbersMagnitude).find(([key, _]) => {
						return workingSection.startsWith(key);
					}) ?? null;
				if (partialMatch) {
					recordPartialMatch(partialMatch, "magnitude");
				}
			}

			if (workingSection.length === 0) {
				// entire section parsed and all parts matched
				partialMatches.forEach(({ partialMatch, type }) =>
					applyMatch(partialMatch, type)
				);
				return true;
			} else if (partialMatch) {
				// partial match found, keep parsing
				return findMatches(workingSection);
			} else {
				// no full or partial match, reject result
				return false;
			}
		};
		return findMatches(section);
	});

	// no matches found -- return full string
	if (result + accumulator < 0) {
		return [null, input];
	} else {
		// add any remaining small value to result
		let quantity = result + accumulator;
		// todo: later if converting to standard BCP 47 language tags, could use Number.prototype.toLocaleString() instead of string replace
		let localeQuantityString = isCommaDelimited
			? quantity.toString().replace(".", ",")
			: quantity.toString();
		return [localeQuantityString, restOfIngredient];
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
