/**
 * Foreground policy for browser tools.
 *
 * Default is to operate in the BACKGROUND: a tool acting on a tab must NOT
 * steal the user's focus by activating that tab / focusing its window. This
 * keeps agent automation unobtrusive — the user can keep working in another
 * tab/window while tools run.
 *
 * Foregrounding happens only when the caller explicitly opts in with
 * `background: false`. Omitting `background` (or passing `true`) stays in the
 * background.
 *
 * Exception: `chrome_switch_tab` bypasses this policy — surfacing a tab is its
 * entire purpose, so it always activates.
 */
export function shouldForeground(background?: boolean): boolean {
  return background === false;
}
