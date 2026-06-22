const express = require("express");
const router = express.Router();

const { validateSchema } = require("../middlewares/validate");
const { generateSchema, updateSeatsSchema } = require("../validation/licenseValidation");
const protectSuperAdmin = require("../middlewares/protectSuperAdmin");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  generate,
  getAll,
  getOne,
  activate,
  suspend,
  expire,
  updateSeats,
  remove,
} = require("../controller/licenseController");

router.use(protectSuperAdmin, authorizeRoles("super_admin"));

router.post("/generate", validateSchema(generateSchema), generate);

router.get("/", getAll);
router.get("/:id", getOne);

router.put("/:id/activate", activate);
router.put("/:id/suspend", suspend);
router.put("/:id/expire", expire);
router.put("/:id/seats", validateSchema(updateSeatsSchema), updateSeats);

router.delete("/:id", remove);

module.exports = router;
