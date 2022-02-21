import app from 'express'

import {checkUid} from '../../../../middlewares/access.js'
import {
  calcTaxes,
  findByAttribytes,
  getListChild,
  getUserOrders,
  getUserPastOrders,
  orderController,
  orderPay,
  pastBaskets,
  place,
  placeBasket,
} from '../controllers/Order.js'
import {getHolidays} from '../controllers/Holidays.js'
import constants from '../../../../helpers/constants/constants.js'
import {ErrorHandler} from '../../../../middlewares/error.js'
import {refundOrder} from '../../admin/controllers/Orders.js'
import {transaction} from '../../../../helpers/utils/model.utils.js'
import platformMw from '../../../../middlewares/platform.js'
import {check_billing_info, orderMiddleware, preFormating} from '../../../../middlewares'

const {UNAUTHORIZED, OK, INVALID_DATA} = constants

const router = app.Router()

// Get user`s order
router.get('/details', checkUid([UNAUTHORIZED, 'no auth']), orderController.orderDetails)

// api +
router.get('/getHolidays', checkUid([UNAUTHORIZED, 'no auth']), async (req, res, next) => {
  try {
    const holiday = await getHolidays()

    res.json({
      holidays: holiday.map((value) => ({
        ...value,
      })),
    })
  } catch (e) {
    next(e)
  }
})

router.get('/past', checkUid([UNAUTHORIZED, 'no auth']), async (req, res, next) => {
  try {
    const {user, query} = req

    res.json({
      httpCode: OK,
      status: 'ok',
      orders: await getUserPastOrders(user, query),
    })
  } catch (e) {
    next(e)
  }
})

//api +
router.post('/cancel', checkUid([UNAUTHORIZED, 'no auth']), async (req, res, next) => {
  try {
    const {body: {order_id = ''}, user} = req

    if (!order_id || !+order_id) {
      throw new ErrorHandler(INVALID_DATA, 'order id error')
    }
    const order = await findByAttribytes(order_id, user.id)

    if (order === null || (order.status !== 'paid' && order.status !== 'suspended')) {
      throw new ErrorHandler(INVALID_DATA, 'no such order')
    }

    if (!await refundOrder(order)) {
      throw new ErrorHandler(INVALID_DATA, 'error cancelling order')
    }

    res.json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
})

router.get('/pastBaskets', checkUid([UNAUTHORIZED, 'No auth.']), async (req, res, next) => {
  try {
    const {user} = req

    res.json({
      httpCode: OK,
      status: 'ok',
      baskets: await pastBaskets(user.id),
    })
  } catch (e) {
    next(e)
  }
})

router.get('/list', checkUid([UNAUTHORIZED, 'No auth.']), async (req, res, next) => {
  try {
    const {user} = req

    const orders = await getUserOrders(user)

    res.json({
      httpCode: OK,
      status: 'ok',
      orders,
    })
  } catch (e) {
    next(e)
  }

})

router.post('/placeBasket',
  checkUid([UNAUTHORIZED, 'No auth.']),
  platformMw,
  check_billing_info,
  orderMiddleware.check_shipping_method,
  orderMiddleware.addressValid,
  orderMiddleware.checkAddressWithFile,
  orderMiddleware.placeBasketBodyValid,
  placeBasket)

router.post('/calcTaxes', checkUid([UNAUTHORIZED, 'No auth.']), calcTaxes)

router.post('/place', checkUid([UNAUTHORIZED, 'No auth.']), platformMw, (req, res, next) => transaction(async (t) => {
  try {
    const {user, body} = req
    const {locals: {platform}} = res

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      order_id: await place(user, body, platform, t),
    })
  } catch (e) {
    next(e)
  }
}))

//api +
router.get('/listChilds', checkUid([UNAUTHORIZED, 'No auth.']), async (req, res, next) => {
  try {
    const {user, query} = req

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      childs: await getListChild(user, query),
    })
  } catch (e) {
    next(e)
  }
})

router.get('/listGrouped', checkUid([UNAUTHORIZED, 'No auth.']), preFormating.query('past_order'), orderController.listGrouped)

router.post('/pay', checkUid([UNAUTHORIZED, 'No auth.']), orderMiddleware.createSendDateForPay, orderPay)

router.post('/singleStepOrder', platformMw, orderMiddleware.singleStepCheckValidData, orderController.singleStepController)

export const OrderRouter = router
