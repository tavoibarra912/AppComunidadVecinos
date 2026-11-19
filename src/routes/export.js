import { Router } from "express";
import { exportDataset, getExportableInventory, previewDataset } from "../export-service.js";

const router = Router();

/**
 * Devuelve el inventario de tablas e informes disponibles para exportar según los permisos del usuario activo.
 */
router.get("/inventory", (req, res, next) => {
  try {
    const list = getExportableInventory(req.user);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

/**
 * Previsualización JSON de un dataset sin generar archivo (para la UI de Informes).
 * GET /api/export/:tableId/preview?communityId=...&query=...&limit=200
 */
router.get("/:tableId/preview", (req, res, next) => {
  try {
    const { tableId } = req.params;
    const { communityId, query, limit, sortKey, sortDir } = req.query;
    const filters = {};
    if (communityId) filters.communityId = communityId;
    if (query) filters.query = query;
    const sort = sortKey ? { key: sortKey, dir: sortDir || "asc" } : null;
    const result = previewDataset({
      user: req.user,
      tableId,
      filters,
      sort,
      limit: Math.min(Number(limit) || 200, 500),
    });
    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Genera y descarga el archivo exportado (CSV, XLSX o PDF) con control de permisos, filtros y límites.
 */
router.post("/:tableId", async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const {
      format = "csv",
      filters = {},
      sort = null,
      columns = null,
      itemIds = null,
      groupBy = null,
    } = req.body || {};

    const result = await exportDataset({
      user: req.user,
      tableId,
      format,
      filters,
      sort,
      columns,
      itemIds,
      groupBy,
      req,
    });

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(result.buffer);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

export default router;
