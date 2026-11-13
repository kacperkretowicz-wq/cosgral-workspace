// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseMobileDeviceId, parseStartMobilePairing } from "./mobile-inputs";

describe("Mobile Connect IPC inputs", () => {
  it("accepts an optional exposure and port, and a device id", () => {
    expect(parseStartMobilePairing(null)).toEqual({});
    expect(parseStartMobilePairing({ exposure: "lan", port: 47_930 })).toEqual({ exposure: "lan", port: 47_930 });
    expect(() => parseStartMobilePairing({ exposure: "internet" })).toThrow("exposure");
    expect(() => parseStartMobilePairing({ port: 1.5 })).toThrow("port");
    expect(parseMobileDeviceId({ deviceId: "dev-1" })).toEqual({ deviceId: "dev-1" });
    expect(() => parseMobileDeviceId({})).toThrow("deviceId");
  });
});
