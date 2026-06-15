import { json, requireSiteAccess, route } from "@/lib/api/context";
import { loadSchema } from "@/lib/content/service";
import { effectiveSchemaOperations } from "@/lib/schema/parse";
import { resolveContentPermissions } from "@/lib/permissions";

type Ctx = { params: Promise<{ siteId: string }> };

/** Site detail + schema, with the caller's effective permissions per type. */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { siteId } = await ctx.params;
  const { access } = await requireSiteAccess(siteId);
  const schema = await loadSchema(access.site);

  const content = schema.content.map((ct) => ({
    name: ct.name,
    label: ct.label,
    type: ct.type,
    permissions: resolveContentPermissions({
      actor: access.actor,
      contentTypeKey: ct.name,
      schemaOperations: effectiveSchemaOperations(ct),
    }),
  }));

  return json({
    site: {
      id: access.site.id,
      name: access.site.name,
      repo: `${access.site.repoOwner}/${access.site.repoName}`,
      deployAdapter: access.site.deployAdapter,
      clientEditingEnabled: access.site.clientEditingEnabled,
    },
    isAgency: access.actor.kind === "agency",
    media: schema.media ?? null,
    content,
  });
});
