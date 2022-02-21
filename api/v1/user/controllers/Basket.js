import sequelize from "sequelize";
import lodash from "lodash";

import db from '../../../../db/models'

import {
  transaction,
  deleteEntity,
  simpleUpdateEntity,
  findEntity,
  simpleCreateEntity
} from '../../../../helpers/utils/model.utils.js';
import {ErrorHandler} from '../../../../middlewares/error.js'
import constants from '../../../../helpers/constants/constants.js'
import {refundOrder} from "../../admin/controllers/Orders.js"
import {getUrl} from "../../../../helpers/utils/media/getUrl.js";
import {
  addressesService,
  basketService,
  couponService,
  hubspotService,
  orderService,
  profileService
} from '../services';
import {getTotalByUserID} from "./CreditCards.js";
import {
  createBasketOrder,
  decorateSignatureObject,
  formatOrderNew,
  isValidCoupon,
} from "./Order.js";
import {calculate, generateLines} from "../../../../helpers/utils/avatax.helper.js";
import {pay} from "./Subscriptions.js";
import {userCreditHelper, orderTotalHelper, hubspotHelper} from "../../../../helpers/utils";
import {addToQuantity} from "../../admin/controllers/Cards.js";
import {addToQuantityInsert} from "../../admin/controllers/client/Insert.js";
import {sendMail} from "../../../../helpers/utils/mail/mail.js";

const {AWS_FOLDER_CARDIMAGE} = process.env
const {
  INVALID_DATA,
  emailTemplates,
  CONTACT_PHONE,
  GET_PRICE_STRUCTURE,
  CREDIT_CARD_TYPE,
  order_status,
  PAYMENT_METHODS,
  WEB_APP_URL,
  WEB_ROUTES,
  OK
} = constants
const {Op} = sequelize

const clearOrders = async (req, res, next) => transaction(async (t) => {
  try {
    const {user: {id}} = req;

    const orders = await db.order.findAll({
      where: {
        user_id: id,
        status: 'basket',
      },
    })
    const ordersIds = orders.map((or) => or.id);

    const [item] = await Promise.all([
      db.card_order.findAll({
        where: {
          order_id: ordersIds,
        },
      }),
      deleteEntity('order', {id: ordersIds}, t),
      deleteEntity('card_order', {order_id: ordersIds}, t),
    ]);

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      item,
    })
  } catch (e) {
    next(e)
  }
})

const getBasketItem = async (id) => {
  const item = await db.card_order.findByPk(id, {
    include: [
      {
        model: db.order,
        attributes: ['date_send'],
      },
    ],
  })

  if (item) {
    const {order, ...rest} = item.dataValues;
    return {
      ...rest,
      date_send: order.date_send,
    }
  }

  return item
}


const removeBasket = ({id: userId, free_cards}, id) => transaction(async (t) => {
  const promises = []

  if (!id) throw new ErrorHandler(INVALID_DATA, 'invalid basket item id')

  const order = await findEntity('order', null, {id})

  if (!order) {
    throw new ErrorHandler(INVALID_DATA, 'basket item not found')
  }

  const {user_id, status, is_bulk, for_free} = order

  if (user_id !== userId || status !== 'basket') {
    throw new ErrorHandler(INVALID_DATA, 'basket item not found')
  }

  if (for_free) {
    promises.push(simpleUpdateEntity('user', {id: userId}, {free_cards: free_cards + 1}, t))
  }

  if (is_bulk) {
    promises.push(deleteEntity('order', {parent_id: id}), t)
  }
  promises.push(deleteEntity('order', {id}), t)

  return Promise.all([...promises])
})

const getFromAddress = async (id, user_id) => {
  const cardOrder = await findEntity('card_order', null, {id}, [
    {
      model: 'order',
      include: [
        {
          model: db.address,
          where: {
            type: 'order_from',
          },
          required: false,
          separate: true,
        },
      ],
    }])

  if (!cardOrder || !cardOrder.order || cardOrder.order.user_id !== user_id || cardOrder.order.status !== 'basket') {
    throw new ErrorHandler(INVALID_DATA, 'basket item not found');
  }

  const [address] = cardOrder.order.addresses
  const address_ids = cardOrder.order.basket_id
    ? await db.address.findAll({
      attributes: ['address_id'],
      where: {
        type: 'order_to',
        basket_id: cardOrder.order.basket_id,
      },
    })
    : []

  return {address, address_ids: address_ids.map(({address_id}) => address_id)}
}

const checkCancel = (basketOrders) => basketOrders.reduce((acc, order) => {

  if (order.status !== 'paid' && order.status !== 'suspended') {
    return false
  }
  if (order.is_bulk) {
    return !acc['childs' || 'children'].some((childOrder) => childOrder.status !== 'paid' && childOrder.status !== 'suspended')
  }
  return true
}, true)

const cancelBasket = (id, userId) => transaction(async (t) => {
  if (!id) {
    throw new ErrorHandler(INVALID_DATA, "id error")
  }

  const basket = await findEntity('basket', null, {id, user_id: userId}, [{
    model: 'order',
    through: {attributes: []},
    as: 'basketOrders'
  }])


  if (!basket) {
    throw  new ErrorHandler(INVALID_DATA, "not found")
  }
  const {basketOrders} = basket

  if (!checkCancel(basketOrders)) throw new ErrorHandler(INVALID_DATA, 'cannot cancel')

  return Promise.all(basketOrders.map((order) => {
    return refundOrder(order, t)
  }))
})

const getUserBasketOrdersGrouped = async (user) => {
  const result = await basketService.getAllGrouped(user)

  const {orders, price_structure} = result.reduce((acc, order) => {
    const time = new Date(order.date_send)

    const address_from = order.addresses.find(address => address.type === 'order_from')
    const address_to = order.addresses.find(address => address.type === 'order_to')

    let insert
    if (order.inserts && order.inserts.length > 0) {
      const [{id, name, price, insert_id}] = order.inserts
      insert = {id, name, price, insert_id}
    }
    const [card] = order.card_orders ? order.card_orders : [null]

    const {
      id,
      cover,
      closed_width,
      closed_height,
      name,
      preview_margin_top,
      preview_margin_right,
      preview_margin_bottom,
      preview_margin_left,
      font_size,
      half_inside,
      category_id,
    } = order.card

    acc.price_structure = {
      total: order.price,
    }

    let {children = null} = order
    if (children.length > 0) {
      children = children.map(child => {
        const address_from = child.addresses.find(address => address.type === 'order_from');
        const address_to = child.addresses.find(address => address.type === 'order_to');

        return {
          id: child.id,
          message: child.message,
          status: child.status,
          delivery_cost: 0,
          price: parseFloat(child.price).toFixed(2),
          used_credit: child.used_credit,
          wishes: child.wishes,
          tax: child.tax,
          card: child.card,
          ...(address_from ? {address_from} : {}),
          ...(address_to ? {address_to} : {}),
        }
      })
    }


    acc.orders.push({
      id: order.id,
      message: order.message,
      status: order.status,
      price: parseFloat(order.price).toFixed(2),
      ...(order.price_orig ? {price_orig: parseFloat(order.price_orig).toFixed(2)} : {}),
      quantity: card?.quantity,
      used_credit: order.used_credit,
      wishes: order.wishes,
      tax: order.tax,
      card: order.card,
      signature: decorateSignatureObject(order.signatures),
      signature2: decorateSignatureObject(order.signatures2),
      signature_id: order.signature_id,
      signature2_id: order.signature2_id,
      signature_preview: order?.signature_id ? getUrl(order?.signatures?.preview, 'signatures') : null,
      signature2_preview: order.signature2_id ? getUrl(order?.signatures2?.preview, 'signatures') : null,
      delivery_cost: card?.delivery_cost || 0,
      basket_id: order.basket ? order.basket.id : order.basket_id,
      for_free: order.for_free,
      date_created: new Date(order.date_created),
      message_orig: order.basket ? order.basket.message : order.message,
      font: order.font,
      font_size: order.font_size || null,
      auto_font_size: !!order.auto_font_size,
      fontInfo: order.fontInfo,
      payed: order.payed,
      date_day: time.getDate(),
      date_month: time.getMonth(),
      date_year: time.getFullYear(),
      date_send: order.date_send,
      card_category_name: order.card.category ? order.card.category.name : null,
      card_cover: getUrl(order.card.cover),
      multiaddress: order.multiaddress,
      is_bulk: order.is_bulk,
      notes: order.notes,
      test_mode: order.test_mode,
      refund_status: order.refund_status,
      shipping_include: order.shipping_include,
      ...(order.shipping_include ? {shipping_details: order.shipping_details} : {}),
      price_structure: {
        total: order.is_bulk ? parseFloat(+order?.price + +card?.delivery_cost || 0).toFixed(2) : parseFloat(+order?.price).toFixed(2),
        card_price: order?.card_price,
        card_price_total: order.children.length > 0 ? parseFloat(order.card_price * order.children.length).toFixed(2) : parseFloat(order.card_price).toFixed(2),
        postage_total: card?.delivery_cost || 0,
        ...(order.denomination ? {denomination: parseFloat(order.denomination.price).toFixed(2)} : {}),
        ...(insert ? {insert: parseFloat(insert.price).toFixed(2)} : {}),
        ...(order.price_orig ? {price_orig: parseFloat(order.price_orig).toFixed(2)} : {}),
        ...(order.card.price ? {card_price_orig: parseFloat(order.card.price).toFixed(2)} : {}),

      },
      ...(children.length > 0 ? {childs: children} : {childs: []}),
      ...(order?.children_total ? {children_total: order.children_total} : {}),
      ...(address_from ? {address_from} : {}),
      ...(address_to ? {address_to} : {}),
      ...(insert ? {insert} : {}),
      ...(order.denomination_id ? {
        denomination: {
          id: order.denomination.id,
          nominal: order.denomination.nominal,
          price: order.denomination.price,
        },
        giftCard: {
          id: order.denomination.gcard.id,
          name: order.denomination.gcard.name,
          image: getUrl(order.denomination.gcard.image, AWS_FOLDER_CARDIMAGE),
        }

      } : {}),
      ...(card ? {
        card: {
          id,
          name,
          cover: getUrl(cover),
          price: order.card_price,
          category_id,
          quantity: card?.quantity,
          delivery_cost: card?.delivery_cost ? card.delivery_cost : 0,
        }
      } : {}),
      card_dimensions: {
        closed_width,
        closed_height,
        margin_top: preview_margin_top,
        margin_right: preview_margin_right,
        margin_bottom: preview_margin_bottom,
        margin_left: preview_margin_left,
        font_size,
        half_inside: getUrl(half_inside, AWS_FOLDER_CARDIMAGE),
      }
    })
    return acc
  }, {orders: [], price_structure: {}})

  return orders;
}

const getBasketOrders = async (user, basketId) => {
  const rows = await db.basket.findOne({
    where: {
      id: basketId,
      user_id: user.id
    },
    include: [
      {
        model: db.order,
        through: {attributes: []},
        as: 'basketOrders',
        include: [
          {
            model: db.order,
            as: 'children',
            include: [
              {
                model: db.card
              },
            ]
          },
          {
            model: db.card,
            include: [
              {
                model: db.card_image,
                as: 'totalImages'
              },
            ]
          },
          {
            model: db.fonts,
            as: 'fontInfo'
          },
          {
            model: db.inserts,
            through: {attributes: []},
          },
          {
            model: db.address
          },
          {
            model: db.signatures,
            as: 'signatures'
          },
          {
            model: db.signatures,
            as: 'signatures2'
          },
          {
            model: db.basket,
            through: {attributes: []},
            as: 'basketOrders',
          },
          {
            model: db.denomination,
            include: [
              {
                model: db.gcard
              }
            ]
          }
        ]
      }
    ],
  })

  if (!rows) throw new ErrorHandler(INVALID_DATA, 'not found')
  const basket = JSON.parse(JSON.stringify(rows, null, 4))

  let status = 'completed'
  let cancelledCnt = 0
  let info
  let coupon

  for (const order of basket.basketOrders) {
    info = {
      grand_total: order.order_price,
      tax: order.tax,
      bonus_credit: order.used_credit2,
      bonus_credit_total: await getTotalByUserID(user.id),
      account_credit: order.used_credit1,
      account_credit_total: user.credit,
      coupon_credit: order.used_coupon_credit,
      total: order.payed,
    }

    if (['paid', 'in_work', 'suspended'].find(value => value === order.status)) {
      status = 'in_progress'
    }

    if (status === 'cancelled') {
      cancelledCnt += 1
    }
    if (order.discount_code) {
      coupon = await db.coupon.findOne({where: {code: order.discount_code}, raw: true})
    }
  }

  if (coupon) {
    info.coupon_credit = coupon.credit
  }

  if (cancelledCnt === basket.basketOrders.length) {
    status = 'cancelled'
  }

  const items = await getUserBasketOrdersGroupedNew(basket.basketOrders, user.id)

  return {
    id: basket.id,
    date_ts: basket.date,
    orders: basket.orders,
    recipients: basket.recipients,
    status,
    total: info.total,
    payment_method: getPaymentMethodString(basket),
    cancellable: status === 'in_progress' ? checkCancel(basket) : false,
    totals: info,
    items,
  }
}
const getUserBasketOrdersGroupedNew = async (parentOrders = null, userId) => {

  if (!parentOrders) {
    parentOrders = await basketService.getUserBasketOrders(userId)
    if (!parentOrders) {
      parentOrders = []
    }
  }
  const {result} = parentOrders.reduce((acc, parent) => {
    if (!parent.card) return acc

    parent.price_structure = orderTotalHelper.createPriceStructure(parent)
    const item = formatOrderNew(parent)
    let child
    if (parent.is_bulk) {
      /*testing*/
      if (parent.multiaddress) {
        child = parent.children.map(order => formatOrderNew(order, parent))
      }
    }
    acc.result.push({
      ...item,
      ...(child ? {childs: child} : {}),
    })
    return acc
  }, {result: []})
  return result
}


const getPaymentMethodString = (basket) => {
  let paymentMethod = ''
  switch (basket.payment_method_type) {
    case 'apple_pay':
      paymentMethod = 'Apple Pay'
      break
    case 'credit_card':
      paymentMethod = basket.payment_method
      break
    case 'invoiced':
      paymentMethod = 'Invoice'
      break
    default:
      return null
  }
  return paymentMethod
}


const confirmBasketOrder = async (req, res) => {
  const t = await db.sequelize.transaction();
  let {user, body, check_quantity, credit, invoiced, tax_exempt, pm, test_mode} = req
  let {
    couponCode = null,
    notes,
    data_value,
    price_structure,
    hs_token = null
  } = body

  let {count, orders} = await basketService.getBasketOrdersByUserId(user.id)

  const promises = []
  let usedCoupon = null
  let lines = null
  let payment = null;
  let {
    result,
    orderedCardsInfo,
    orderedInsertsInfo,
    grandTotal,
    grandTotalCardsOnly,
    for_free
  } = await formationBasketOrders(orders, count)

  //checkQuantity
  checkQuantity(check_quantity, orderedCardsInfo, orderedInsertsInfo, res)

  let discountCredit = 0
  if (grandTotal > 0) {
    if (couponCode) {
      const coupon = await db.coupons.findOne({where: {code: couponCode}})

      const {bool, mess} = await isValidCoupon(coupon, user.id)

      if (!bool) {
        throw new ErrorHandler(INVALID_DATA, mess)
      }

      usedCoupon = await couponService.findUsedCouponsByUserID(user.id, 'basket')

      discountCredit = coupon.credit

      if (!usedCoupon) {
        await simpleCreateEntity('user_coupons', {user_id: user.id, coupon: couponCode}, t)
      } else if (usedCoupon.coupon !== couponCode) {
        await simpleUpdateEntity('user_coupons', {id: usedCoupon.id}, {coupon: couponCode}, t)
      }
    } else {
      usedCoupon = await couponService.findUsedCouponsByUserID(user.id, 'basket')

      if (usedCoupon) {
        const coupon = await couponService.findCouponByCode(usedCoupon.coupon)
        const {bool, mess} = await isValidCoupon(coupon, user.id)
        if (!bool) {
          throw new ErrorHandler(INVALID_DATA, mess)
        }
        couponCode = coupon.code
        discountCredit = coupon.credit
      }
    }
  }
  //
  const paymentTypes = {
    credit1: credit,
    credit2: await getTotalByUserID(user.id),
    coupon: discountCredit,
  }

  orders = orderTotalHelper.distributeByPayType(orders, paymentTypes)

  // set default billing info
  if (!user.billing_country_id || !user.billing_zip) {
    let address_from = addressesService.getOrderAddress(null, 'user_from', user.id, null)

    if (!address_from) {
      if (orders && orders[0].addresses.find(({type}) => type === 'user_from')) {
        address_from = orders[0].addresses.find(({type}) => type === 'user_from')
      }
    }
    if (!address_from) {
      const order = await db.order.findOne({
        where: {
          status: 'basket',
          user_id: user.id,
          parent_id: {[Op.not]: null},
        },
        include: [
          {
            model: db.address,
            where: {type: 'user_from'}
          }
        ]
      })
      address_from = order.address
    }
    if (address_from) {
      await profileService.setBillingInfo(user.id, address_from.address1, address_from.country_id, address_from.zip)
    }
  }
  // tax
  if (!tax_exempt) {
    lines = await generateLines(orders)
    const response = await calculate(user, lines)
    if (typeof response === "object" && response.totalTax) {
      grandTotal += response.totalTax

      orders = orderTotalHelper.addTaxToPriceStructures(orders, response.lines)
      orders = orderTotalHelper.distributeByPayType(orders, paymentTypes, true)
    }
  }

  // pay orders
  // we have paid cards

  grandTotal = lodash.round(grandTotal, 2)
  grandTotalCardsOnly = lodash.round(grandTotalCardsOnly, 2)
  const date_payed = new Date()

  const grand = orderTotalHelper.getGrandTotal(orders)
  //create Grand Structure
  const grandStructure = orderTotalHelper.createGrandStruct(grand, price_structure);

  let payPrice = 0;
  if (grandTotal > 0) {
    payPrice = grandStructure.money;

    if (payPrice < 0) {
      payPrice = 0
    }

    if (!invoiced && payPrice > 0) {
      if (data_value) {
        pm = {
          dataValue: data_value,
          userID: user.id,
        }
      }
    }

    let transactionId = null;

    if (payPrice > 0 && !invoiced) {
      const taxMoney = orderTotalHelper.getSumPriceByKey(grand, 'money', GET_PRICE_STRUCTURE.ONLY_TAX);
      // pay with apple pay

      //create BasketSub
      const basketSub = {
        amount: payPrice,
        user_id: user.id,
        tax: lodash.round(taxMoney, 2) || 0
      }

      payment = await pay(basketSub, pm, user, 'basket', t)

      if (!payment || payment.status === 'ERROR') {
        throw new ErrorHandler(INVALID_DATA, 'Can\'t get transaction id with card payment.')
      }
      transactionId = payment.transaction_id;
    }
    // set statuses of orders
    for (const order of orders) {
      const update = {}
      // notes
      if (notes && notes[order.id]) {
        update.note = notes[order.id];
      }
      if (order.tax) {
        result[order.id].tax = order.tax;
        result[order.id].local_total += order.tax;

        let gift_card_tax_total = 0;

        if (order.price_structure?.gift_card_tax?.tax) {
          gift_card_tax_total = order.price_structure.gift_card_tax.tax
        }

        result[order.id].local_total_cards_only += order.tax - gift_card_tax_total
      }

      update.transaction_id = transactionId;
      update.date_payed = date_payed;

      if (!result[order.id]) {
        promises.push(simpleUpdateEntity('order', {id: order.id}, {status: order_status.cancelled, ...update}, t))
        continue
      }

      update.price = lodash.round(result[order.id].local_total, 2);
      update.order_price = lodash.round(result[order.id].local_total, 2);

      // bonus credit (cards only)
      update.used_credit2 = lodash.round(orderTotalHelper.getSumPriceByKey(order.price_structure, 'credit2'), 2);
      update.used_expiring_credits2 = 0;

      // coupon credit
      update.used_coupon_credit = lodash.round(orderTotalHelper.getSumPriceByKey(order.price_structure, 'coupon'), 2);

      // credit
      update.used_credit1 = lodash.round(orderTotalHelper.getSumPriceByKey(order.price_structure, 'credit1'), 2);

      update.used_credit = lodash.round(update.used_credit1 + update.used_credit2 + update.used_coupon_credit, 2);

      update.payed = lodash.round(orderTotalHelper.getSumPriceByKey(order.price_structure, 'money'), 2);

      //  todo log file

      let status = order_status.suspended;

      if (new Date(order.date_send).getTime() <= new Date().getTime()) {
        status = order_status.paid;
        update.date_send = new Date();
      }
      if (test_mode) {
        status = order_status.test;
        update.test_mode = test_mode;
      }


      promises.push(simpleUpdateEntity('order', {id: order.id}, {
        status,
        invoiced,
        tax_exempt,
        discount_code: couponCode ? couponCode : '', ...update
      }, t))

      // update result info
      result[order.id].payed = lodash.round(update.payed, 2);
      result[order.id].used_credit = lodash.round(update.used_credit, 2);
      result[order.id].note = update.note;
      result[order.id].delivery_cost = order?.price_structure?.postage?.money ? order?.price_structure?.postage?.money : order?.price_structure?.postage?.total || 0

      // bulk orders

      let usedExpiringCredits2All = 0;
      if (order.is_bulk) {
        for (const child of order.children) {
          const updateChild = {}
          updateChild.status = order_status.suspended;

          if (new Date(child.date_send ? child.date_send : order.date_send).getTime() <= new Date().getTime()) {
            updateChild.status = order_status.paid;
            updateChild.date_send = new Date();
          }

          if (test_mode) {
            updateChild.status = order_status.test;
            updateChild.test_mode = test_mode;
          }

          updateChild.date_payed = date_payed;
          const address_to = child.addresses.find(({type}) => type === 'order_to')
          const fullPrice = child.price + address_to.delivery_cost + (child?.inserts[0] ? child?.inserts[0].price : 0) + child.tax;
          updateChild.order_price = lodash.round(fullPrice, 2);

          // bonus credit (cards only)
          updateChild.used_credit2 = lodash.round(orderTotalHelper.getSumPriceByKey(child.price_structure, 'credit2'), 2);
          updateChild.used_expiring_credits2 = 0


          if (!test_mode) {
            const usedExpiringCredits2 = await userCreditHelper.writeOff(user.id, updateChild.used_credit2, t);
            if (usedExpiringCredits2) {
              updateChild.used_expiring_credits2 = usedExpiringCredits2;
              usedExpiringCredits2All += usedExpiringCredits2;
            }
          }

          // coupon credit
          updateChild.used_coupon_credit = lodash.round(orderTotalHelper.getSumPriceByKey(child.price_structure, 'coupon'), 2);

          // credit
          updateChild.used_credit1 = lodash.round(orderTotalHelper.getSumPriceByKey(child.price_structure, 'credit1'), 2);

          updateChild.used_credit = lodash.round(updateChild.used_credit1 + updateChild.used_credit2 + updateChild.used_coupon_credit, 2);
          updateChild.payed = lodash.round(orderTotalHelper.getSumPriceByKey(child.price_structure, 'money'), 2);

          promises.push(simpleUpdateEntity('order', {id: child.id}, {
            invoiced: invoiced,
            tax_exempt,
            discount_code: couponCode,
            ...updateChild
          }, t))
        }

      } else if (!test_mode) {
        usedExpiringCredits2All = await userCreditHelper.writeOff(user.id, update.used_credit2, t)
      }
      if (usedExpiringCredits2All) {
        await simpleUpdateEntity('order', {id: order.id}, {used_expiring_credits2: usedExpiringCredits2All}, t)
      }

    }

    if (!test_mode) {
      promises.push(simpleUpdateEntity('user', {id: user.id}, {credit: lodash.round(lodash.max([0, credit - grandStructure.credit1]), 2)}, t))
    }
  }
  // fre order
  if (for_free.length > 0) {
    for (const order of for_free) {
      promises.push(freeBasket(order, t))
    }
  }

  //payment method info
  let paymentInfo = {}
  if (payPrice === 0) {
    paymentInfo.type = PAYMENT_METHODS.none;
  } else if (invoiced) {
    paymentInfo.type = PAYMENT_METHODS.Invoiced;
  } else if (data_value) {
    paymentInfo.type = PAYMENT_METHODS.ApplePay;
  } else {
    paymentInfo.type = PAYMENT_METHODS.CreditCard;
    paymentInfo.details = pm ? `${CREDIT_CARD_TYPE[pm.type]} ` : '';
  }

  const basket = await basketStore(user, date_payed, orders, paymentInfo, t)

  if (payment) {
    promises.push(simpleUpdateEntity('payments', {id: payment.id}, {entity: 'basket', entity_id: basket.id}, t))
  }

  if (!test_mode) {
    promises.push(descQuantity(orderedCardsInfo, orderedInsertsInfo, tax_exempt, user, lines, orders, usedCoupon, t))
  }

  // send notification
  result = reFormatResult(result)
  if (!lodash.isEmpty(result)) {
    const mail = await emailSend.basket(emailTemplates.BASKET_NOTIFICATION, user.login, result, payPrice, test_mode);
    promises.push(simpleCreateEntity('user_mail', {
      user_id: user.id,
      order_id: 0,
      type: 3,
      subject: test_mode ? 'TEST' : 'Your order',
      message: '',
      htmlmessage: mail?.Message?.Body?.Html?.Data || null,
      sent: mail?.Message?.Body ? 1 : 0,
    }, t))
  }

  //todo need implement Hubspot ?
  await Promise.all(promises)
  t.commit()
  await createHubspot(orders, user, hs_token)

  return result
}


const basketSend = (req, res, next) => transaction(async (t) => {
  try {
    const items = await confirmBasketOrder(req, res)

    res.status(200).json({
      items,
    })
  } catch (e) {
    next(e)
  }
})


const reFormatResult = (result) => {
  const orders = []
  for (const key in result) {
    orders.push(result[key])
  }
  return orders
}

const descQuantity = async (cardsInfo, insertsInfo, tax_exempt, user, lines, orders, usedCoupon, t) => {
  const promises = []
  for (const key in cardsInfo) {
    const quantity = cardsInfo[key].quantity_required;
    const card = await findEntity('card', cardsInfo[key].id);
    if (card.taxonomy === 'CUSTOM') {
      promises.push(addToQuantity(card, -quantity, t))
    }
  }

  for (const key in insertsInfo) {
    const quantity = insertsInfo[key].quantity_required;
    const insert = await findEntity('inserts', insertsInfo[key].id);
    promises.push(addToQuantityInsert(insert, -quantity, t))
  }

  if (!tax_exempt) {
    const res = await calculate(user, lines, true) //submit taxes
    if (lodash.isObject(res) && res.code) {
      const ids = orders.map(({id}) => id)
      promises.push(simpleUpdateEntity('order', {id: ids}, {tax_transaction_code: res.code}, t))
    }
  }

  if (usedCoupon) {
    promises.push(simpleUpdateEntity('user_coupons', {id: usedCoupon.id}, {status: 'used'}, t))
  }

  return Promise.all(promises)
}

const basketStore = async (user, date_payed, orders, paymentInfo, t) => {
  if (!orders.length) return

  const order_ids = orders.map(({id}) => id)

  const count = await db.order.count({
    where: {
      [Op.or]: [
        {
          is_bulk: 0,
          parent_id: {[Op.is]: null},
          id: {[Op.in]: order_ids},
        },
        {
          parent_id: {[Op.in]: order_ids},
        }
      ]
    }
  })


  const basket = await simpleCreateEntity('basket', {
    user_id: user.id,
    date: date_payed,
    orders: orders.length,
    recipients: count,
    payment_method_type: paymentInfo?.type ? paymentInfo.type : null,
    payment_method: paymentInfo?.details ? paymentInfo.details : null,
  }, t)

  const basketOrders = order_ids.map(id => ([basket.id, id]))


  await db.sequelize.query(`INSERT INTO \`basket_orders\` (basket_id,order_id) VALUES :list `, {
    type: db.Sequelize.QueryTypes.INSERT,
    replacements: {
      list: basketOrders
    },
  })

  return basket
}

const createHubspot = async (orders, user, hs_token) => {
  let children = []
  for (const order of orders) {
    if (order.is_bulk) {
      children.push(...JSON.parse(JSON.stringify(await orderService.getChildren(order), null, 4)))
    } else {
      children.push(order)
    }
  }

  for (const child of children) {
    if (child.address_to && child.address_to?.ext_id) {
      const ext = child.address_to?.ext_id.split(',')
      switch (ext[0]) {
        case 'hubspot':
          if (ext.length < 3) {
            break;
          }
          const hubspot = await hubspotService.getHubspot({ext_id: ext[1]});
          if (hubspot) {
            let senderName = '';
            let senderEmail = '';
            if (hs_token) {
              const hsPivot = await hubspotService.getHubspotPivot({hs_portal_id: hubspot.id, token: hs_token});

              if (hsPivot && hsPivot.hs_users) {
                senderName = hsPivot.hs_users.name;
                senderEmail = hsPivot.hs_users.email;
              }
            }
            if (!senderName) {
              senderName = `${child.address_to.first_name} ${child.address_to.last_name}`.trim();
              senderEmail = user.login
            }


            let ship_date = ''
            if (child.status === order_status.suspended) {
              const date_send = new Date(child.date_send);

              if (new Date().getFullYear() === new Date(child.date_send).getFullYear()) {
                ship_date = `${new Intl.DateTimeFormat('en-US', {month: 'long'}).format(new Date(child.date_send))} ${date_send.getDate()}`
              } else {
                ship_date = `${new Intl.DateTimeFormat('en-US', {month: 'long'}).format(new Date(child.date_send))} ${date_send.getDate()} ${date_send.getFullYear()}`
              }
            }
            await hubspotHelper.createEvent(hubspot, {
              id: child.id,
              objectId: ext[2],
              eventTypeId: 394168,
              action: child.status === 'suspended' ? 'scheduled' : 'sent',
              card_name: child?.card?.name,
              font_label: child?.fontInfo?.label,
              gift_card: child?.denomination ? `$${child.denomination?.nominal} ${child.denomination?.giftCard?.name}` : 'none',
              sender_name: senderName,
              sender_email: senderEmail,
              recipient_name: `${child.address_to.first_name} ${child.address_to.last_name}`,
              message: child.message,
              ship_date_str: ship_date,
            })
          }
          break
        default:
          break
      }
    }
  }

}
const updateBasket = (req, res, next,) => transaction(async (t) => {
  try {
    const {body: {id}} = req;
    const promises = [];

    if (!id) throw new ErrorHandler(INVALID_DATA, 'invalid basket item id')

    const cardOrder = await db.card_order.findByPk(id, {raw: true})

    if (!cardOrder) throw new ErrorHandler(INVALID_DATA, 'basket item not found')

    const order = await db.order.findByPk(cardOrder.order_id, {raw: true})

    const orderID = order.sort_id ? order.sort_id : order.id

    const order_id = await createBasketOrder(req, orderID, t)

    if (order.is_bulk) {
      promises.push(deleteEntity('order', {parent_id: cardOrder.order_id}, t))
    }
    await Promise.all([
      ...promises,
      deleteEntity('card_order', {id: cardOrder.id}, t),
      deleteEntity('order', {id: order.id}, t),
    ])

    res.status(200).json({
      httpCode: 200,
      status: 'ok',
      order_id
    })
  } catch (e) {
    next(e)
  }
})

const getAllNewOrders = (user, {no_totals, couponCode = null}) => transaction(async (t) => {
  let orders = []
  let items
  let total
  let country
  if (user) {
    orders = await basketService.getUserBasketOrders(user.id)
    items = await getUserBasketOrdersGroupedNew(orders, user.id)
  }

  if (!no_totals) {
    total = await calcTotals(items, user, couponCode, t)
  }

  if (user.billing_country_id) {
    country = await db.country.findOne({where: {id: user.billing_country_id}})
  }
  return {
    test_mode: user.id ? user.test_mode : 0,
    items,
    ...(total ? {total} : {}),
    ...(user.billing_address && user.billing_zip && user.billing_country_id ?
      {
        billing_info: {
          address: user.billing_address,
          zip: user.billing_zip,
          country: user.billing_country_id && country ? country.name : null,
          country_id: user.billing_country_id ? user.billing_country_id : null
        }
      } : {billing_info: null}),
  }
})

const calcTotals = async (orders, user, couponCode = null, t) => {
  let totalTax = 0
  let discountCredit = 0

  if (couponCode) {
    const coupon = await couponService.findCouponByCode(couponCode)
    const {bool, mess} = await isValidCoupon(coupon)

    if (!bool) {
      throw new ErrorHandler(INVALID_DATA, mess)
    }

    discountCredit = coupon.credit

    const basketCoupon = await db.user_coupons.findOne({where: {user_id: user.id, status: 'basket'}})

    if (!basketCoupon) {

      await simpleCreateEntity('user_coupons', {user_id: user.id, status: 'basket', coupon: couponCode}, t)

    } else {

      await simpleUpdateEntity('user_coupons', {user_id: user.id, status: 'basket'}, {coupon: couponCode}, t)

    }
  } else if (couponCode !== null) {

    await deleteEntity('user_coupons', {user_id: user.id, status: 'basket'}, t)

  } else {
    const basketCoupon = await db.user_coupons.findOne({where: {user_id: user.id, status: 'basket'}})

    if (basketCoupon) {
      const coupon = await couponService.findCouponByCode(basketCoupon.coupon)
      const {bool, mess} = await isValidCoupon(coupon)
      if (!coupon || (coupon && !bool)) {
        await deleteEntity('user_coupons', {user_id: user.id, status: 'basket'}, t)
      } else {
        discountCredit = coupon.credit
      }
    }
  }

  const userCredits2 = await getTotalByUserID(user.id)

  const paymentTypes = {
    credit1: user.credit,
    credit2: userCredits2,
    coupon: discountCredit,
  }


  orders = orderTotalHelper.distributeByPayType(orders, paymentTypes)
  //taxes
  if (user.tax_exempt) {
    const lines = await generateLines(orders)
    const res = await calculate(user, lines)
    if (typeof res === "object" && res.totalTax) {
      totalTax = res.totalTax
      orders = orderTotalHelper.addTaxToPriceStructures(orders, res.lines)
      orders = orderTotalHelper.distributeByPayType(orders, paymentTypes, true)
    }
  }

  const grand = orderTotalHelper.getGrandTotal(orders)

  return {
    grand_total: lodash.round(orderTotalHelper.countGrandTotal(grand), 2),
    tax: lodash.round(totalTax, 2),
    bonus_credit_total: lodash.round(userCredits2, 2),
    account_credit_total: lodash.round(user.credit, 2),
    account_credit: lodash.round(orderTotalHelper.getSumPriceByKey(grand, 'credit1'), 2),
    coupon_credit_total: lodash.round(discountCredit, 2),
    coupon_credit: lodash.round(orderTotalHelper.getSumPriceByKey(grand, 'coupon'), 2),
    total: lodash.round(orderTotalHelper.getSumPriceByKey(grand, 'money'), 2),
  }
}


const findCardOrderFromOrderId = async (orderId) => {
  const item = await db.card_order.findOne({
    where: {order_id: orderId},
    include: [
      {
        model: db.order,
        attributes: ['id'],
        include: [
          {
            model: db.denomination,
            include: [
              {
                model: db.gcard,
              }
            ]
          },
          {
            model: db.address,
          }
        ]
      },
      {
        model: db.card,
        include: [
          {
            model: db.category,
          }
        ]
      },
      {
        model: db.fonts,
        as: 'fonts'
      }
    ],
  })
  return JSON.parse(JSON.stringify(item, null, 4))
}

const formationBasketOrders = async (orders, count) => {
  if (count > 0) {
    return orders.reduce((acc, order) => {
      let localTotal = 0;
      let localTotalCardOnly = 0;
      const [item] = order.card_orders;
      const [insert] = order.inserts;
      let save = {};
      const time = new Date(order.date_created);

      if (!item) return acc

      if (order.is_bulk) {
        item.price = order.price;
      }

      if (!order.price_structure) {
        order.price_structure = orderTotalHelper.createPriceStructure(order);
      }

      if (item.card) {
        if (!acc.orderedCardsInfo[item.card_id]) {
          acc.orderedCardsInfo[item.card_id] = {
            id: item.card_id,
            ca: item.card.name,
            cover: getUrl(item.card.cover),
            cover_width: item.card.cover_width,
            cover_height: item.card.cover_height,
            quantity: item.card.quantity,
            quantity_required: 0
          }
        }

        acc.orderedCardsInfo[item.card_id].quantity_required += item.quantity;

        if (insert) {
          if (!acc.orderedInsertsInfo[insert.id]) {
            acc.orderedInsertsInfo[insert.id] = {
              id: insert.id,
              name: insert.name,
              quantity: insert.quantity,
              quantity_required: 0
            }
          }
          acc.orderedInsertsInfo[insert.id].quantity_required += item.quantity;
        }


        //total
        localTotal = orderTotalHelper.getTotal(order);
        localTotalCardOnly = localTotal - order.price_structure.card.total;
        let addressTo = order.addresses.find(({type}) => type === 'order_to');
        let addressFrom = order.addresses.find(({type}) => type === 'order_from');


        save.id = order.id;
        save.is_bulk = order.is_bulk;
        save.card_price = order.card_price;
        save.local_total = localTotal;
        save.local_total_cards_only = localTotalCardOnly;
        save.message = order.message;
        save.order_id = order.id;
        save.wishes = order.wishes;
        if (addressTo) {
          save.addressId = addressTo.id;
          save.address_to = addressTo;
        }

        if (addressFrom) {
          save.address_from = addressFrom;
        }

        if (order?.signatures) {
          save.signature = decorateSignatureObject(order.signatures);
        }
        if (order?.signatures2) {
          save.signature2 = decorateSignatureObject(order.signatures2);
        }

        if (order?.denomination) {
          save.denomination = {
            id: order.denomination.id,
            price: order.denomination.price,
            nominal: order.denomination.nominal,
          }
        }
        if (order?.denomination?.gcard) {
          save.denomination.giftCard = {
            id: order.denomination.gcard.id,
            image: getUrl(order.denomination.gcard.image),
            name: order.denomination.gcard.name,
          }
        }

        if (item.for_free) {
          acc.for_free.push(order);
        }

        if (!order.is_bulk && insert) {
          save.insert = {
            id: insert.order_inserts.id,
            insert_id: insert.id,
            name: insert.name,
            price: insert.price
          }
        }

        if (order.fontInfo) {
          save.fontInfo = {
            id: order.fontInfo.id,
            label: order.fontInfo.label,
          }
        }


        save.date_day = time.getDate();
        save.date_month = time.getMonth();
        save.date_send = order.date_send;
        save.card_category_name = item.card.category.name;
        save.card_name = item.card.name;
        save.card_cover = getUrl(item.card.cover);

        //children
        if (order.is_bulk) {
          save.childOrders = [];
          for (const child of order.children) {
            const [insert] = child.inserts
            let addressTo = child.addresses.find(({type}) => type === 'order_to');
            let addressFrom = child.addresses.find(({type}) => type === 'order_from');
            save.childOrders.push({
              id: child.id,
              message: child.message,
              ...(addressTo ? {addressId: addressTo.id, address_to: addressTo} : {}),
              ...(addressFrom ? {address_from: addressFrom} : {}),
              ...(child.denomination ? {
                denomination: {
                  id: child.denomination.id,
                  price: child.denomination.price,
                  nominal: child.denomination.nominal,
                }
              } : {}),
              ...(insert ? {
                insert: {
                  id: insert.order_inserts.id,
                  insert_id: insert.id,
                  name: insert.name,
                  price: insert.price
                }
              } : {}),
            })
          }
        }

        acc.grandTotal += localTotal;
        acc.grandTotalCardsOnly += localTotalCardOnly;
        acc.result[save.order_id] = save;
      }
      return acc
    }, {orderedCardsInfo: {}, orderedInsertsInfo: {}, result: {}, for_free: [], grandTotalCardsOnly: 0, grandTotal: 0})
  } else {
    throw new ErrorHandler(INVALID_DATA, 'No orders in basket');
  }
}


const checkQuantity = (check_quantity, orderedCardsInfo, orderedInsertsInfo, res) => {
  if (check_quantity) {
    const lowStockCards = []
    const lowStockInserts = []

    for (const insertKey in orderedInsertsInfo) {
      if (orderedInsertsInfo[insertKey].quantity < orderedInsertsInfo[insertKey].quantity_required) {
        lowStockInserts.push(orderedInsertsInfo[insertKey])
      }
    }
    for (const cardKey in orderedCardsInfo) {
      if (orderedCardsInfo[cardKey].quantity < orderedCardsInfo[cardKey].quantity_required) {
        lowStockCards.push(orderedCardsInfo[cardKey])
      }
    }

    if (lowStockCards.length > 0 || lowStockInserts.length > 0) {
      return res.status(INVALID_DATA).json({
        phone: CONTACT_PHONE,
        cards: lowStockCards,
        inserts: lowStockInserts,
        message: 'insufficient quantity'
      })
    }
  }
}

const freeBasket = (order, t) => simpleUpdateEntity('order', {id: order.id}, {
  transaction_id: null,
  date_payed: new Date(),
  payed: 0,
  for_free: 1,
  ...(new Date(order.date).getTime() <= new Date().getTime() ? {status: order_status.paid} : {status: order_status.suspended})
}, t)

const emailSend = {
  basket: async (template, mail_to, orders, grand_total, test_mode = false) => {
    return sendMail(template, mail_to, {
      subject: test_mode ? 'TEST' : 'Your order',
      orders,
      more_link: `${WEB_APP_URL}${WEB_ROUTES.pastOrder}`,
      grand_total: lodash.round(grand_total, 2),
    })
  }
}

const basketController = {
  clearOrders
}
export {
  basketController,
  confirmBasketOrder,
  basketSend,
  basketStore,
  clearOrders,
  updateBasket,
  cancelBasket,
  removeBasket,
  getBasketItem,
  getFromAddress,
  getAllNewOrders,
  getBasketOrders,
  getUserBasketOrdersGrouped
}
