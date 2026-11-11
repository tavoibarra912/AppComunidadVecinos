import { test } from "node:test";
import assert from "node:assert/strict";
import { accountView } from "../../public/js/account-view.js";

function fixture() {
  return {
    currentUserId: "new-user",
    users: [
      {
        id: "new-user",
        nombre: "Manuel",
        apellido: "Prueba",
        usuario: "manuel",
        rol: "user",
      },
      {
        id: "demo-user",
        nombre: "Carlos",
        apellido: "Ruiz Mendoza",
        usuario: "urucp1",
        rol: "user",
      },
    ],
    roles: [{ id: "role-user", nombre: "user" }],
    owners: [
      {
        id: "demo-owner",
        userId: "demo-user",
        name: "Carlos",
        surname: "Ruiz Mendoza",
      },
    ],
    tenants: [],
    properties: [
      {
        id: "demo-property",
        communityId: "demo-community",
        ownerIds: ["demo-owner"],
      },
    ],
    communities: [
      { id: "demo-community", name: "Comunidad de ejemplo", adminUserId: "" },
    ],
  };
}
test("cuenta nueva: no adopta el propietario ni la comunidad de los datos demo", () => {
  const result = accountView(fixture());
  assert.equal(result.displayName, "Manuel Prueba");
  assert.deepEqual(result.owners, []);
  assert.deepEqual(result.communities, []);
  assert.equal(result.hasProfile, false);
  assert.equal(result.communityTitle, "Perfil pendiente de vinculación");
  assert.doesNotMatch(result.communityMessage, /Carlos|Modo Propietario/);
});
test("perfil de propietario: muestra sólo las comunidades de sus inmuebles", () => {
  const data = fixture();
  data.owners.push({
    id: "own-profile",
    userId: "new-user",
    name: "Propietario",
    surname: "Vinculado",
  });
  data.properties.push({
    id: "own-property",
    communityId: "own-community",
    ownerIds: ["own-profile"],
  });
  data.communities.push({ id: "own-community", name: "Comunidad vinculada" });
  const result = accountView(data);
  assert.equal(result.displayName, "Manuel Prueba");
  assert.deepEqual(
    result.communities.map((item) => item.id),
    ["own-community"],
  );
  assert.equal(result.communityTitle, "Perfil de propietario");
});
test("perfil de inquilino: no se presenta como propietario", () => {
  const data = fixture();
  data.tenants.push({
    id: "own-tenancy",
    userId: "new-user",
    propertyId: "demo-property",
  });
  const result = accountView(data);
  assert.equal(result.communityTitle, "Perfil de inquilino");
  assert.equal(result.owners.length, 0);
  assert.equal(result.communities.length, 1);
});
test("perfil vinculado sin inmueble: informa que falta asignar una comunidad", () => {
  const data = fixture();
  data.owners.push({ id: "unassigned-owner", userId: "new-user" });
  const result = accountView(data);
  assert.equal(result.hasProfile, true);
  assert.equal(result.communityTitle, "Sin comunidad asignada");
  assert.equal(result.communities.length, 0);
});
test("el perfil de administración se deriva de la asignación real", () => {
  const data = fixture();
  data.users[0].rol = "community_admin";
  data.roles.push({ id: "admin-role", nombre: "community_admin" });
  data.communities[0].adminUserId = "new-user";
  const result = accountView(data, {
    community_admin: "Administrador de Comunidad",
  });
  assert.equal(result.roleLabel, "Administrador de Comunidad");
  assert.equal(result.communityTitle, "Administración de comunidad");
});
test("sin sesión no se usa otra cuenta como perfil de reserva", () => {
  const data = fixture();
  data.currentUserId = null;
  const result = accountView(data);
  assert.equal(result.user, null);
  assert.equal(result.displayName, "");
  assert.deepEqual(result.owners, []);
  assert.deepEqual(result.communities, []);
});
