import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subscriptions as placesSubscriptions } from "@/modules/places";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { InMemoryEventBus } from "@/shared/events";
import { ApprovePlaceClaim, RequestPlaceClaim } from "../features/claim-place/claim-place.use-cases";
import { placesLookup } from "./places-lookup";
import { PostgresPlaceClaimRepository } from "./postgres-place-claim-repository";

// Fluxo completo contra o banco: pedido → aprovação → evento → places marca o dono → edição sob RLS.
const db = sql();
const claims = new PostgresPlaceClaimRepository(db);
const dono = crypto.randomUUID();
const outro = crypto.randomUUID();
const admin = crypto.randomUUID();
let partnerDono: string;
let partnerOutro: string;
let placeId: string;

beforeAll(async () => {
  for (const id of [dono, outro, admin]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`c-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${admin}, 'admin'), (${dono}, 'partner'), (${outro}, 'partner')`;
  [{ id: partnerDono }] = await db`insert into partners.partners (owner_id, kind, business_name, phone, description, status) values (${dono}, 'estabelecimento', 'Café do Dono', '47999990000', ${"x".repeat(20)}, 'approved') returning id`;
  [{ id: partnerOutro }] = await db`insert into partners.partners (owner_id, kind, business_name, phone, description, status) values (${outro}, 'estabelecimento', 'Café do Outro', '47999990001', ${"x".repeat(20)}, 'approved') returning id`;
  [{ id: placeId }] = await db`
    insert into places.places (source, source_id, name, category, location)
    values ('osm', ${`teste-claim/${dono}`}, 'Café Reivindicado', 'cafes', extensions.st_makepoint(-48.84, -26.3)::extensions.geography)
    returning id`;
});

afterAll(async () => {
  await db`delete from places.places where id = ${placeId}`;
  await db`delete from auth.users where id in (${dono}, ${outro}, ${admin})`;
  await db.end();
});

describe("reivindicação de lugar (integração)", () => {
  it("parceiro não vê nem cria pedido em nome de outro parceiro", async () => {
    await expect(asUser(outro, (tx) => tx`insert into partners.place_claims (partner_id, place_id) values (${partnerDono}, ${placeId})`, db)).rejects.toThrow(/row-level security/);
  });

  it("pedido → aprovação → evento → places marca o responsável", async () => {
    const requested = await new RequestPlaceClaim(claims, placesLookup).execute({ userId: dono, partnerId: partnerDono }, placeId);
    expect(requested.ok && requested.value.status).toBe("pending");

    // Outro parceiro também pede o mesmo lugar (ainda sem dono).
    await new RequestPlaceClaim(claims, placesLookup).execute({ userId: outro, partnerId: partnerOutro }, placeId);
    expect(await asUser(dono, (tx) => tx`select id from partners.place_claims where partner_id = ${partnerOutro}`, db)).toHaveLength(0);

    const bus = new InMemoryEventBus();
    placesSubscriptions(bus);
    const approved = await new ApprovePlaceClaim(claims, bus).execute({ id: admin, isAdmin: true }, requested.ok ? requested.value.id : "");
    expect(approved.ok).toBe(true);

    const [place] = await db`select managed_by from places.places where id = ${placeId}`;
    expect(place.managed_by).toBe(dono);
  });

  it("um lugar só tem um dono: aprovar o pedido do outro parceiro dá conflito", async () => {
    const [pendente] = await db`select id from partners.place_claims where partner_id = ${partnerOutro} and place_id = ${placeId}`;
    const res = await new ApprovePlaceClaim(claims, new InMemoryEventBus()).execute({ id: admin, isAdmin: true }, pendente.id);
    expect(!res.ok && res.error.code).toBe("conflict");
  });

  it("lugar com dono não aceita novos pedidos", async () => {
    const res = await new RequestPlaceClaim(claims, placesLookup).execute({ userId: outro, partnerId: partnerOutro }, placeId);
    expect(!res.ok && res.error.code).toBe("conflict");
  });

  it("RLS em places: dono edita, outro não, e ninguém muda a localização", async () => {
    const editByDono = await asUser(dono, (tx) => tx`update places.places set name = 'Café Novo Nome' where id = ${placeId} returning id`, db);
    expect(editByDono).toHaveLength(1);

    const editByOutro = await asUser(outro, (tx) => tx`update places.places set name = 'Hackeado' where id = ${placeId} returning id`, db);
    expect(editByOutro).toHaveLength(0);

    await expect(
      asUser(dono, (tx) => tx`update places.places set location = extensions.st_makepoint(0, 0)::extensions.geography where id = ${placeId}`, db),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(dono, (tx) => tx`update places.places set managed_by = ${outro} where id = ${placeId}`, db)).rejects.toThrow(/permission denied/);
  });
});
