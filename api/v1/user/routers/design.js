import app from 'express'

import {designController} from '../controllers/Design.js'
import constants from '../../../../helpers/constants/constants.js'
import {checkUid} from '../../../../middlewares/access.js'

const {UNAUTHORIZED} = constants
const router = app.Router()

router.get('/getCustomizedCard', designController.customizedCard)

router.get('/getCustomCard', checkUid([UNAUTHORIZED, 'no auth']), designController.customCard);

router.post('/delete', checkUid([UNAUTHORIZED, 'no auth']), designController.softDelete)

export const DesignRouter = router
