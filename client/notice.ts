/**
 * Something to tell on the next page: a view that sends the user elsewhere leaves a word here, and
 * the view that the user lands on shows it once.
 */
let notice: string | null = null;

export function leaveNotice(text: string) {
  notice = text;
}

/** The word that was left, if one was: it is told only once. */
export function takeNotice() {
  const text = notice;
  notice = null;
  return text;
}
