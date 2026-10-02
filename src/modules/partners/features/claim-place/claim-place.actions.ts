"use server";

import { revalidatePath } from "next/cache";
import { can, withCapability, withRole } from "@/modules/identity";
import { ForbiddenError, err } from "@/shared/kernel";
import { formAction, type FormState } from "@/shared/http/form-action";
import { approveClaim, partnerRepository, rejectClaim, requestClaim } from "../../composition";
import type { PlaceClaim } from "../../domain/place-claim";
import { claimRejectSchema, claimReviewSchema, claimSchema } from "./claim-place.use-cases";

const request = formAction(
  claimSchema,
  withRole("partner", async (input, user) => {
    const partner = await partnerRepository().findByOwner(user.id);
    if (partner?.status !== "approved") return err(new ForbiddenError("Seu cadastro de parceiro precisa estar aprovado."));
    return requestClaim().execute({ userId: user.id, partnerId: partner.id }, input.placeId);
  }),
  { name: "partners.claim-place" },
);

export async function requestClaimAction(previous: FormState<PlaceClaim>, formData: FormData) {
  const state = await request(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/lugares");
  return state;
}

const approve = formAction(
  claimReviewSchema,
  withCapability("partners:review", (input, user) => approveClaim().execute({ id: user.id, isAdmin: can(user, "partners:review") }, input.claimId)),
  { name: "partners.approve-claim" },
);

const reject = formAction(
  claimRejectSchema,
  withCapability("partners:review", (input, user) => rejectClaim().execute({ id: user.id, isAdmin: can(user, "partners:review") }, input.claimId, input.reason)),
  { name: "partners.reject-claim", keepValues: ["reason"] },
);

export async function approveClaimAction(previous: FormState<PlaceClaim>, formData: FormData) {
  const state = await approve(previous, formData);
  if (state.status === "success") revalidatePath("/admin/parceiros");
  return state;
}

export async function rejectClaimAction(previous: FormState<PlaceClaim>, formData: FormData) {
  const state = await reject(previous, formData);
  if (state.status === "success") revalidatePath("/admin/parceiros");
  return state;
}
