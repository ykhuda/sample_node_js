import app from 'express';

import {checkUid} from '../../../../middlewares/access.js'
import {couponController} from '../controllers/Coupon.js'
import constants from '../../../../helpers/constants/constants.js'

const {UNAUTHORIZED} = constants
const router = app.Router()

router.get('/getCouponCredit', checkUid([UNAUTHORIZED, 'no auth']), couponController.getCouponCredit)

export const CouponRouter = router
