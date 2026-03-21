import { describe, test, expect } from "bun:test";
import { getIndexHtml } from "../src/services/web-ui";

describe("web-ui", () => {
  test("getIndexHtml returns a valid HTML string with correct port", () => {
    const html = getIndexHtml(8080);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("8080");
  });

  test("HTML contains required layout elements", () => {
    const html = getIndexHtml(8080);
    expect(html).toContain('id="search"');
    expect(html).toContain('id="memories"');
    expect(html).toContain('id="stats"');
    expect(html).toContain('id="profile"');
  });

  test("HTML contains necessary CSS (dark theme, layout)", () => {
    const html = getIndexHtml(8080);
    expect(html).toContain("<style>");
    expect(html).toContain("background-color");
    expect(html).toContain("display: flex");
  });

  test("HTML contains JavaScript logic for fetching data", () => {
    const html = getIndexHtml(8080);
    expect(html).toContain("<script>");
    expect(html).toContain("/api/memories");
    expect(html).toContain("/api/stats");
    expect(html).toContain("/api/profile");
    expect(html).toContain("method: 'DELETE'");
  });

  test("HTML contains search debounce logic and delete confirmation", () => {
    const html = getIndexHtml(8080);
    expect(html).toContain("setTimeout(");
    expect(html).toContain("clearTimeout(");
    expect(html).toContain("confirm(");
  });
});
