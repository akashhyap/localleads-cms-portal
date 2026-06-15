import { describe, expect, it } from "vitest";

import {
  type Actor,
  can,
  canUseMedia,
  defaultSchemaOperations,
  resolveContentPermissions,
} from "./index";

const agency: Actor = { kind: "agency", role: "owner" };
const staff: Actor = { kind: "agency", role: "staff" };
const client: Actor = { kind: "client", role: "client_editor" };
const viewer: Actor = { kind: "client", role: "viewer" };

const collectionOps = defaultSchemaOperations("collection");
const singletonOps = defaultSchemaOperations("singleton");

describe("defaultSchemaOperations", () => {
  it("makes singletons edit-only", () => {
    expect(singletonOps).toEqual({
      create: false,
      edit: true,
      delete: false,
      rename: false,
    });
  });

  it("lets collections do everything", () => {
    expect(collectionOps).toEqual({
      create: true,
      edit: true,
      delete: true,
      rename: true,
    });
  });
});

describe("resolveContentPermissions — schema ceiling", () => {
  it("agency cannot delete a singleton even though role allows it", () => {
    const ops = resolveContentPermissions({
      actor: agency,
      contentTypeKey: "homepage",
      schemaOperations: singletonOps,
    });
    expect(ops.edit).toBe(true);
    expect(ops.delete).toBe(false);
    expect(ops.create).toBe(false);
  });

  it("nobody gets an operation the schema omits", () => {
    const ops = resolveContentPermissions({
      actor: agency,
      contentTypeKey: "services",
      schemaOperations: { edit: true }, // create/delete/rename unspecified
    });
    expect(ops).toEqual({
      create: false,
      edit: true,
      delete: false,
      rename: false,
    });
  });
});

describe("resolveContentPermissions — role defaults", () => {
  it("staff get full ceiling on collections", () => {
    const ops = resolveContentPermissions({
      actor: staff,
      contentTypeKey: "services",
      schemaOperations: collectionOps,
    });
    expect(ops).toEqual(collectionOps);
  });

  it("client editors can edit and create but not delete or rename", () => {
    const ops = resolveContentPermissions({
      actor: client,
      contentTypeKey: "pages",
      schemaOperations: collectionOps,
    });
    expect(ops).toEqual({
      create: true,
      edit: true,
      delete: false,
      rename: false,
    });
  });

  it("viewers can do nothing", () => {
    const ops = resolveContentPermissions({
      actor: viewer,
      contentTypeKey: "pages",
      schemaOperations: collectionOps,
    });
    expect(ops).toEqual({
      create: false,
      edit: false,
      delete: false,
      rename: false,
    });
  });
});

describe("resolveContentPermissions — member overrides", () => {
  it("clamps a client below their role default", () => {
    const clamped: Actor = {
      kind: "client",
      role: "client_editor",
      override: { contentTypes: { pages: { create: false } } },
    };
    const ops = resolveContentPermissions({
      actor: clamped,
      contentTypeKey: "pages",
      schemaOperations: collectionOps,
    });
    expect(ops.create).toBe(false);
    expect(ops.edit).toBe(true);
  });

  it("an override can never grant beyond the role/schema ceiling", () => {
    // Try to grant delete to a client; role default already denies it.
    const sneaky: Actor = {
      kind: "client",
      role: "client_editor",
      override: { contentTypes: { pages: { delete: true } } },
    };
    const ops = resolveContentPermissions({
      actor: sneaky,
      contentTypeKey: "pages",
      schemaOperations: collectionOps,
    });
    expect(ops.delete).toBe(false);
  });

  it("override only affects the named content type", () => {
    const clamped: Actor = {
      kind: "client",
      role: "client_editor",
      override: { contentTypes: { pages: { edit: false } } },
    };
    expect(
      can("edit", {
        actor: clamped,
        contentTypeKey: "services",
        schemaOperations: collectionOps,
      }),
    ).toBe(true);
    expect(
      can("edit", {
        actor: clamped,
        contentTypeKey: "pages",
        schemaOperations: collectionOps,
      }),
    ).toBe(false);
  });
});

describe("canUseMedia", () => {
  it("agency always can", () => {
    expect(canUseMedia(agency)).toBe(true);
  });
  it("client can by default, denied when overridden off", () => {
    expect(canUseMedia(client)).toBe(true);
    expect(
      canUseMedia({
        kind: "client",
        role: "client_editor",
        override: { allowMedia: false },
      }),
    ).toBe(false);
  });
  it("viewers cannot", () => {
    expect(canUseMedia(viewer)).toBe(false);
  });
});
