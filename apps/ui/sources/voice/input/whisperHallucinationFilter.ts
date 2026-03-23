/**
 * Post-transcription filter for known Whisper hallucination patterns.
 *
 * Whisper's decoder generates phantom text when it receives silence or
 * ambient noise — YouTube outro phrases, subtitle artifacts, repetition
 * loops, and garbage Unicode characters. This filter catches those patterns
 * after transcription so they never reach the voice pipeline.
 *
 * Three checks applied in order:
 * 1. Exact-string blocklist (known hallucination phrases)
 * 2. Repetition detection (decoder stuck loops)
 * 3. Garbage script detection (non-Latin character spam)
 */

const HALLUCINATION_PHRASES: string[] = [
  // YouTube / podcast outro hallucinations
  // Note: "thank you..." and "thanks for..." variants are handled by prefix matching.
  'please subscribe',
  'like and subscribe',
  'subscribe to my channel',
  'see you next time',
  'see you in the next video',
  'see you in the next one',
  "don't forget to subscribe",
  'like comment and subscribe',
  'subscribe and hit the bell',
  "I'll see you next time",
  "we'll be right back",

  // Silence filler hallucinations (short phrases Whisper produces from noise)
  // Note: "thank you..." variants are handled by prefix matching, not exact match.
  'thanks',
  'okay, thank you',
  'all right, thank you',
  'bye',
  'bye bye',
  'bye-bye',
  'goodbye',
  'good night',
  'have a good night, guys',
  'the end',
  'you',
  'yeah',
  'hey',
  'no, thanks',
  'nice',
  'good',
  'all right',
  'all right, all right',
  'all right, all right, all right',
  'uh-huh',
  'aww',
  'aw',
  '.',

  // Whisper "coherent nonsense" — confident sentences that never happened
  'because I have not done that in the last few years',
  'but I grow them',
  'but I grow young',
  'can I go',
  'do you want me to turn it off',
  "I'm happy to be here",
  "I'm just a form",
  "let's do that again",
  'so I am going to turn this off',
  "that I thought I'd just like to talk about for a minute",
  "I'm going to be here to give you more money",
  'we have to be cool',
  "I'm so glad to be here",
  'I am so glad to have you all the time to work out with you',
  "that's where I'm at",
  'oh, I got this job',
  'oh, I got this stuff',
  'I feel ready to switch',
  'I say feel ready to switch, try the switch to play',
  "I'm going to try the switch to side two",
  "I'm gonna try the switch to side too",
  "I'm going to try the switch to side 2",
  'I got this at the time',
  "oh, what's that",
  'you know, Ryan',
  'and then what is the end of the family',
  'god bless you',
  'oh, my God',
  "it's awesome",
  "that's it",
  "that's the whole thing",
  "I'll tell you what, I'll be saying",
  "I'm speaking, I'm speaking, I tell you what",
  "I'm speaking, I'm speaking, I'm speaking",
  'next slide, next slide',
  "we're going to be a better place to go",
  "we're going to be a better place",
  "we're going to be a better person to go",
  "we're going to be a better person",
  'okay, I got this stuff',
  "I said, good already, so I'm gonna switch",
  "I'm going to say it's good already, so I'm going to switch the side here",
  "I said good already, so I'm gonna try to switch the bike",
  "I said good already, so I'm going to switch the side too",
  "I got this at the time, I don't know about it",
  "I don't know",
  'everything all right',
  "so we're going to talk about this",
  "we're going to talk about this",
  'I am very good',
  "oh, I just said that, I didn't see you in the hand",
  "I didn't see you in the hand",
  'I just went out',
  'I just went out and I just went out',
  'I just went out with his eyes',
  "uh-huh, that's where I'm at",
  "uh-huh, that's where it's actually",
  "that's where I should go",
  "it's horrible",
  'I got this done',
  'I got this stuff',
  "you're doing good, I got this stuff",
  'all right, I got this',
  "I'm going to say it's good already, so I'm going to switch",
  "I'm going to switch the site",
  'I got this with the monolone',
  "I'm going to try the switch inside, too",
  "you know, I was like, oh, what's that",
  'you know, right',
  'you know',
  "all right, we're all alone",
  'all right, you know, all right',
  'right here, right here',
  'right here',
  'I love you',

  // Subtitle artifact hallucinations
  'subtitles by the amara.org community',
  'subtitles by',
  'translated by',
  'transcribed by',
  'community verified',

  // Non-English silence hallucinations
  '谢谢观看',
  'ご視聴ありがとうございました',

  // Punctuation-only
  '...',
];

const blocklist = new Set<string>(
  HALLUCINATION_PHRASES.map((p) => p.toLowerCase().replace(/[.!?,]+$/g, '').trim()),
);

const HALLUCINATION_PREFIXES: string[] = [
  'thank you',
  'thanks for',
  'thank you so much for joining',
];

const prefixes = HALLUCINATION_PREFIXES.map((p) => p.toLowerCase());

function isBlocklisted(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[.!?,]+$/g, '').trim();
  if (blocklist.has(normalized)) return true;
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Detect stuck decoder loops: a phrase repeated 3+ times in sequence.
 * Splits on sentence delimiters and checks for consecutive identical segments.
 */
function isRepetitionLoop(text: string): boolean {
  const segments = text
    .split(/[,.\n!?]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  if (segments.length < 3) return false;

  let consecutive = 1;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i] === segments[i - 1]) {
      consecutive++;
      if (consecutive >= 3) return true;
    } else {
      consecutive = 1;
    }
  }
  return false;
}

/**
 * Detect garbage script output — characters outside the Latin/common range.
 * When >50% of non-whitespace characters are outside Basic Latin + Latin Extended
 * + common punctuation, the output is likely garbage from noise (e.g. Georgian ი loops).
 *
 * Intentionally allows CJK and other scripts for legitimate multilingual use
 * only when they form coherent short text (which is handled by the blocklist).
 */
function isGarbageScript(text: string): boolean {
  const nonWhitespace = text.replace(/\s/g, '');
  if (nonWhitespace.length === 0) return true;

  // Count characters outside the Latin + common punctuation range.
  // U+0000-U+024F covers Basic Latin, Latin-1 Supplement, Latin Extended-A/B.
  // U+2000-U+206F covers General Punctuation.
  let outsideCount = 0;
  for (let i = 0; i < nonWhitespace.length; i++) {
    const code = nonWhitespace.charCodeAt(i)!;
    const isLatin = code <= 0x024f;
    const isGeneralPunctuation = code >= 0x2000 && code <= 0x206f;
    if (!isLatin && !isGeneralPunctuation) {
      outsideCount++;
    }
  }

  // >50% non-Latin for a transcript that is at least 4 chars long
  return nonWhitespace.length >= 4 && outsideCount / nonWhitespace.length > 0.5;
}

/**
 * Filter known Whisper hallucination patterns from a transcription result.
 * Returns the original text if it passes all checks, or null if it looks hallucinated.
 */
export function filterWhisperHallucination(text: string | null | undefined): string | null {
  if (text == null) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  if (isBlocklisted(trimmed)) return null;
  if (isRepetitionLoop(trimmed)) return null;
  if (isGarbageScript(trimmed)) return null;

  return trimmed;
}
