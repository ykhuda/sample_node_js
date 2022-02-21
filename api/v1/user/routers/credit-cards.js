import app from 'express'

import {checkUid} from '../../../../middlewares/access.js'
import {creditCardController,} from '../controllers/CreditCards.js'
import constants from '../../../../helpers/constants/constants.js'

const {UNAUTHORIZED} = constants
const router = app.Router()

router.get('/list', checkUid([UNAUTHORIZED, 'no auth']), creditCardController.list)

router.get('/listOnly', checkUid([UNAUTHORIZED, 'no auth']), creditCardController.listOnly)

router.post('/setDefault', checkUid([UNAUTHORIZED, 'no auth']), creditCardController.setDefault)

router.post('/delete', checkUid([UNAUTHORIZED, 'no auth']), creditCardController.deleteCreditCard)

router.post('/addNew', checkUid([UNAUTHORIZED, 'no auth']), creditCardController.addNew)

export const CreditCardsRouter = router
