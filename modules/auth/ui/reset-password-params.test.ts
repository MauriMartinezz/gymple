import { describe, expect, it } from "vitest";
import { resetPasswordView } from "./reset-password-params";

describe("resetPasswordView", () => {
  it("asks for a new password when better-auth passed a token", () => {
    expect(resetPasswordView({ token: "t0k3n" })).toEqual({ step: "choose", token: "t0k3n" });
  });

  it("uses the first token when repeated", () => {
    expect(resetPasswordView({ token: ["a", "b"] })).toEqual({ step: "choose", token: "a" });
  });

  it("offers a new link when the token was rejected", () => {
    expect(resetPasswordView({ error: "INVALID_TOKEN" })).toEqual({ step: "request", linkRejected: true });
    expect(resetPasswordView({ error: "INVALID_TOKEN", token: "t0k3n" })).toEqual({ step: "request", linkRejected: true });
  });

  it("offers a link when the page is opened directly", () => {
    expect(resetPasswordView({})).toEqual({ step: "request", linkRejected: false });
    expect(resetPasswordView({ token: "" })).toEqual({ step: "request", linkRejected: false });
  });
});
