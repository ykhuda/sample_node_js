import app from 'express'

import {checkUid} from '../../../../middlewares/access.js'
import {check_billing_info} from '../../../../middlewares'
import {subscriptionController} from '../controllers/Subscriptions.js'
import constants from '../../../../helpers/constants/constants.js';

const {UNAUTHORIZED} = constants;
const router = app.Router()

router.get('/list', checkUid([UNAUTHORIZED, 'no auth']), subscriptionController.list)

router.get('/renewalTax', checkUid([UNAUTHORIZED, 'no auth']), subscriptionController.renewalTax)

router.get('/taxList', checkUid([UNAUTHORIZED, 'no auth']), subscriptionController.taxList)

router.post('/cancel', checkUid([UNAUTHORIZED, 'no auth']), subscriptionController.cancel)

router.post('/updatePaymentMethod', checkUid([UNAUTHORIZED, 'no auth']), subscriptionController.updatePaymentMethod)

router.post('/new', checkUid([UNAUTHORIZED, 'no auth']), check_billing_info, subscriptionController.createNew)

export const SubscriptionRouter = router
