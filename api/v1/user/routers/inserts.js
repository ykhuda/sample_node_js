import app from 'express'

import {insertController} from '../controllers/Inserts.js'
import constants from '../../../../helpers/constants/constants.js'
import {checkUid} from '../../../../middlewares/access.js'

const {UNAUTHORIZED} = constants
const router = app.Router()

// Get inserts list
router.get('/list', checkUid([UNAUTHORIZED, 'no auth']), insertController.list)

export const InsertRouter = router
