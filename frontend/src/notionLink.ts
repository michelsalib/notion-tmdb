/**
 * Where the "Open" link on a freshly written row should point.
 *
 * The desktop app registers the `notion://` scheme and answers it by opening
 * the page in one of its own tabs, which is why the https URL Notion hands
 * back gets rewritten: a plain https link there leaves the app and lands in
 * the system browser instead.
 *
 * Mobile registers no such scheme. The webview opens the tab `_blank` asks
 * for, cannot resolve `notion://`, and closes it again — a window that loads
 * and disappears, which is all the user gets. So mobile keeps the https URL:
 * notion.so is a universal link on iOS and an app link on Android, so the OS
 * hands it to the installed app itself, and a device without the app still
 * renders the page rather than nothing.
 */

type Agent = Pick<Navigator, "userAgent" | "maxTouchPoints">;

export function isMobileAgent(agent: Agent): boolean {
  return (
    /Android|iPhone|iPad|iPod/i.test(agent.userAgent) ||
    // An iPad calls itself a Mac; the touch count is the only tell left.
    (/Macintosh/.test(agent.userAgent) && agent.maxTouchPoints > 1)
  );
}

export function notionHref(url: string, agent: Agent = navigator): string {
  return isMobileAgent(agent) ? url : url.replace(/^https:\/\//, "notion://");
}
