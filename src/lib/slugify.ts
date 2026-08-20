/**
 * Generate a URL-safe slug from a string, with proper edge case handling.
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with hyphens
 * - Trims leading/trailing hyphens
 * - Truncates to maxLength (default 80) without cutting mid-word when possible
 */
export function slugify(text: string, maxLength = 80): string {
  if (!text || !text.trim()) return "";

  const normalized = text.toLowerCase().trim();
  const slug = normalized.replace(/[^a-z0-9]+/g, "-");

  // Truncate to maxLength, backing up to the last hyphen to avoid mid-word cut
  let result = slug.slice(0, maxLength);
  if (result.length === maxLength && maxLength > 0) {
    const lastHyphen = result.lastIndexOf("-");
    if (lastHyphen > 0) {
      result = result.slice(0, lastHyphen);
    } else if (lastHyphen === -1) {
      // No hyphen found — truncate to maxLength minus one extra char for safety
      result = result.slice(0, Math.max(maxLength - 1, 1));
    }
  }

  return result.replace(/^-+|-+$/g, "");
}
