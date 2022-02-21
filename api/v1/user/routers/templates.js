import app from 'express'

import {checkUid} from '../../../../middlewares/access.js'
import constants from '../../../../helpers/constants/constants.js'
import {templateController} from '../controllers/Template.js'

const {UNAUTHORIZED} = constants

const router = app.Router()

router.post('/create', checkUid([UNAUTHORIZED, 'no auth']), templateController.create)

router.post('/update', checkUid([UNAUTHORIZED, 'no auth']), templateController.update)

router.post('/delete', checkUid([UNAUTHORIZED, 'no auth']), templateController.deleteTemplates)

router.get('/list', checkUid([UNAUTHORIZED, 'no auth']), templateController.list)

router.get('/view', checkUid([UNAUTHORIZED, 'no auth']), templateController.view)

export const TemplateRouter = router
