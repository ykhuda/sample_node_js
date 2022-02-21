import app from 'express';
import constants from '../../../../helpers/constants/constants.js';
import {checkUid} from '../../../../middlewares/access.js';
import {
  getBasketItem,
  getBasketOrders,
  getFromAddress,
  removeBasket,
  cancelBasket,
  getUserBasketOrdersGrouped, basketSend, updateBasket, getAllNewOrders, basketController
} from '../controllers/Basket.js';
import {ErrorHandler} from "../../../../middlewares/error.js";
import {check_billing_info, orderMiddleware} from "../../../../middlewares";
import {orderController} from "../controllers/Order.js";

const {OK, UNAUTHORIZED, INVALID_DATA} = constants

const router = app.Router();

router.get('/itemFromAddress', checkUid([UNAUTHORIZED, 'no auth']), async (req, res, next) => {
  try {
    const {query: {id}, user: {id: user_id}} = req

    const {address, address_ids} = await getFromAddress(id, user_id)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      address,
      address_ids,
    })
  } catch (e) {
    next(e);
  }
});

router.post('/clear', checkUid([UNAUTHORIZED, 'No auth.']), basketController.clearOrders);

router.get('/count', checkUid([UNAUTHORIZED, 'No auth.']), orderController.count);

router.get('/item', checkUid([UNAUTHORIZED, 'No auth.']), async (req, res, next) => {
  try {
    const {query: {id}} = req

    const item = await getBasketItem(id)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      item,
    })
  } catch (e) {
    next(e);
  }
})

router.get('/allNew', checkUid([UNAUTHORIZED, 'No auth.']), async (req, res, next) => {
  try {
    const {user, query} = req

    const allNew = await getAllNewOrders(user, query)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      ...allNew,
    })
  } catch (e) {
    next(e);
  }
})

router.post('/remove', checkUid([UNAUTHORIZED, 'No auth.']), async (req, res, next) => {
  try {
    const {user, body: {id}} = req
    await removeBasket(user, id)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
})

router.post('/cancel', checkUid([UNAUTHORIZED, 'No auth.']), async (req, res, next) => {
  try {
    const {user, body: {id}} = req;

    await cancelBasket(id, user.id)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
})

router.get('/allGrouped', checkUid([UNAUTHORIZED, 'No auth.']), async (req, res, next) => {
  try {
    const {user} = req;

    let testMode = 0;
    let orders = [];

    if (user) {
      orders = await getUserBasketOrdersGrouped(user)
      testMode = user.test_mode
    }

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      test_mode: testMode,
      items: orders,
    })
  } catch (e) {
    next(e)
  }
})

router.get('/basketOrders', checkUid([UNAUTHORIZED, 'No auth.']), async (req, res, next) => {
  try {
    const {user, query: {id}} = req

    if (!id) throw new ErrorHandler(INVALID_DATA, 'basket id not found')

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      basket: await getBasketOrders(user, id)
    })
  } catch (e) {
    next(e)
  }
})

router.post('/send', checkUid([UNAUTHORIZED, 'No auth.']), check_billing_info, orderMiddleware.checkValidBodyForSend, basketSend)

router.post('/update', checkUid([UNAUTHORIZED, 'No auth.']), orderMiddleware.addressValid, orderMiddleware.placeBasketBodyValid, updateBasket)

export const BasketRouter = router
