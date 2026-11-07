import { Router } from "express";
const router = Router();
router.use((_req, res) =>
  res
    .status(503)
    .json({
      error:
        "El envío de códigos no está configurado. Podés guardar el contacto sin verificar.",
    }),
);
export default router;
