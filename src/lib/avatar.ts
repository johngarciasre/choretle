// Curated list of fun, family-friendly emojis for profile avatars
const AVATAR_EMOJIS = [
  "\u{1F60A}", // smiley face
  "\u{1F60E}", // smiling face with sunglasses
  "\u{1F973}", // child
  "\u{1F468}", // book
  "\u{1F384}", // house
  "\u{1F3A0}", // gear
  "\u{1F3E0}", // globe
  "\u{1F3E8}", // droplet
  "\u{1F31F}", // sun with rays
  "\u{1F33F}", // rocket
  "\u{1F525}", // fire
  "\u{1F3C6}", // medal
  "\u{1F3C9}", // trophy
  "\u{1F4AF}", // keycap
];

// Background color classes for emoji avatars
const BG_CLASSES = [
  "bg-coral/20",
  "bg-teal/20",
  "bg-sunny/20",
  "bg-grape/20",
  "bg-purple-300/20",
  "bg-blue-300/20",
];

/**
 * Generate a deterministic random emoji avatar for a user based on their userId.
 * Returns an object with the emoji and a background color class.
 */
export function getAvatarEmoji(userId: string): { emoji: string; bgClass: string } {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const charCode = userId.charCodeAt(i);
    hash = ((hash << 5) + charCode + (hash << 3)) & 0xffffffff;
  }

  const emojiIndex = Math.abs(hash) % AVATAR_EMOJIS.length;
  const bgIndex = Math.abs(hash >> 8) % BG_CLASSES.length;

  return {
    emoji: AVATAR_EMOJIS[emojiIndex],
    bgClass: BG_CLASSES[bgIndex],
  };
}
