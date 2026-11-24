import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import type { BotMessage } from "../../data";
import { stepKind, ThinkingDisclosure } from "./AgentActivity";

describe("agent steps", () => {
  it("reads the kind of a step from its first words, in English and Polish", () => {
    expect(stepKind("Read the brief")).toBe("read");
    expect(stepKind("Searched the docs for limits")).toBe("search");
    expect(stepKind("Ran bun test")).toBe("run");
    expect(stepKind("Drafted next steps")).toBe("write");
    expect(stepKind("Opened https://example.com")).toBe("read");
    expect(stepKind("Checked https://example.com")).toBe("web");
    expect(stepKind("Przeczytałem plan")).toBe("read");
    expect(stepKind("Uruchomiłem testy")).toBe("run");
    expect(stepKind("Compared owners")).toBe("think");
  });

  it("draws every step on the timeline and marks the live one", () => {
    const message: BotMessage = {
      id: "m",
      author: "bot",
      body: "",
      time: "10:00",
      items: ["Read the brief", "Compared owners"],
      streaming: true,
    };
    const { container } = render(() => <ThinkingDisclosure message={message} />);
    const steps = container.querySelectorAll(".thinking-steps li");
    expect(steps).toHaveLength(2);
    expect(steps[0]?.getAttribute("data-step")).toBe("read");
    expect(steps[1]?.getAttribute("data-live")).toBe("true");
    expect(steps[0]?.getAttribute("data-live")).toBeNull();
  });
});
