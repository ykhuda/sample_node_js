import app from 'express'

import constants from '../../../../helpers/constants/constants.js'
import {checkUid} from '../../../../middlewares/access.js'
import {notificationController} from '../controllers/Notifications.js'

const {UNAUTHORIZED} = constants
const router = app.Router()


router.get('/list', notificationController.list)

router.get('/markAsRead', checkUid([UNAUTHORIZED, 'no auth']), notificationController.markAsRead)


export const NotificationsRouter = router
