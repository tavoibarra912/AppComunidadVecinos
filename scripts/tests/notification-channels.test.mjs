import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasCommunityCommunications,
  normalizeNotificationPreference,
  notificationChannelsLabel,
  parseNotificationChannels,
  serializeNotificationChannels,
} from "../../public/js/notification-channels.js";

test("canales: acepta listas, texto separado por comas y valores antiguos", () => {
  assert.deepEqual(parseNotificationChannels("email,postal"), ["email", "postal"]);
  assert.deepEqual(parseNotificationChannels("phone, email, phone"), ["email", "phone"]);
  assert.deepEqual(parseNotificationChannels(["email", "whatsapp", "sms"]), ["email", "phone"]);
  assert.deepEqual(parseNotificationChannels("postal;email"), ["email", "postal"]);
  assert.deepEqual(parseNotificationChannels("fax"), []);
  assert.equal(serializeNotificationChannels("phone,email,phone"), "email,phone");
  assert.equal(notificationChannelsLabel("email,postal"), "Correo electrónico · Domicilio postal");
});

test("canales: aplica verificaciones y conserva postal como último recurso", () => {
  assert.equal(
    normalizeNotificationPreference("email,phone,postal", {
      emailVerified: true,
      phoneVerified: false,
    }),
    "email,postal",
  );
  assert.equal(
    normalizeNotificationPreference("email,phone", {
      emailVerified: false,
      phoneVerified: false,
    }),
    "postal",
  );
  assert.equal(
    normalizeNotificationPreference("email", {
      emailVerified: true,
      phoneVerified: true,
    }),
    "email",
  );
  assert.equal(
    normalizeNotificationPreference("whatsapp", {
      emailVerified: false,
      phoneVerified: true,
    }),
    "phone",
  );
});

test("inquilinos: reconoce la autorización de comunicaciones comunitarias", () => {
  assert.equal(hasCommunityCommunications(["community_communications"]), true);
  assert.equal(hasCommunityCommunications('["email","community_communications"]'), true);
  assert.equal(hasCommunityCommunications(["email"]), false);
  assert.equal(hasCommunityCommunications("no-json"), false);
});
