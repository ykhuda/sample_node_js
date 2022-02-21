import app from 'express'

import {fontsController} from '../controllers/Fonts.js'
import {checkUid} from '../../../../middlewares/access.js'
import constants from '../../../../helpers/constants/constants.js'

const {UNAUTHORIZED} = constants

const router = app.Router()

router.get('/listForCustomizer', fontsController.getForCustomizer)

router.get('/list', checkUid([UNAUTHORIZED, 'no auth']), fontsController.list)

export const FontRouter = router
