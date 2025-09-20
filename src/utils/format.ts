export function formatBytes(bytes: number, decimals = 2): string {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

	const i = Math.floor(Math.log(bytes) / Math.log(k));
	const boundedIndex = Math.min(i, sizes.length - 1);

	return `${parseFloat((bytes / k ** boundedIndex).toFixed(dm))} ${sizes[boundedIndex]}`;
}
