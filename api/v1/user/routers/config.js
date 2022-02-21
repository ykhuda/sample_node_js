import app from 'express'

import constants from '../../../../helpers/constants/constants.js'
import {checkUid} from '../../../../middlewares/access.js'
import {configController} from "../controllers/Config.js";
import {orderMiddleware} from "../../../../middlewares";

const router = app.Router()
const {UNAUTHORIZED} = constants

router.get('/index', checkUid([UNAUTHORIZED, 'no uid']), configController.index);

//redtail integration
router.get('/order', checkUid([UNAUTHORIZED, 'no uid']), configController.orderConfigList);

router.post('/order', checkUid([UNAUTHORIZED, 'no uid']), orderMiddleware.checkOrderConfig, configController.orderConfig);

export const ConfigRouter = router
