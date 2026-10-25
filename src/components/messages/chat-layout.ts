/**
 * How a chat page sits in the dashboard frame, shared by every page that
 * draws a `ThreadView`: the member's deal chat and Escrow Agent, and the
 * staff conversation and support-chat desks.
 *
 * The rule is that the message box is the last thing on the screen, flush
 * with its bottom edge, whatever the conversation's length. These classes
 * only size the page; `ThreadView` keeps the box pinned inside it.
 *
 * The numbers are the shell's (see the dashboard app shell): a 56px top bar,
 * then the main area's top padding of 20px on a phone, 24px from `sm` and
 * 32px on a computer, hence 4.75rem, 5rem and 5.5rem.
 */

/**
 * On a phone and a tablet the page fills the screen under the top bar, so in
 * a short chat the message box is at the bottom of the screen rather than
 * under the last message with empty page below it. The page itself scrolls
 * past that; the box stays at the bottom while it does.
 */
export const CHAT_FILL =
  "flex flex-col min-h-[calc(100dvh-4.75rem)] sm:min-h-[calc(100dvh-5rem)]";

/**
 * On a computer, a column the window's height: the header holds the top,
 * the message box the bottom, and only the messages scroll between them.
 * The negative margin hands back the last 16px of the shell's bottom
 * padding, so the column ends at the window's edge and the box with it.
 */
export const CHAT_WINDOW =
  "lg:flex lg:flex-col lg:-mb-4 lg:h-[calc(100dvh-5.5rem)] lg:min-h-0";

/**
 * As `CHAT_WINDOW` once the pane has room for a second column beside the
 * conversation (the deal panel, the staff controls). Narrower, that column
 * stacks above the conversation and the page scrolls as a whole — but the
 * page is still at least the window's height, so the message box starts at
 * the bottom of the window and stays there.
 */
export const CHAT_WINDOW_WIDE =
  "lg:flex lg:flex-col lg:-mb-4 lg:min-h-[calc(100dvh-5.5rem)] lg:@3xl:h-[calc(100dvh-5.5rem)]";
