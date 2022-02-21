import db from '../../../../db/models'
import {ErrorHandler} from '../../../../middlewares/error.js'
import constants from '../../../../helpers/constants/constants.js'

const {INVALID_DATA, OK} = constants

const validCoupon = async (coupon, userId) => {
  const {count} = await db.order.findAndCountAll({
    where: {
      discount_code: coupon.code,
      user_id: userId,
      test_mode: 0,
    },
  })
  if (count > 0) {
    throw new ErrorHandler(INVALID_DATA, 'Coupon already used')
  }
}

const getCoupon = async (code, userId) => {
  const coupon = await db.coupons.findOne({
    where: {
      code,
    },
  })

  if (!coupon) {
    throw new ErrorHandler(INVALID_DATA, 'Invalid coupon code')
  }

  const today = new Date().getTime()
  const expirationDate = new Date(coupon.expiration_date).getTime()

  if (today > expirationDate) {
    throw new ErrorHandler(INVALID_DATA, 'Coupon already expired')
  }

  await validCoupon(coupon, userId)

  return coupon.credit
}

const getCouponCredit = async (req, res, next) => {
  try {
    const {query: {couponCode}, user: {id}} = req

    if (!couponCode) {
      throw new ErrorHandler(INVALID_DATA, 'not set coupon code')
    }

    const discountCredit = await getCoupon(couponCode, id)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      discountCredit,
    })
  } catch (e) {
    next(e)
  }
}

const couponController = {
  getCouponCredit
}

export {
  couponController,
  getCoupon,
}
