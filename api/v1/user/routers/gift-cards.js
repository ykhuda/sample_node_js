import app from 'express'

import {giftCardController} from '../controllers/GiftCards.js'
import constants from '../../../../helpers/constants/constants.js'
import {checkUid} from '../../../../middlewares/access.js'

const {UNAUTHORIZED} = constants
const router = app.Router()

router.get('/list', checkUid([UNAUTHORIZED, 'no auth']), giftCardController.list)

export const GiftCardsRouter = router
