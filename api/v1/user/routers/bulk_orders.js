import app from 'express'

import {checkUid} from "../../../../middlewares/access.js";
import constants from "../../../../helpers/constants/constants.js";
import {parseXml} from "../controllers/BulkOrders.js";

const {UNAUTHORIZED} = constants

const router = app.Router()

router.post('/parseXls', checkUid([UNAUTHORIZED, 'No auth.']), parseXml)

export const BulkOrdersRouter = router
