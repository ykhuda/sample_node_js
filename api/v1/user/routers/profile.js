import app from "express";

import {profileController} from "../controllers/Profile.js";
import {checkUid} from "../../../../middlewares/access.js";

import platformMW from "../../../../middlewares/platform.js";
import check_recipient_address from "../../../../middlewares/check_recipient_address.js";
import constants from "../../../../helpers/constants/constants.js";

const {UNAUTHORIZED} = constants;

const router = app.Router();

//GET
router.get("/shareOptions",
  platformMW,
  profileController.shareOptions
);

router.get(
  "/settings",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.settings
);

router.get(
  "/address",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.address
);

router.get(
  "/recipientsList",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.recipientsList
);

router.get(
  "/listAddresses",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.list
);

router.get(
  "/signatures",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.signature
);

router.get(
  "/getAuthorizeNetInfo",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.getAuthorizeNetInfo
);

router.get(
  "/credits",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.getCredits
);

//POST
router.post(
  "/setDefaultAddress",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.setDefaultAddress
);

router.post(
  "/createAddress",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.create
);

router.post(
  "/addRecipient",
  checkUid([UNAUTHORIZED, "no auth"]),
  check_recipient_address.create,
  profileController.addRecipient
);

router.post(
  "/updateRecipient",
  checkUid([UNAUTHORIZED, "no auth"]),
  check_recipient_address.update,
  profileController.updateRecipient
);

router.post(
  "/deleteRecipient",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.deleteRecipient
);

router.post(
  "/deleteAddress",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.deleteAddress
);

router.post(
  "/updateBillingInfo",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.updateBillingInfo
);

router.post(
  "/actionChangeEmail",
  checkUid([UNAUTHORIZED, "No auth."]),
  profileController.changeUserEmail
);

router.post(
  "/changePassword",
  checkUid([UNAUTHORIZED, "No auth."]),
  platformMW,
  profileController.changeProfilePassword
);

router.post(
  "/shareApp",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.shareApp
);

router.post(
  "/parseXls",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.parseXls
);

//PUT
router.put(
  "/updateAddress",
  checkUid([UNAUTHORIZED, "no auth"]),
  profileController.update
);

export const ProfileRouter = router;
