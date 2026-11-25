import { expect, it } from "vitest";
import { parseBrowserNavigate } from "./browser-inputs";

it("accepts Back and Forward for a tab and refuses anything else", () => {
  expect(parseBrowserNavigate({ tabId: "t1", direction: "back" })).toEqual({ tabId: "t1", direction: "back" });
  expect(parseBrowserNavigate({ tabId: "t1", direction: "forward" })).toEqual({ tabId: "t1", direction: "forward" });
  expect(() => parseBrowserNavigate({ tabId: "t1", direction: "sideways" })).toThrow();
  expect(() => parseBrowserNavigate({ direction: "back" })).toThrow();
  expect(() => parseBrowserNavigate("back")).toThrow();
});
