import { MAX_FILENAME_LENGTH } from '$lib/configs';

export function hasInvalidFilenameChars(value: string): boolean {
	return Array.from(value).some((char) => {
		const code = char.charCodeAt(0);
		return char === '/' || char === '\\' || code <= 0x1f || code === 0x7f;
	});
}

export function isValidFilename(value: string): boolean {
	return Boolean(
		value &&
		value.length <= MAX_FILENAME_LENGTH &&
		value !== '.' &&
		value !== '..' &&
		!hasInvalidFilenameChars(value)
	);
}

function splitFilename(filename: string): { stem: string; extension: string } {
	const lastDot = filename.lastIndexOf('.');
	if (lastDot <= 0 || lastDot === filename.length - 1) {
		return { stem: filename, extension: '' };
	}

	return {
		stem: filename.slice(0, lastDot),
		extension: filename.slice(lastDot)
	};
}

/**
 * Return the requested name when it is free, otherwise use the Windows-style
 * " (1)", " (2)" suffix until a case-insensitive free name is found.
 */
export function createNumberedFilename(
	requestedName: string,
	existingNames: Iterable<string>
): string {
	const usedNames = new Set(Array.from(existingNames, (name) => name.toLowerCase()));
	if (!usedNames.has(requestedName.toLowerCase())) return requestedName;

	const { stem, extension } = splitFilename(requestedName);

	for (let counter = 1; counter <= usedNames.size + 1; counter += 1) {
		const suffix = ` (${counter})`;
		const maxStemLength = MAX_FILENAME_LENGTH - suffix.length - extension.length;
		const candidate =
			maxStemLength > 0
				? `${stem.slice(0, maxStemLength)}${suffix}${extension}`
				: `${requestedName.slice(0, Math.max(1, MAX_FILENAME_LENGTH - suffix.length))}${suffix}`;

		if (!usedNames.has(candidate.toLowerCase())) return candidate;
	}

	throw new Error('Unable to generate a unique file name');
}
