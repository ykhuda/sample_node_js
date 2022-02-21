import app from 'express'

import {checkUid} from '../../../../middlewares/access.js'
import constants from '../../../../helpers/constants/constants.js'
import {checkAuthController} from "../controllers/CheckAuth.js";

const {INVALID_DATA} = constants
const router = app.Router()

router.get('/auth', checkUid([INVALID_DATA, 'no uid']), checkAuthController.check)

export const CheckAuthRouter = router
