import { describe, expect, it } from "vitest";

import { decideAccess } from "./access";

describe("decideAccess — isolation rules", () => {
  it("agency in their org gets agency actor", () => {
    expect(
      decideAccess({
        orgRole: "owner",
        inUserOrg: true,
        clientEditingEnabled: false,
        member: null,
      }),
    ).toEqual({ kind: "agency", role: "owner" });
  });

  it("agency NOT in the site's org is denied", () => {
    expect(
      decideAccess({
        orgRole: "staff",
        inUserOrg: false,
        clientEditingEnabled: true,
        member: null,
      }),
    ).toBeNull();
  });

  it("client with membership and toggle ON gets client actor", () => {
    expect(
      decideAccess({
        orgRole: null,
        inUserOrg: false,
        clientEditingEnabled: true,
        member: { role: "client_editor", override: {} },
      }),
    ).toEqual({ kind: "client", role: "client_editor", override: {} });
  });

  it("client is denied when the site toggle is OFF (revocation)", () => {
    expect(
      decideAccess({
        orgRole: null,
        inUserOrg: false,
        clientEditingEnabled: false,
        member: { role: "client_editor", override: {} },
      }),
    ).toBeNull();
  });

  it("client without a membership is denied (cannot see other sites)", () => {
    expect(
      decideAccess({
        orgRole: null,
        inUserOrg: false,
        clientEditingEnabled: true,
        member: null,
      }),
    ).toBeNull();
  });

  it("carries the per-member override through", () => {
    const override = { contentTypes: { pages: { delete: false } } };
    expect(
      decideAccess({
        orgRole: null,
        inUserOrg: false,
        clientEditingEnabled: true,
        member: { role: "client_editor", override },
      }),
    ).toEqual({ kind: "client", role: "client_editor", override });
  });
});
