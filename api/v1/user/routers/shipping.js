import app from 'express';

import {shippingController} from '../controllers/Shipping.js';
import {checkUid} from "../../../../middlewares/access.js";
import constants from "../../../../helpers/constants/constants.js";

const {UNAUTHORIZED} = constants;

const router = app.Router();

router.get('/rates', checkUid([UNAUTHORIZED, 'no auth']), shippingController.rates);

router.get('/methods', checkUid([UNAUTHORIZED, 'no auth']), shippingController.methods);

export const ShippingRouter = router;
