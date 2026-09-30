"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/shared/db/sql";
import { formAction, type FormState } from "@/shared/http/form-action";
import { logger } from "@/shared/observability";
import { PostgresProfileRepository } from "../../infra/postgres-profile-repository";
import { SupabaseAvatarStorage } from "../../infra/supabase-avatar-storage";
import { createSupabaseServerClient } from "../../infra/supabase-server-client";
import { withUser } from "../session/current-user";
import { UploadAvatar, uploadAvatarSchema } from "./upload-avatar";

const handle = formAction(
  uploadAvatarSchema,
  withUser(async (input, user) => {
    const useCase = new UploadAvatar(
      new PostgresProfileRepository(sql()),
      new SupabaseAvatarStorage(await createSupabaseServerClient()),
      logger().child({ module: "identity", slice: "upload-avatar" }),
    );
    return useCase.execute(user.id, new Uint8Array(await input.avatar.arrayBuffer()));
  }),
  { name: "identity.upload-avatar" },
);

export async function uploadAvatarAction(previous: FormState<{ avatarUrl: string }>, formData: FormData) {
  const state = await handle(previous, formData);
  if (state.status === "success") revalidatePath("/perfil", "layout");
  return state;
}
