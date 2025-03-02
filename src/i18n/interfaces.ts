export type LanguageConfig = {
	baseUnit: string;
	units: { [key: string]: string[] };
	pluralUnits: { [key: string]: string };
	symbolUnits: { [key: string]: string };
	prepositions: string[];
	joiners: string[];
	additiveJoiners: string[];
	toTaste: string[];
	numbersSmall: { [key: string]: number };
	numbersMagnitude: { [key: string]: number };
	isCommaDelimited: boolean;
};
