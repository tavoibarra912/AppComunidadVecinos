import fs from "node:fs";

// Corrige el id del comm_admin: es user-comm_admin (guion bajo), no user-comm-admin.
let db = fs.readFileSync("src/db.js", "utf8");
db = db.split('"user-comm-admin"').join('"user-comm_admin"');
db = db.split("'user-comm-admin'").join("'user-comm_admin'");
fs.writeFileSync("src/db.js", db);

let st = fs.readFileSync("scripts/tests/seed.test.mjs", "utf8");
st = st.split('"user-comm-admin"').join('"user-comm_admin"');
fs.writeFileSync("scripts/tests/seed.test.mjs", st);

console.log("OK");
