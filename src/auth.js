import crypto from "node:crypto";
import { db } from "./db.js";

export function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}
export function newSalt() {
  return crypto.randomBytes(16).toString("hex");
}
export function passwordRecord(password) {
  const salt = newSalt();
  return `scrypt:${salt}:${hashPassword(password, salt)}`;
}
export function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  let computed, expected;
  if (parts[0] === "scrypt" && parts.length === 3) {
    if (!/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2]))
      return false;
    computed = hashPassword(password, parts[1]);
    expected = parts[2];
  } else if (parts.length === 2 && /^[a-f0-9]{64}$/.test(parts[1])) {
    computed = crypto
      .createHash("sha256")
      .update(`${parts[0]}:${password}`)
      .digest("hex");
    expected = parts[1];
  } else return false;
  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(expected, "hex"),
  );
}
export function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}
export function findUserByEmail(email) {
  return db
    .prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)")
    .get(String(email || "").trim());
}
export function setPassword(userId, password) {
  db.prepare(
    "UPDATE users SET passwordHash = ?, resetToken = '', resetTokenExpira = '' WHERE id = ?",
  ).run(passwordRecord(password), userId);
  db.prepare("DELETE FROM sessions WHERE userId = ?").run(userId);
}
