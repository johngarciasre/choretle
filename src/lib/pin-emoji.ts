/**
 * The PIN grid. 36 entries so a 4-pick sequence with repeats is 1.68M
 * combinations, and a grid that still fits on a tablet in one screen.
 *
 * Entries are stored as stable IDs, never glyphs: a platform font update must
 * not be able to break a login. Keep the set positive and kid-safe — no
 * negative expressions, hand gestures, weapons, money, or religious or
 * political symbols.
 */

export interface PinEmoji {
  id: string;
  glyph: string;
  label: string;
}

export const PIN_EMOJI: PinEmoji[] = [
  { id: "smile", glyph: "😊", label: "Smiling face" },
  { id: "grin", glyph: "😄", label: "Grinning face" },
  { id: "wink", glyph: "😉", label: "Winking face" },
  { id: "cool", glyph: "😎", label: "Cool face" },
  { id: "starstruck", glyph: "🤩", label: "Star-struck face" },
  { id: "party", glyph: "🥳", label: "Party face" },
  { id: "heart", glyph: "💚", label: "Green heart" },
  { id: "rainbow", glyph: "🌈", label: "Rainbow" },
  { id: "star", glyph: "⭐", label: "Star" },
  { id: "sparkle", glyph: "✨", label: "Sparkles" },
  { id: "sun", glyph: "☀️", label: "Sun" },
  { id: "moon", glyph: "🌙", label: "Moon" },
  { id: "cloud", glyph: "☁️", label: "Cloud" },
  { id: "flower", glyph: "🌻", label: "Sunflower" },
  { id: "clover", glyph: "🍀", label: "Clover" },
  { id: "tree", glyph: "🌳", label: "Tree" },
  { id: "cat", glyph: "🐱", label: "Cat" },
  { id: "dog", glyph: "🐶", label: "Dog" },
  { id: "panda", glyph: "🐼", label: "Panda" },
  { id: "fox", glyph: "🦊", label: "Fox" },
  { id: "turtle", glyph: "🐢", label: "Turtle" },
  { id: "butterfly", glyph: "🦋", label: "Butterfly" },
  { id: "whale", glyph: "🐳", label: "Whale" },
  { id: "unicorn", glyph: "🦄", label: "Unicorn" },
  { id: "apple", glyph: "🍎", label: "Apple" },
  { id: "watermelon", glyph: "🍉", label: "Watermelon" },
  { id: "cookie", glyph: "🍪", label: "Cookie" },
  { id: "pizza", glyph: "🍕", label: "Pizza" },
  { id: "soccer", glyph: "⚽", label: "Soccer ball" },
  { id: "basketball", glyph: "🏀", label: "Basketball" },
  { id: "bike", glyph: "🚲", label: "Bicycle" },
  { id: "kite", glyph: "🪁", label: "Kite" },
  { id: "puzzle", glyph: "🧩", label: "Puzzle piece" },
  { id: "paint", glyph: "🎨", label: "Paint palette" },
  { id: "music", glyph: "🎵", label: "Music note" },
  { id: "rocket", glyph: "🚀", label: "Rocket" },
];

export const PIN_LENGTH = 4;

const BY_ID = new Map(PIN_EMOJI.map((entry) => [entry.id, entry]));

export function isPinEmojiId(id: unknown): boolean {
  return typeof id === "string" && BY_ID.has(id);
}

export function pinEmojiLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/** A PIN is a sequence of PIN_LENGTH known ids. */
export function isValidPin(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === PIN_LENGTH &&
    value.every((entry) => isPinEmojiId(entry))
  );
}
