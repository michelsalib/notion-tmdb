import { describe, expect, test } from "bun:test";
import { notionHref } from "./notionLink";

const URL = "https://www.notion.so/Dune-1f2a3b4c";

const agent = (userAgent: string, maxTouchPoints = 0) => ({
  userAgent,
  maxTouchPoints,
});

const DESKTOP = agent(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
);
const IPHONE = agent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
);
const ANDROID = agent(
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36",
);
const IPAD = agent(DESKTOP.userAgent, 5);

describe("notionHref", () => {
  test("hands the desktop app its own scheme", () => {
    expect(notionHref(URL, DESKTOP)).toBe(
      "notion://www.notion.so/Dune-1f2a3b4c",
    );
  });

  test("leaves mobile the https URL", () => {
    // `notion://` in a mobile webview opens a tab that closes on itself; the
    // https URL is the deep link there.
    expect(notionHref(URL, IPHONE)).toBe(URL);
    expect(notionHref(URL, ANDROID)).toBe(URL);
  });

  test("sees through an iPad calling itself a Mac", () => {
    expect(notionHref(URL, IPAD)).toBe(URL);
  });

  test("leaves a URL that is not https alone", () => {
    expect(notionHref("http://notion.so/Dune", DESKTOP)).toBe(
      "http://notion.so/Dune",
    );
  });
});
