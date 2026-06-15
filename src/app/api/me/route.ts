import { isAgency } from "@/lib/auth/access";
import { json, requireUser, route } from "@/lib/api/context";

export const GET = route(async () => {
  const user = await requireUser();
  return json({ id: user.id, email: user.email, isAgency: await isAgency(user.id) });
});
