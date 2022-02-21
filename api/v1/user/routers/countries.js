import app from 'express'

import {checkUid} from '../../../../middlewares/access.js'
import {countryController} from '../../user/controllers/Countries.js'
import constants from '../../../../helpers/constants/constants.js'

const {UNAUTHORIZED} = constants
const router = app.Router()

router.get('/list', checkUid([UNAUTHORIZED, 'no auth']), countryController.list)

router.get('/listStates', checkUid([UNAUTHORIZED, 'no auth']), countryController.stateList)

export const CountryRouter = router
