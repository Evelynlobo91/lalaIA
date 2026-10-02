"use client";

import { useActionState } from "react";
import { categories } from "@/shared/catalog/categories";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { createPlaceAction } from "../create-place.action";

/** Backoffice (#143): cadastro de estabelecimento pelo admin. O horário é informado depois, na edição. */
export function CreatePlaceForm() {
  const [state, action, pending] = useActionState<FormState<{ placeId: string }>, FormData>(createPlaceAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <TextField label="Nome" name="name" required maxLength={200} defaultValue={values.name} errors={errors.name} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Categoria
        <select name="category" defaultValue={values.category ?? categories[0].id} className="h-12 rounded-xl border border-border bg-surface px-3 text-base">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {errors.category && <span className="text-sm font-normal text-danger">{errors.category[0]}</span>}
      </label>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <TextField label="Rua" name="street" maxLength={200} defaultValue={values.street} errors={errors.street} />
        <TextField label="Número" name="houseNumber" maxLength={20} defaultValue={values.houseNumber} errors={errors.houseNumber} />
      </div>
      <TextField label="Bairro" name="neighborhood" maxLength={120} defaultValue={values.neighborhood} errors={errors.neighborhood} />
      <TextField label="Telefone" name="phone" type="tel" maxLength={60} defaultValue={values.phone} errors={errors.phone} />
      <TextField label="Site" name="website" type="url" placeholder="https://" defaultValue={values.website} errors={errors.website} />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Localização no mapa</legend>
        <p className="text-sm text-muted">
          No Google Maps ou no OpenStreetMap, toque e segure no ponto do estabelecimento e copie as coordenadas. Depois de cadastrado, o ponto não pode ser alterado.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Latitude" name="lat" required inputMode="decimal" placeholder="-26.3045" defaultValue={values.lat} errors={errors.lat} />
          <TextField label="Longitude" name="lon" required inputMode="decimal" placeholder="-48.8456" defaultValue={values.lon} errors={errors.lon} />
        </div>
      </fieldset>

      <Button type="submit" loading={pending} className="self-start">
        Cadastrar estabelecimento
      </Button>
    </form>
  );
}
