/**
 * Random loading messages
 * Used by the TimelineStatusStep component to show playful waiting prompts
 */

const loadingTexts = [
  // Classic memes
  'This was supposed to be smooth and effortless',
  'But now it is a frantic scramble',
  'I know you are in a hurry, but hold on a sec',
  'Doggy-paddling through the ocean of knowledge',
  'Letting the bullets fly a little longer',
  'Hand-crafting your answer',
  'Rallying the little gremlins',
  'Stop nagging, already writing it (new folder)',
  'Thinking so hard I am breaking a sweat',
  'The CPU is about to catch fire',
  // Everyday vibes
  'Slow-roasting like a village cafe, good things take time',
  'Flipping the knowledge pancake',
  'Toasting to myself, almost ready',
  'Putting inspiration in the oven',
  'Letting the answer steep a bit longer',
  'Maxing out the emotional support',
  'Knitting you a sweater of words',
  // Wild imagination
  'Neurons hitting the dance floor',
  'A night-owl pondering at 3 AM',
  'Coloring in the answer',
  'Frantically flipping through the knowledge base',
  'The brain circus is now in session',
  'Squishing 0s and 1s together',
  'Charging up a big move',
  'The magnifying glass fogged up, wiping it',
  'Trying to make sense of this absurd request',
  // Mystical
  'Casting a spell, do not disturb',
  'Waking up my silicon friend',
  'Connecting to the wisdom of cyberspace',
  'Hold on, fellow traveler, still calculating',
  'Crossing the knowledge black hole',
  'Reverse-engineering human intent',
  'The crystal ball is fuzzy, giving it a tap',
  // Workplace
  'Code running faster than a reporter',
  'The host is online, please hold',
  'Galloping over at full speed',
  'Hauling knowledge at light speed',
  'The last piece of the puzzle',
  'The answer is about to wrap up',
  'Launch countdown',
  'Locking on target',
];

/**
 * Get a random loading message
 */
export function getRandomLoadingText(): string {
  return loadingTexts[Math.floor(Math.random() * loadingTexts.length)];
}
