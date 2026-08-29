/**
 * Family-friendly adjective-noun pairs for generating join codes.
 * Format: "adjective-noun" (e.g., "beautiful-doorway")
 */

const ADJECTIVES = [
  "beautiful", "wonderful", "amazing", "brilliant", "charming",
  "delightful", "elegant", "fantastic", "gentle", "happy",
  "inspiring", "jubilant", "kind", "lovely", "magnificent",
  "noble", "optimistic", "peaceful", "quiet", "radiant",
  "serene", "tender", "unique", "vibrant", "warm",
  "xenial", "youthful", "zestful",
];

const NOUNS = [
  "doorway", "gateway", "haven", "bridge", "circle",
  "group", "house", "journey", "kitchen", "lantern",
  "mansion", "nook", "orchard", "path", "quilt",
  "room", "sanctuary", "team", "unity", "village",
  "wardrobe", "xchange", "yard", "zephyr",
];

/**
 * Generate a random invite code in the format "adjective-noun".
 */
export function generateInviteCode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

/**
 * Validate that a code matches the expected format: adjective-noun.
 */
export function isValidInviteCode(code: string): boolean {
  const parts = code.toLowerCase().split("-");
  if (parts.length !== 2) return false;
  const [adj, noun] = parts;
  const hasAdj = ADJECTIVES.some((a) => a.toLowerCase() === adj);
  const hasNoun = NOUNS.some((n) => n.toLowerCase() === noun);
  return hasAdj && hasNoun;
}
