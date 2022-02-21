import pkg from 'sequelize'
import lodash from 'lodash'

import db from '../../../../db/models'
import {getUrl} from '../../../../helpers/utils/media/getUrl.js'
import {
  simpleCreateEntity,
  simpleUpdateEntity,
  transaction
} from '../../../../helpers/utils/model.utils.js'
import {ErrorHandler} from '../../../../middlewares/error.js'
import constants from '../../../../helpers/constants/constants.js'
import {getDiscountPercents} from './Users.js'
import payApple from "../../../../helpers/utils/payment/pay/apple-pay-process.js";
import {sendMail} from "../../../../helpers/utils/mail/mail.js";

import {
  addressesService,
  orderService,
  next_id,
  basketService,
  couponService,
  fontService,
  profileService
} from "../services";
import attributes from '../../../../helpers/utils/attributes.js'
import {getTotalByUserID} from "./CreditCards.js";
import {calculate, generateLines} from "../../../../helpers/utils/avatax.helper.js";
import {pay} from "./Subscriptions.js";
import {basketStore} from "./Basket.js";
import {userCreditHelper, orderTotalHelper} from "../../../../helpers/utils";
import {addToQuantity, isCustom} from "../../admin/controllers/Cards.js";
import {addToQuantityInsert} from "../../admin/controllers/client/Insert.js";

const {
  OK,
  INVALID_DATA,
  NOT_FOUND,
  CREDIT_CARD_TYPE,
  emailTemplates,
  notificationsMessage,
  SERVER_ERROR,
  order_status,
  PAYMENT_METHODS,
  GET_PRICE_STRUCTURE,
  WEB_APP_URL,
  WEB_ROUTES,
} = constants

const {Op} = pkg
const {AOrder, ICancelOrder} = attributes

const TYPE_CARD = 1
const TYPE_CARD_PROVIDED = 2
const TYPE_POSTAGE = 3
const TYPE_POSTAGE_INTL = 4
const TYPE_GIFT_CARD = 5
const TYPE_INSERT = 6

const orderDetails = async (req, res, next) => {
  try {
    const {query: {id: orderId}, user: {id: userId}} = req

    const existOrder = await orderService.getCardOrder(orderId, userId)

    if (!existOrder) {
      throw new ErrorHandler(INVALID_DATA, 'no search order')
    }

    const parent = await orderService.getOrderDetails(orderId, userId)
    let item;
    if (parent && parent?.card) {
      const children = [];
      item = format(parent, existOrder.card_order);

      for (const child of parent.children) {
        children.push(format(child, parent))
      }

      item.childs = children;
    }

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      order: item
    })
  } catch (e) {
    next(e)
  }
}

const decorateSignatureObject = (signature) => {
  if (!signature) return null

  const {id, name, code, preview} = signature
  return {
    id,
    name,
    code,
    preview: getUrl(preview, 'signatures'),
  }
}

const getPastOrders = ({id: user_id}) => transaction(async (t) => {
  // Get all orders
  const orders = await db.order.findAll({
    where: {
      user_id,
      parent_id: {
        [Op.or]: [null, 0],
      },
      status: {
        [Op.or]: ['paid', 'in_work', 'complete', 'suspended', 'test'],
      },
    },
    include: [
      {model: db.cards},
      {model: db.user_groups},
      {
        model: db.order,
        as: 'children',
        where: {
          required: false,
          redo_id: null,
          status: {
            [Op.not]: 'canceled',
          },
        },
      },
    ],
  })

  // const orderDiscountCodesWithParents = orders
  //   .reduce((acc, {discount_code, parent_id}) => {
  //     if (discount_code && parent_id) acc.push({discount_code, parent_id})
  //     return acc
  //   }, [])

  // const coupons = await db.coupons.findAll({
  //   raw: true,
  //   where: {
  //     code: orderDiscountCodesWithParents.map(({discount_code}) => discount_code),
  //   },
  // })

  // const couponsWithCountedOrders = await Promise.all(coupons.map(({}) => {}))
  // .filter(({discount_code, parent_id}) => discount_code && parent_id)

  // const orderParentIds = orders.map(({parent_id}) => parent_id)
  // // Get all coupons by order's discount_code
  // const couponsByOrder = await db.coupons.findAll({
  //   raw: true,
  //   where: {
  //     code: orderDiscountCodes,
  //   },
  // })

  return orders.reduce((acc, order) => {
    const {is_bulk, children, wishes, signature, signature2} = order

    if (is_bulk && !children.length) return acc

    return {
      wishes,

    }
  }, [])
})

const count = async (req, res, next) => {
  try {
    const {user} = req;

    const count = await basketService.countOrders(user)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      count,
    })
  } catch (e) {
    next(e)
  }
}


const findByAttribytes = (orderId, user_id) => db.order.findOne({
  attributes: ICancelOrder,
  where: {
    redo_id: null,
    id: orderId,
    status: {[Op.or]: [order_status.paid, order_status.suspended]},
    user_id: user_id,
    for_free: 0,
    parent_id: null,
    refund_status: 0,
  },
  include: [
    {
      model: db.order,
      as: 'children',
      attributes: ICancelOrder,
      include: [
        {
          model: db.inserts,
          through: {attributes: []},
          attributes: ['id', 'quantity', 'low_stock_threshold', 'low_stock_notifications_sent']
        },
        {
          model: db.card,
          attributes: ['id', 'quantity', 'low_stock_threshold', 'low_stock_notifications_sent', 'status', 'category_id'],
          include: {
            model: db.category,
          }
        }
      ]
    },
    {
      model: db.inserts,
      through: {attributes: []},
      attributes: ['id', 'quantity', 'low_stock_threshold', 'low_stock_notifications_sent']
    },
    {
      model: db.card,
      attributes: ['id', 'quantity', 'low_stock_threshold', 'low_stock_notifications_sent', 'status', 'category_id'],
      include: {
        model: db.category,
      }
    }
  ]
})

const getUserPastBaskets = (userID) => db.basket.findAll({
  where: {user_id: userID}, order: [
    ['date', 'DESC'],
  ],
  include: [
    {
      model: db.order,
      through: {attributes: []},
      attributes: ['order_price', 'payed', 'used_credit', 'status'],
      include: [
        {model: db.order, as: 'children'},
      ],
    },
  ],
})

const pastBaskets = async (userID) => {
  const baskets = await getUserPastBaskets(userID)

  return baskets.map((item) => {
    const {basketOrders} = item

    let {status, cancelledCnt, items} = basketOrders.reduce((acc, order) => {
      acc.total += order.payed
      acc.total_credit += order.used_credit
      if (['paid', 'in_work', 'suspended'].some((value) => value === order.status)) {
        acc.status = 'in_progress'
      }
      if (order.status === 'cancelled') {
        acc.cancelledCnt += 1
      }
      acc.items.push({
        name: order.card ? order.card.name : 'Card',
        quality: order.childs.length || 1,
        cost: order.order_price,
      })
      return acc
    }, {items: [], total: 0, total_credit: 0, cancelledCnt: 0, status: 'completed'})
    if (cancelledCnt === basketOrders.length) {
      status = 'cancelled'
    }

    return {
      id: item.id,
      date_ts: item.date,
      orders: item.orders,
      recipients: item.recipients,
      status,
      items,
    }
  })
}

const getUserOrders = async (user) => {
  const orders = await db.order.findAll({
    where: {
      // user_id:user.id,
      user_id: 1,
      is_bulk: 0,
    },
    include: [
      {
        model: db.signatures,
        as: 'signatures',
      },
      {
        model: db.signatures,
        as: 'signatures2',
      },
      {
        model: db.card,
        through: {attributes: []},
        attributes: ['id', 'name', 'cover', 'price', 'category_id', 'quantity'],
        as: 'cards',
      },
      {
        model: db.basket,
        through: {attributes: []},
        as: 'basketOrders',
      },
      {
        model: db.address,
      },
      {
        model: db.inserts,
      },
      {
        model: db.denomination,
        include: [
          {
            model: db.gcard,
          },
        ],
      },

    ],
  })

  const rows = JSON.parse(JSON.stringify(orders, null, 4))
  const result = []
  for (const row of rows) {
    const {
      inserts,
      id,
      for_free,
      date_created,
      message,
      wishes,
      signature,
      signature2,
      font,
      price,
      used_credit,
      payed,
      status,
      test_mode,
      addresses,
      cards,
      parent_id,
      discount_code,
      basketOrders,
      denomination_id,
      denomination,
      gcard,
    } = row
    let coupon

    if (discount_code) {
      coupon = await db.coupons.findOne({where: {code: discount_code}, raw: true})
    }
    if (coupon && parent_id) {
      const countOrder = await db.order.count({where: {parent_id: parent_id}})
      if (countOrder > 0) {
        coupon.credit = countOrder
      }
    }


    let insert
    if (inserts && inserts.length !== 0) {
      insert = {
        id: inserts.id,
        price: inserts.price,
        name: inserts.name,
        insert_id: inserts.insert_id,
      }
    }

    const [address_from, address_to] = addresses.map(({
                                                        name,
                                                        business_name,
                                                        address1,
                                                        address2,
                                                        city,
                                                        type,
                                                        state,
                                                        zip,
                                                        country_id,
                                                        country,
                                                        delivery_cost,
                                                      }) => {
      return {
        [type === 'order_to' ? 'address_to' : 'address_from']: {
          name,
          business_name,
          address1,
          address2,
          city,
          state,
          zip,
          country_id,
          country,
          delivery_cost,
        },
      }
    })


    let gift_card
    if (denomination_id) {
      gift_card = {
        id: gcard.id,
        name: gcard.name,
        image: getUrl(gcard.image),
        denominations: denomination,
      }
    }

    result.push({
      id,
      for_free,
      date_created,
      message,
      wishes,
      message_orig: basketOrders ? basketOrders[0]?.message : message,
      signature: signature ? {...signature, preview: getUrl(signature.preview, 'signatures')} : null,
      signature2: signature2 ? {...signature2, preview: getUrl(signature2.preview, 'signatures')} : null,
      font,
      coupon,
      ...address_from,
      ...address_to,
      price,
      used_credit,
      payed,
      status,
      test_mode,
      cards,
      ...(insert && {insert}),
      ...(gift_card && {gift_card}),
      parent_id,
    })
  }

  return result
}


const placeBasket = (req, res, next) => transaction(async t => {
  try {
    const order_id = await createBasketOrder(req, null, t)

    res.json({
      httpCode: OK,
      status: 'ok',
      order_id,
    })
  } catch (e) {
    next(e);
  }
})

const createBasketOrder = async (req, orderId, t) => {
  let {
    body,
    user,
    intl,
    is_bulk,
    card,
    signature,
    signature2,
    multiaddress,
    recipientMessage,
    sendDate,
    fontModel,
    insert,
    denomination,
    addresses = [],
    addressTo = null,
    shipping_rate,
    shipping_method,
    must_deliver_by,
    shipping_address,
    platform,
  } = req;
  let {
    card_id = '',
    address_id = '',
    message = '',
    font = 'astDunn',
    font_size = null,
    auto_font_size = false,
    for_free = 0,
    couponCode = '',
    denomination_id = '',
    insert_id = '',
    quantity = 1,
    check_quantity = false,
    signature_id = null,
    signature2_id = null,
    wishes,
    addresses: addressWithFile,
    return_address_id,
    notes,
    save_recipients = false,
    shipping_address_id
  } = body;

  return_address_id = return_address_id ? return_address_id : user.default_return_address_id;
  // check available quantity
  const promises = []

  if (addresses?.length > 1) {
    quantity = addresses.length
  }

  if (check_quantity && !card.isCustom) {
    const [{qntl}] = await orderService.checkQuantity(orderId, user, card_id)

    if (card.quantity < quantity + qntl) {
      throw new ErrorHandler(INVALID_DATA, 'insufficient quantity')
    }

    if (insert) {
      const [{qntl}] = await orderService.checkQuantityWithInsert(user, orderId, insert_id)

      if (insert.quantity < quantity + qntl) {
        throw new ErrorHandler(INVALID_DATA, 'insufficient quantity')
      }
    }
  }
  const [newOrder, next_basket] = await Promise.all([
    simpleCreateEntity('order', {
      multiaddress: multiaddress ? 1 : 0,
      status: 'basket',
      user_id: user.id,
      platform,
      message: is_bulk && multiaddress ? '' : recipientMessage ? recipientMessage : message,
      for_free,
      font: fontModel.id,
      font_size,
      auto_font_size: auto_font_size ? 1 : 0,
      discount_code: couponCode,
      transaction_id: null,
      date_send: sendDate,
      note: '',
      is_bulk: is_bulk ? 1 : 0,
      test_mode: user.test_mode,
      card_id: card.id,
      ...(denomination_id ? {denomination_id} : {}),
      ...(wishes ? {wishes} : {}),
      ...(signature ? {signature_id, signature_code: signature.code} : {}),
      ...(signature2 ? {signature2_id, signature2_code: signature2.code} : {}),
    }, t),
    next_id('card_order')
  ])

  if (insert) {
    promises.push(simpleCreateEntity('order_inserts', {
      order_id: newOrder.id,
      insert_id: insert.id,
      name: insert.name,
      price: insert.price,
    }, t))
  }

  if (!is_bulk) {
    newOrder.address_to_id = addressTo.id;
  } else {
    newOrder.addresses = addresses
  }


  if (shipping_method && +shipping_method.discount) {
    card.no_envelope = true;
    card.no_envelope_discount = +shipping_method.discount;
  }

  if (shipping_rate) {
    newOrder.shipping_rate = shipping_rate;
  }

  if (shipping_rate && shipping_method) {
    newOrder.shipping_include = 1
  }
  // set attributes
  const [{AUTO_INCREMENT: basket_id}] = next_basket
  newOrder.basket_id = basket_id
  newOrder.wishes = wishes
  newOrder.card = card
  denomination ? newOrder.denomination = denomination : newOrder.denomination = null;
  insert ? newOrder.insert = insert : newOrder.insert = null;
  newOrder.address_from_id = return_address_id

  promises.push(saveOrder(newOrder, couponCode, user, addressTo, message, quantity, t, intl))


  const saveAddress = []
  if (save_recipients && !lodash.isEmpty(addressWithFile)) {
    const countries = await db.country.findAll({raw: true})
    addresses.map(address => {
      if (!address.to_name && address.to_first_name) {
        address.to_name = `${address.to_first_name} ${address.to_last_name}`
      }
      if (!address.to_first_name && address.to_name) {
        address.to_first_name = address.to_name
      }

      let country = null
      if (address.to_country_id) {
        country = countries.find((c) => +c.id === +address.to_country_id)
      } else if (address.to_country) {
        country = countries.find((c) => c.name.toLowerCase() === address.to_country.toLowerCase())
      } else {
        country = countries.find((c) => +c.id === 1)
      }

      if (country) {
        saveAddress.push([
          user.id,
          'user_to',
          address.to_name,
          address.to_first_name,
          address.to_last_name || '',
          address.to_business_name || '',
          address.to_address1,
          address.to_address2 || '',
          address.to_city,
          address.to_state,
          address.to_zip,
          country.id,
          country.name,
          country.delivery_cost,
          null,
          null
        ])
      }
    })

    promises.push(addressesService.createAddressOrder(saveAddress, t))
  }

  //order with bulk import
  if (is_bulk && !multiaddress) {
    promises.push(db.order_shipping_details.create({
      order_id: newOrder.id,
      shipping_method_id: shipping_method ? shipping_method.id : null,
      shipping_rate_id: shipping_rate ? shipping_rate.id : null,
      shipping_address_id: shipping_address_id ? shipping_address_id : null,
    }, {transaction: t}))
    if (shipping_method && shipping_rate && shipping_address) {
      promises.push(simpleUpdateEntity('order', {id: newOrder.id}, {
        note: `Shipping method: ${shipping_method.method_name}
        Shipping rate: ${shipping_rate.name}
        Shipping address: ${shipping_address?.name} ${shipping_address?.business_name ? shipping_address.business_name : ''},
        ${shipping_address?.address1}, ${shipping_address?.city}, ${shipping_address?.state} ${shipping_address?.zip}
        Must Delivery By: ${must_deliver_by}`,
      }, t))
    }
  }

  await Promise.all([
    ...promises,
    simpleUpdateEntity('order', {id: newOrder.id}, {
      basket_id: basket_id,
      sort_id: newOrder.id,
      ...(signature ? {signature_id: signature.id, signature_code: signature.code} : {}),
      ...(signature2 ? {signature2_id: signature2.id, signature2_code: signature2.code} : {}),
    }, t),
    simpleUpdateEntity('user', {id: user.id}, {
      last_used_font: font,
      default_return_address_id: return_address_id
    }, t)
  ])

  return newOrder.id
}


const checkDiscountCode = async (discountCode, order, t, user) => {
  const coupon = await db.coupons.findOne({where: {code: discountCode}, raw: true})
  if (discountCode && coupon) {
    const {bool, mess} = await isValidCoupon(coupon, user.id)
    if (bool) {
      await Promise.all([
        simpleUpdateEntity('coupons', {code: discountCode}, {used: 1,}, t),
        simpleUpdateEntity('order', {id: order.id},
          {
            discount_code: discountCode,
            used_credit: coupon.used_credit + Math.max(coupon.credit, order.price),
            used_coupon_credit: coupon.used_credit + Math.max(coupon.credit, order.price),
          }, t
        )])

    } else {
      return mess
    }
  }
}

const isValidCoupon = async (coupon, userId) => {
  const {count} = await db.order.findAndCountAll({where: {discount_code: coupon.code, user_id: userId, test_mode: 0}})

  if (count > 0) {
    return {
      bool: false,
      mess: 'Coupon already used',
    }
  }
  if (new Date() > new Date(coupon.expiration_date)) {
    return {
      bool: false,
      mess: 'Coupon already expired',
    }
  }
  return {
    bool: true,
  }
}

const processSingleOrder = async (order, couponCode, user, message, quantity, intl, t) => {
  let update = {
    price: 0,
  }

  if (order.denomination) {
    update.price += +order.denomination.price
  }

  if (order.insert) {
    update.price += +order.insert.price
  }

  if (order.for_free) {
    if (!order.card.available_free) {
      throw new ErrorHandler(INVALID_DATA, 'card is not available for free')
    }

    if (!user.free_cards) {
      throw new ErrorHandler(INVALID_DATA, 'no free cards')
    }

    update.for_free = true
  } else {
    update.for_free = false;
    const {discount} = await getDiscountPercents(user);
    update.discount_percents = discount

    if (order.discount_percents) {
      update.price_orig = update.price + order.card.price
    }

    update.card_price = lodash.round((100 - update.discount_percents) / 100 * order.card.price, 2);
    update.price += lodash.round((100 - update.discount_percents) / 100 * order.card.price, 2);
  }

  const address = await addressesService.getOrderAddress(null, 'order_from', null, order.id)

  const needAddressFrom = !address;

  let addressFrom
  if (needAddressFrom) {
    addressFrom = await addressesService.getOrderAddress(order.address_from_id, 'user_from', user.id)
    if (!addressFrom) {
      throw new ErrorHandler(INVALID_DATA, 'no return info')
    }
  }

  let addressTo = await addressesService.getOrderAddress(order.address_to_id, 'user_to', user.id)

  if (!addressTo) {
    throw new ErrorHandler(INVALID_DATA, 'no such address')
  }

  if (addressTo.country_id) {
    const country = await db.country.findByPk(addressTo.country_id)
    if (!country) {
      throw new ErrorHandler(INVALID_DATA, 'no such country')
    }

    addressTo.delivery_cost = country.delivery_cost;
    addressTo.country = country.name;
  }

  update.deliveryCost = addressTo.delivery_cost
  update.price = lodash.round(update.price + +addressTo.delivery_cost, 2)

  if (!await simpleUpdateEntity('order', {id: order.id}, {
    price: update.price,
    for_free: update.for_free ? 1 : 0,
    discount_percents: update.discount_percents,
    card_price: update.card_price,
  }, t)) {
    throw new ErrorHandler(SERVER_ERROR, 'error placing order')
  }
  const address_from = await addressesService.setOrderAddress(addressFrom, order, 'order_from', t)
  if (needAddressFrom && !address_from) {
    throw new ErrorHandler(SERVER_ERROR, 'error placing order (saving from address)')
  }

  const address_to = await addressesService.setOrderAddress(addressTo, order, 'order_to', t)
  if (!address_to) {
    throw new ErrorHandler(SERVER_ERROR, 'error placing order (saving to address)')
  }

  let price = update.price
  if (order.is_bulk) {
    price -= order.denomination_id ? order.denomination.price : 0;// - denomination price
    price -= order.insert ? order.insert.price : 0;// - insert price
    price -= update.deliveryCost // - delivery cost
  }
  await saveCardOrder(order, message, price, couponCode, quantity, addressTo.delivery_cost, intl, t);
  order.price = update.price;
  order.for_free = update.for_free ? 1 : 0;
  order.discount_percents = update.discount_percents;
  order.card_price = update.card_price;
  order.addresses = [address_to, address_from]
  return order
}


const saveCardOrder = async (order, message, price, discount_code, quantity, delivery_cost, intl_quantity = 1, t) => {
  await db.card_order.create({
    card_id: order.card.id,
    order_id: order.id,
    is_bulk: order.is_bulk,
    denomination_id: order?.denomination?.id ? order.denomination.id : null,
    message,
    for_free: order.for_free,
    price,
    discount_code,
    font: order.font.id,
    quantity,
    delivery_cost,
    intl_quantity,
  }, t)
}
const processBulkOrder = async (order, user, couponCode, message, quantity, t) => {
  const cardCount = order.addresses ? order.addresses?.length : 0;
  const denominationPrice = order.denomination?.price ? order.denomination.price : 0;
  const insertPrice = order.insert?.price ? order.insert.price : 0;
  let price_orig = null;
  let card_price = null;
  let price = null;

  if (cardCount <= 0) {
    throw new ErrorHandler(INVALID_DATA, 'addresses count error')
  }
  const {discount} = await getDiscountPercents(user, cardCount);
  if (discount) {
    price_orig = cardCount * (+order.card.price + +denominationPrice)
  }

  card_price = lodash.round((100 - discount) / 100 * order.card.price, 2);

  if (order.card?.no_envelope) {
    card_price -= order.card?.no_envelope_discount
  }

  price = cardCount * (card_price + +denominationPrice + +insertPrice)
  if (price < 0) price = 0

  const update = await simpleUpdateEntity('order', {id: order.id}, {
    price,
    card_price,
    discount_percents: discount, ...(price_orig ? {price_orig} : {})
  }, t)

  if (!update) {
    throw new ErrorHandler(SERVER_ERROR, 'error placing main order')
  }

  let addressFrom
  if (order.multiaddress) {

    addressFrom = await addressesService.getOrderAddress(order.address_from_id, 'user_from', user.id)
    if (!addressFrom) {
      throw new ErrorHandler(INVALID_DATA, 'no return info')
    }
    await addressesService.setOrderAddress(addressFrom, order, 'order_from', t)
  }
  await createChildOrders(order, user, price, card_price, discount, cardCount, price_orig, addressFrom, message, couponCode, quantity, t)
}

const createChildOrders = async (order, user, price, card_price, discount, cardCount, price_orig = null, parentAddress, message, couponCode, quantity, t) => {
  const promises = [];
  let delivery = 0;
  let count = 0;

  if (order.shipping_include) {
    delivery = orderTotalHelper.countShippingFee(order.shipping_rate, quantity)
  }

  const countries = await addressesService.getCountries()

  for (const address of order.addresses) {
    //create children
    const children = await simpleCreateEntity('order', {
      status: 'basket',
      user_id: user.id,
      parent_id: order.id,
      font: order.font,
      font_size: order.font_size,
      card_id: order.card.id,
      card_price: card_price,
      message: address.message,
      price: price / cardCount,
      discount_percents: discount,
      for_free: order.for_free,
      used_credit: order.used_credit / cardCount,
      date_send: address?.date_send ? address.date_send : order.date_send,
      ...(order.basket_id ? {basket_id: order.basket_id} : {}),
      ...(price_orig ? {price_orig: price_orig / cardCount} : {}),
      ...(address?.wishes ? {wishes: address.wishes} : {}),
      ...(order?.signature_id ? {signature_id: order?.signature_id, signature_code: order.signature_code} : {}),
      ...(order.denomination ? {denomination_id: order.denomination.id} : {}),
      ...(order?.signature2_id ? {signature2_id: order?.signature2_id, signature2_code: order?.signature2_code} : {}),
    }, t)

    if (order.insert) {
      await simpleCreateEntity('order_inserts', {
        order_id: children.id,
        insert_id: order?.insert?.id,
        name: order?.insert?.name,
        price: order?.insert?.price,
      }, t)
    }
    if (address?.return_address1) {
      let countryFrom
      if (address.return_country_id) {
        countryFrom = countries.find(({id}) => id === +address.return_country_id)
      } else {
        countryFrom = countries.find(({id}) => id === 1) // xxx default country
      }
      if (!countryFrom) throw new ErrorHandler(INVALID_DATA, `Empty return country for recipient (${address.to_name})`)

      if (order.insert) {
        promises.push(simpleCreateEntity('order_inserts', {
          order_id: children.id,
          insert_id: order.insert.id,
          name: order.insert.name,
          price: order.insert.price,
        }, t))
      }

      const newAddress = {
        name: address.return_name ? address.return_name : `${address.return_first_name}${address.return_last_name ? ` ${address.return_last_name}` : ''}`,
        first_name: address.return_first_name ? address.return_first_name : address.return_name,
        last_name: address.return_last_name || '',
        business_name: address.return_business_name || '',
        address1: address.return_address1,
        address2: address.return_address2,
        city: address.return_city,
        state: address.return_state,
        zip: address.return_zip,
        country_id: countryFrom.id,
        country: countryFrom.name,
        delivery_cost: countryFrom.delivery_cost,
        basket_id: order.basket_id
      }
      promises.push(addressesService.setOrderAddress(newAddress, children, 'order_from', t))
    } else {
      promises.push(addressesService.setOrderAddress(parentAddress, children, 'order_from', t))
    }

    let countryTo
    if (address.to_country_id) {
      countryTo = countries.find(({id}) => id === +address.to_country_id)
    } else {
      countryTo = countries.find(({id}) => id === 1) // xxx default country
    }

    if (!countryTo) throw new ErrorHandler(INVALID_DATA, `Empty return country for recipient (${address.to_name})`)
    const newAddress = {
      ...(address.id ? {id: address.id} : {}),
      name: address.to_name ? address.to_name : `${address.to_first_name}${address.to_last_name ? ` ${address.to_last_name}` : ''}`,
      first_name: address.to_first_name ? address.to_first_name : address.to_name,
      last_name: address.to_last_name || '',
      business_name: address.to_business_name || '',
      address1: address.to_address1,
      address2: address.to_address2,
      city: address.to_city,
      state: address.to_state,
      zip: address.to_zip,
      address_id: address.address_id,
      birthday: address.to_birthday,
      ext_id: address.ext_id,
      basket_id: order.basket_id,
      country_id: countryTo.id,
      country: countryTo.name,
      delivery_cost: order.shipping_include ? delivery / quantity : countryTo.delivery_cost
    }

    promises.push(addressesService.setOrderAddress(newAddress, children, 'order_to', t))
    if (!order.shipping_include) {
      delivery += +countryTo.delivery_cost
      if (+countryTo.delivery_cost > 0) {
        count += 1
      }
    }


  }

  await Promise.all([
    saveCardOrder(order, message, price, couponCode, quantity, delivery, count, t),
    simpleUpdateEntity('order', {id: order.id}, {price, price_orig}, t),
    ...promises
  ])
}
const calcTaxes = (req, res, next) => transaction(async t => {
  try {
    const {user, body: {card_id, address_id, denomination_id, insert_id, couponCode}} = req;

    let lines = []
    let orders = null
    let credit_type2 = 0;
    let discountCredit = 0;
    let denomination
    let insert
    let paymentTypes


    if (card_id) {

      if (!card_id || typeof +card_id !== 'number') {
        throw new ErrorHandler(INVALID_DATA, 'card id error')
      }

      const card = await db.card.findByPk(card_id, {raw: true})

      if (!card) throw new ErrorHandler(INVALID_DATA, 'not found')
      //
      const addressTo = await addressesService.getAddressByID(address_id, user.id)

      if (denomination_id) {
        denomination = await db.denomination.findByPk(denomination_id, {raw: true})

        if (!denomination) throw new ErrorHandler(INVALID_DATA, 'no such gift card')
      }

      if (insert_id) {
        insert = await db.inserts.findByPk(insert_id, {raw: true})
        if (!insert) throw new ErrorHandler(INVALID_DATA, 'no such insert')
      }

      const postagePaid = addressTo.delivery_cost
      const giftCardPaid = denomination ? denomination.price : 0
      const insertPaid = insert ? insert.price : 0

      if (!card.price) throw new ErrorHandler(INVALID_DATA, 'cannot buy')

      const {discount: discount_percents} = await getDiscountPercents(user)
      const price = lodash.round((100 - discount_percents) / (100 * card.price), 2)

      // //  card
      const taxCodesList = await db.tax_codes.findAll()
      const taxCodeObj = taxCodesList ? taxCodesList.reduce((acc, cur) => {
        return {
          ...acc,
          [cur.dataValues.id]: cur.dataValues.tax_code,
        }
      }, {}) : {}


      //card
      let taxCode = taxCodeObj[TYPE_CARD] || null

      if (card.tax_exempt) taxCode = taxCodeObj[TYPE_CARD_PROVIDED] || null


      if (price > 0 && taxCode) {
        lines.push({
          amount: price,
          quantity: 1,
          taxCode: taxCode,
        })
      }

      // postage
      taxCode = taxCodeObj[TYPE_POSTAGE] || null
      if (addressTo.country_id !== 1) {
        taxCode = taxCodeObj[TYPE_POSTAGE_INTL] || null
      }

      if (postagePaid && taxCode) {
        lines.push({
          amount: postagePaid,
          quantity: 1,
          taxCode: taxCode,
        })
      }

      //  gift card
      taxCode = taxCodeObj[TYPE_GIFT_CARD] || null
      if (giftCardPaid && taxCode) {
        lines.push({
          amount: giftCardPaid,
          quantity: 1,
          taxCode: taxCode,
        })
      }

      // inserts
      taxCode = taxCodeObj[TYPE_INSERT] || null
      if (insertPaid && taxCode) {
        lines.push({
          amount: insertPaid,
          quantity: 1,
          taxCode: taxCode,
        })
      }
    } else {
      let {orders: newOrders, lines: newLines, paymentTypes: newPaymentTypes} = await countOrdersPrice(user, couponCode)
      orders = newOrders;
      lines = newLines;
      paymentTypes = newPaymentTypes;
      credit_type2 = newPaymentTypes.credit2;
      discountCredit = newPaymentTypes.coupon;
    }
    // calculate for basket
    let {totalTax, orders: newOrder} = await calculateTotalTax(user, lines, orders, paymentTypes);

    orders = newOrder;

    if (user.billing_country_id) {
      const country = await db.country.findOne({where: {id: user.billing_country_id}, raw: true})
      user.billingCountry = country
    }

    let grand
    if (orders) {
      grand = orderTotalHelper.getGrandTotal(orders)
    }

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      total_tax: totalTax,
      price_structure: {
        grand_total: orderTotalHelper.countGrandTotal(grand),
        tax: totalTax || 0,
        bonus_credit_total: lodash.round(credit_type2, 2),
        bonus_credit: lodash.round(orderTotalHelper.getSumPriceByKey(grand, 'credit2'), 2),
        account_credit_total: lodash.round(user.credit, 2),
        account_credit: lodash.round(orderTotalHelper.getSumPriceByKey(grand, 'credit1'), 2),
        coupon_credit_total: lodash.round(discountCredit, 2),
        coupon_credit: lodash.round(orderTotalHelper.getSumPriceByKey(grand, 'coupon'), 2),
        total: lodash.round(orderTotalHelper.getSumPriceByKey(grand, 'money'), 2),
      },
      billing_info: {
        address: user.billing_address,
        zip: user.billing_zip,
        country: user.billing_country_id ? user.billingCountry.name : null,
        country_id: user.billing_country_id ? user.billing_country_id : null,
      }
    })
  } catch (e) {
    next(e)
  }
})


const calculateTotalTax = async (user, lines, orders, paymentTypes) => {
  let totalTax = 0
  if (!user.tax_exempt && lines) {
    const res = await calculate(user, lines)
    if (typeof res === 'object' && res?.totalTax) {
      totalTax = res.totalTax
      if (orders) {
        orders = orderTotalHelper.addTaxToPriceStructures(orders, res.lines)
        orders = orderTotalHelper.distributeByPayType(orders, paymentTypes, true)
      }
    }
  }

  return {
    orders,
    totalTax
  }
}
const countOrdersPrice = async (user, couponCode) => {
  let {orders} = await basketService.getBasketOrdersByUserId(user.id)

  let total = 0
  for (const order of orders) {
    total += await orderTotalHelper.getTotal(order)
  }

  let discountCode = null
  let discountCredit = null
  if (couponCode) {
    discountCode = couponCode
  } else if (total > 0) {
    const usedCoupons = await couponService.findUsedCouponsByUserID(user.id, 'basket')

    if (usedCoupons) {
      discountCode = usedCoupons.coupon
    }
  }

  if (discountCode) {
    const coupon = await couponService.findCouponByCode(discountCode)

    if (coupon) {
      const result = await isValidCoupon(coupon, user.id)
      if (result.bool) {
        discountCredit = coupon.credit
      }
    }
  }

  const credit_type2 = await getTotalByUserID(user.id)
  const paymentTypes = {
    credit1: +user.credit,
    credit2: credit_type2,
    coupon: +discountCredit,
  }


  orders = orderTotalHelper.distributeByPayType(orders, paymentTypes)
  if (!user.billing_country_id && user.billing_zip) {
    let addressFrom = await db.address.findOne({where: {user_id: user.id, type: 'user_from'}, raw: true})

    if (!addressFrom) {
      if (orders && orders[0].addresses) {
        addressFrom = orders[0].addresses.find((address) => address.type === 'user_from')
      }
    }
    if (!addressFrom) {
      const order = await orderService.getAddressFromOrder(user)
      addressFrom = order.addresses.find((address) => address.type === 'user_from')
    }
    if (addressFrom) {
      await profileService.setBillingInfo(user.id, addressFrom.address1, addressFrom.country_id, addressFrom.zip, t)
    }
  }

  const lines = await generateLines(orders)

  return {
    lines,
    orders,
    paymentTypes
  }
}
const getUserPastOrders = async (user, {limit = '10'}) => {
  const orders = await db.order.findAll({
    order: [['id', 'DESC']],
    limit: +limit,
    where: {
      parent_id: {[Op.or]: [null, 0]},
      user_id: user.id,
      status: {[Op.or]: ['paid', 'in_work', 'complete', 'suspended', 'test']},
    },
    attributes: [
      'date_created',
      'id',
      'is_bulk',
      'parent_id',
      'discount_code',
      'message',
      'wishes',
      'signature2_id',
      'signature_id',
      'used_credit',
      'payed',
      'status',
      'card_id',
      'user_id',
      'date_send',
      'price',
    ],
    include: [
      {
        model: db.address,
      },
      {
        model: db.card,
        attributes: [
          'id',
          'name',
          'cover',
          'price',
          'quantity',
          'category_id',
          'quantity',
        ],
      },
      {
        model: db.card,
        as: 'cards',
        through: {attributes: []},
        attributes: [
          'id',
          'name',
          'cover',
          'price',
          'quantity',
          'category_id',
          'quantity',
        ],
      },
      {
        model: db.signatures,
        as: 'signatures',
      },
      {
        model: db.signatures,
        as: 'signatures2',
      },
      {
        model: db.order,
        attributes: [
          'id',
          'card_id',
        ],
        as: 'children',
        include: [
          {
            model: db.denomination,
            attributes: [
              'id',
              'nominal',
              'price',
            ],
            include: [{model: db.gcard}],
          },
          {
            model: db.address,
          },
          {
            model: db.fonts,
            as: 'fontInfo',
            attributes: ['id', 'label'],
          },
          {
            model: db.card,
            attributes: ['name', 'cover', 'id', 'category_id', 'quantity', 'price'],
            include: [{model: db.category, attributes: ['name']}],
          },
        ],
      },
    ],
  })

  const result = []
  let save
  const rows = JSON.parse(JSON.stringify(orders, null, 4))


  if (rows.length > 0) {
    for (const order of rows) {
      const {
        id,
        is_bulk,
        parent_id,
        discount_code,
        children,
        wishes,
        signatures,
        used_credit,
        payed,
        message,
        status,
        signatures2,
        cards
      } = order
      if (is_bulk && children?.length === 0) {
        continue
      }

      save = {
        id,
        wishes,
        message,
        payed,
        signature: signatures ? {...signatures, preview: getUrl(signatures.preview, 'signatures')} : null,
        signature2: signatures2 ? {...signatures2, preview: getUrl(signatures2.preview, 'signatures')} : null,
      }

      const coupon = await db.coupons.findOne({where: {code: discount_code}, raw: true})

      if (coupon && parent_id || parent_id === 0) {
        const {count} = await db.order.findAndCountAll({
          where: {
            parent_id,
          },
          raw: true,
        })
        if (count > 0) {
          coupon.credit /= count
        }
      }
      if (coupon) {
        coupon.credit = lodash.round(coupon.credit, 2)
      }

      await children.map(({card, addresses, denomination, fontInfo}) => {
        const time = order.date_created
        if (card) {
          const {id, name, cover, price, category_id} = card
          save = {
            ...save, card: {
              id: id,
              name,
              cover: getUrl(cover),
              price: price * card.quantity,
              price_orig: order.payed,
              category_id,
              quantity: card.quantity,
            },
          }

          save = {...save, used_credit, payed: order.payed, status}
          if (addresses) {
            const addressTo = addresses.find(({type}) => type === 'order_to')
            if (addressTo) {
              save = {...save, addressId: addressTo.id, address_to: addressTo}
            } else if (order.addresses.length > 0) {
              const addressToOrder = order.addresses?.find(({type}) => type === 'order_to')
              save = {...save, addressId: addressToOrder.id, address_to: addressToOrder}
            }
            const addressFrom = addresses.find(({type}) => type === 'order_from')

            if (addressFrom) {
              save = {...save, address_from: addressFrom}
            } else if (order.addresses.length > 0) {
              const addressFromOrder = order.addresses.find(({type}) => type === 'order_from')
              save = {...save, address_to: addressFromOrder}
            }
          }
          if (denomination) {
            save = {
              ...save, denomination: {
                id: denomination.id,
                nominal: denomination.nominal,
                price: denomination.price,
              },
            }
            if (denomination.gcard) {
              const {id, image, name} = denomination.gcard
              save = {
                ...save, giftCard: {
                  id,
                  image: getUrl(image),
                  name,
                },
              }
            }
          }

          save = {
            ...save,
            ...(fontInfo ? {fontInfo: fontInfo} : {}),
            cards,
            date_day: new Date(time).getDate(),
            date_month: new Date(time).getMonth(),
            date_send: order.date_send,
            card_category_name: card.category ? card.category.name : null,
            card_name: card.name,
            card_cover: getUrl(card.cover),
            coupon,
            date_created: time,
            multiaddress: order.multiaddress,
            tax: order.tax ? order.tax : null,
          }
        }
      })
      result.push(save)
    }
    return result
  }
  return []
}

const place = async (user, body, platform, t) => {
  const {
    card_id,
    address_id,
    addresses,
    message,
    font = 'astDunn',
    for_free = 0,
    couponCode,
    denomination_id,
    quantity = 1,
    price = null,
  } = body

  let isBulkOrder = false

  const test_mode = user.test_mode

  if (!card_id || typeof +card_id !== 'number') {
    throw new ErrorHandler(INVALID_DATA, 'card id error')
  }


  const [card, denomination] = await Promise.all([
    db.card.findByPk(card_id),
    db.denomination.findByPk(denomination_id),
    fontService.getFont(font)
  ])

  if (!card) {
    throw new ErrorHandler(INVALID_DATA, 'not found')
  }

  if (denomination_id && !denomination) throw new ErrorHandler(INVALID_DATA, 'no such gift card')

  if (!lodash.isEmpty(addresses)) {
    isBulkOrder = true
  }

  if (!address_id && typeof address_id !== 'number' && !isBulkOrder) {
    throw new ErrorHandler(INVALID_DATA, 'address error')
  }

  if (!isBulkOrder && (!message)) {
    throw new ErrorHandler(INVALID_DATA, 'message error')
  }


  const order = {
    is_bulk: isBulkOrder,
    status: 'new',
    user_id: user.id,
    platform,
    message,
    for_free: +for_free,
    font,
    discount_code: couponCode,
    test_mode,
    card_id,
    denomination_id,
  }


  let newOrder = await simpleCreateEntity('order', order, t)
  newOrder = JSON.parse(JSON.stringify(newOrder, null, 4))

  if (!isBulkOrder) {
    newOrder.address_to_id = address_id;
  } else {
    newOrder.addresses = addresses
  }
  newOrder.card = card;
  if (denomination) {
    newOrder.denomination = card;
    newOrder.denomination_id = card;
  }


  await saveOrder(newOrder, couponCode, user, null, message, quantity, t)

  if (price !== null && (Math.max(0, (newOrder.price - newOrder.used_credit)))) {
    throw new ErrorHandler(INVALID_DATA, 'invalid price')
  }
  return newOrder.id
}

const getListChild = async (user, {id, status, limit = 10}) => {
  if (!id) {
    throw new ErrorHandler(INVALID_DATA, 'id error')
  }
  const order = await db.order.findOne({
    where: {
      id: id,
      user_id: user.id,
    },
    attributes: [
      'id',
      'is_bulk',
    ],
    include: [
      {
        model: db.order,
        as: 'children',
        ...(status ? {
          where: {
            status,
          }
        } : {}),
        separate: true,
        attributes: AOrder,
        include: [
          {
            model: db.address,
            include: [
              {
                model: db.country,
                as: 'country_obj',
              },
            ],
          },
        ],
      },
      {
        model: db.card,
        include: {
          model: db.card_image,
          as: 'totalImages'
        }
      }
    ],
  })

  const rows = JSON.parse(JSON.stringify(order, null, 4))

  if (!order) {
    throw new ErrorHandler(NOT_FOUND, 'order not found')
  }

  if (!order.is_bulk) {
    throw new ErrorHandler(INVALID_DATA, 'order not bulk')
  }

  const result = []
  for (const child of rows.children) {
    result.push(formatOrderNew(child, order))
  }
  return result
}

const formatOrderNew = (order, parent = null) => {
  let orderResult
  const {
    inserts,
    fontInfo,
    denomination,
    card,
    children,
    addresses,
    is_bulk,
    denomination_id,
    multiaddress,
    signature,
    signature2,
    ...restOrder
  } = order
  const [insert] = inserts || [null]

  const {addressFrom, addressTo} = addresses.reduce((acc, address) => {
    if (address.type === 'order_from') {
      acc.addressFrom = address
    }
    if (address.type === 'order_to') {
      acc.addressTo = address
    }
    return acc
  }, {addressFrom: {}, addressTo: {}})

  const {
    preview_margin_top,
    preview_margin_right,
    preview_margin_bottom,
    preview_margin_left,
    totalImages,
    ...restCard
  } = card || parent.card
  let images = {}
  totalImages.map((image) => {
      images[image.type] = {...image, image: getUrl(image.image), image_lowres: getUrl(image.image_lowres)}
    },
  )
  if (!parent) {
    orderResult = {
      is_bulk: is_bulk && !order.multiaddress,
      ...(fontInfo ? {
        font_info: {
          ...fontInfo,
          line_spacing: lodash.round(fontInfo.line_spacing, 2),
        }
      } : {font_info: null}),
      ...restOrder,
      card: {
        ...restCard,
        ...(is_bulk ? {price: card.price - denomination?.price || 0} : {price: card.price}),
        price_orig: card.price,
        margin_top: preview_margin_top,
        margin_right: preview_margin_right,
        margin_bottom: preview_margin_bottom,
        margin_left: preview_margin_left,
        images,
        characters: card.height * card.width,
        cover: getUrl(card.cover),
        half_inside: getUrl(card.half_inside),
      },
      ...(signature ? {
        signature: {
          ...signature,
          preview: getUrl(signature.preview, 'signatures'),
        },
      } : null),
      ...(signature2 ? {
        signature2: {
          ...signature2,
          preview: getUrl(signature2.preview, 'signatures'),
        },
      } : null),
      ...(denomination_id ? {
        gift_card: {
          id: denomination.gcard.id,
          name: denomination.gcard.name,
          image: getUrl(denomination.gcard.image),
        },
        denomination: {
          id: denomination.id,
          nominal: denomination.nominal,
          price: denomination.price,
        },
      } : {}),
      ...(insert ? {
        insert: {
          id: insert.id,
          price: insert.price,
          name: insert.name,
        },
      } : {}),
      ...(addressFrom ? {address_from: addressFrom} : {}),
      ...(addressTo ? {address_to: addressTo} : {}),
    }
  } else {
    orderResult = {
      ...restOrder,
      delivery_cost: addressTo ? addressTo.delivery_cost : 0,
      price: lodash.round(order.price + (order['insert'] ? order['insert'].price : 0), 2),
      ...(signature ? {
        signature: {
          ...signature,
          preview: getUrl(signature.preview, 'signatures'),
        },
      } : null),
      ...(signature2 ? {
        signature2: {
          ...signature2,
          preview: getUrl(signature2.preview, 'signatures'),
        },
      } : null),
      ...(addressFrom ? {address_from: addressFrom} : {}),
      ...(addressTo ? {address_to: addressTo} : {}),
    }
  }
  return orderResult
}

const pretty = (order) => {
  order?.children ? order.children : [];

  const time = new Date(order.data_created)
  let localTotal = 0

  const addressTo = order.addresses.find(({type}) => type === 'order_to')
  const addressFrom = order.addresses.find(({type}) => type === 'order_from')

  if (order.denomination) {
    localTotal += order.denomination.price
  }
  if (order.for_free === 0) {
    if (order.is_bulk === 1) {
      localTotal = order.price
    } else {
      localTotal += order.price
    }
  }

  let [insert] = order?.inserts || [null]
  return {
    id: order.id,
    is_bulk: order.is_bulk,
    message: order.message,
    note: order.note,
    delivery_cost: order.delivery_cost,
    ...(addressTo ? {
      addressId: addressTo.id,
      address_to: addressTo,
    } : {}),
    ...(addressFrom ? {address_from: addressFrom} : {}),
    ...(order.denomination ? {
      denomination: {
        id: order.denomination.id,
        nominal: order.denomination.nominal,
        price: order.denomination.price,
        giftCard: {
          id: order.denomination.gcard.id,
          name: order.denomination.gcard.name,
          image: getUrl(order.denomination.gcard.image)
        }
      }
    } : {}),
    ...(order.inserts ? {insert: order.inserts[0]} : {}),
    ...(order.fontInfo ? {fontInfo: order.fontInfo} : {}),
    date_day: new Date(time).getDate(),
    date_month: new Date(time).getMonth(),
    date_send: order.date_send,
    card_category_name: order.card.category.name,
    card_name: order.card.name,
    card_price: order.card_price,
    card_cover: getUrl(order.card.cover),
    insert: insert,
    childOrders: order?.children?.map((child, index) => {
      const addressTo = child.addresses.find(({type}) => type === 'order_to')
      const addressFrom = child.addresses.find(({type}) => type === 'order_from')
      return {
        id: child.id,
        parent_id: child.parent_id,
        price: child.price,
        message: child.message,
        ...(addressTo ? {addressId: addressTo.id, address_to: addressTo} : {}),
        ...(addressFrom ? {address_from: addressFrom} : {}),
        ...(child.denomination ? {
          denomination: {
            id: child.denomination.id,
            nominal: child.denomination.nominal,
            price: child.denomination.price,
            giftCard: {
              id: child.denomination.gcard.id,
              name: child.denomination.gcard.name,
              image: getUrl(child.denomination.gcard.image)
            }
          }
        } : {}),
        ...(child.inserts ? {insert: child.inserts[0]} : {}),
      }
    }),
    local_total: localTotal,
    used_credit: order.used_credit,
    payed: order.payed,
    tax: order.tax,
    price: order.price,
  }
}

const orderPay = (req, res, next) => transaction(async t => {
  try {
    const {body, user, nowDate, sendDate, datePayed, pm} = req;
    const {
      order_id,
      for_free = 0,
      data_value,
    } = body

    const order = await orderService.getPayOrder(order_id, user.id)

    let payment;
    let promises = [];
    let freeCards
    if (for_free) {
      if (user.free_cards > 0) {
        simpleUpdateEntity('user', {id: user.id}, {free_cards: user.free_cards - 1, shared: 0}, t)
      } else {
        throw new ErrorHandler(INVALID_DATA, 'no free cards')
      }
      freeCards = user.free_cards - 1
    }


    const price = lodash.round((order.price - order.used_credit), 2)
    const amount = lodash.max([0, price])

    let creditCard
    let transactionId
    let is_ok = true
    if (amount && !user.invoiced) {
      if (data_value) {
        transactionId = await payApple(order, user, amount, data_value, user.test_mode)
        if (!transactionId) {
          is_ok = false
        }
      } else {
        // old version transaction
        const orderObject = {
          amount,
          user_id: user.id,
          tax: 0
        }
        payment = await pay(orderObject, pm, user, 'order', t)
        if (!payment || payment.status === 'ERROR') {
          throw new ErrorHandler(INVALID_DATA, 'Can\'t get transaction id with card payment.')
        }

        transactionId = payment.transaction_id;
      }
    }

    if ((is_ok && transactionId) || !amount || user.invoiced) {
      await simpleUpdateEntity('order', {
        id: order_id,
        user_id: user.id,
        status: 'new',
      }, {
        transaction_id: transactionId,
        date_payed: datePayed,
        payed: amount,
        date_send: sendDate,
        invoiced: user.invoiced,
        order_price: order.price,
        ...(user.test_mode ? {status: 'test'} : {status: sendDate === nowDate ? 'paid' : 'suspended'}),
      }, t)


      //payment method info
      let paymentInfo = {}
      if (amount === 0) {
        paymentInfo.type = PAYMENT_METHODS.none;
      } else if (user.invoiced) {
        paymentInfo.type = PAYMENT_METHODS.Invoiced;
      } else if (data_value) {
        paymentInfo.type = PAYMENT_METHODS.ApplePay;
      } else {
        paymentInfo.type = PAYMENT_METHODS.CreditCard;
        paymentInfo.details = pm ? `${CREDIT_CARD_TYPE[pm.type]} ` : '';
      }

      const basket = await basketStore(user, datePayed, [order], paymentInfo, t)

      promises.push(simpleUpdateEntity('payments', {id: payment.id}, {entity: 'basket', entity_id: basket.id}, t))

      //basket store
      const children = await db.order.findAll({
        where: {parent_id: order.id},
        raw: true,
        nest: true,
      })
      for (const child of children) {
        promises.push(simpleUpdateEntity('order', {id: child.id},
          {
            date_send: sendDate,
            date_payed: datePayed,
            payed: child.price,
            invoiced: user.invoiced,
            status: sendDate === nowDate ? 'paid' : 'suspended',
          }
          , t))
      }
    } else {
      throw new ErrorHandler(INVALID_DATA, 'error processing payment')
    }

    let mail_sent;
    let result
    if (user.login) {
      const orderData = JSON.parse(JSON.stringify(order, null, 4))
      mail_sent = true
      result = [pretty(orderData)]
      promises.push(sendMail(emailTemplates.BASKET_NOTIFICATION, user.login, {
        subject: user.test_mode ? 'TEST' : 'Your order',
        result,
        more_link: `${WEB_APP_URL}${WEB_ROUTES.pastOrder}`,
        grand_total: amount
      }))

      // await pushNotification(user, notificationsMessage.TYPE_NEW_ORDER)

    } else {
      mail_sent = false
    }

    await Promise.all(promises)
    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      ...(mail_sent ? {mail_sent} : {}),
      result,
    })
  } catch (e) {
    next(e)
  }
})

const countChildren = (parentId) => db.sequelize.query('SELECT c.total FROM order p join(SELECT COUNT(*) as total from \`order\`  o WHERE o.parent_id=p.id )');

const saveOrder = async (order, couponCode, user, addressTo, message, quantity, t, intl, custom = false) => {
  if (couponCode) {
    const message = await checkDiscountCode(couponCode, order, t, user)
    if (message) {
      throw new ErrorHandler(INVALID_DATA, message)
    }
  }

  if (order.is_bulk) {
    await processBulkOrder(order, user, couponCode, message, quantity, t)
  } else {
    return await processSingleOrder(order, couponCode, user, message, quantity, intl, t)
  }

}

const listGrouped = async (req, res, next) => {
  try {
    const {user, query} = req

    const {parentOrders, count} = await orderService.getOrderGrouped(user.id, query);

    const {result} = parentOrders.reduce((acc, parent, index) => {
      if (!parent.card) {
        return acc
      }
      const children = [];
      const item = format(parent);

      for (const child of parent.children) {
        children.push(format(child, parent))
      }

      item.childs = children;
      item.children_total = children.length;
      const [insert] = parent.inserts;
      item.price_structure = {
        total: parseFloat(+parent?.price - parent.used_credit).toFixed(2),
        card_price: parent?.card_price,
        card_price_total: parent.children.length > 0 ? parseFloat(parent.card_price * parent.children.length).toFixed(2) : parseFloat(parent.card_price).toFixed(2),
        postage_total: parent.basket?.delivery_cost || 0,
        ...(parent.denomination ? {denomination: parseFloat(parent.denomination.price).toFixed(2)} : {}),
        ...(insert ? {insert: parseFloat(insert.price).toFixed(2)} : {}),
        ...(parent.price_orig ? {price_orig: parseFloat(parent.price_orig).toFixed(2)} : {}),
        ...(parent.card.price ? {card_price_orig: parseFloat(parent.card.price).toFixed(2)} : {}),
      };
      acc.result.push(item);

      return acc
    }, {result: []})

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      page: query.page,
      total_items: count,
      total_pages: lodash.ceil(count / query.limit),
      orders: result,
    })
  } catch (e) {
    next(e)
  }
}

const singleStepController = (req, res, next) => transaction(async t => {
  try {
    let {
      body: {
        message,
        couponCode = '',
        webhook_url,
        denomination_id,
        credit_card_id,
        wishes
      },
      user,
      sendDate,
      invoiced,
      font,
      card,
      tax_exempt,
      test_mode,
      date_payed,
      address_id,
      address_from,
      address_to,
      ApiLog,
      insert,
      denomination,
    } = req;
    const {locals: {platform}} = res;
    const promises = []

    let [newOrder, next_basket] = await Promise.all([
      simpleCreateEntity('order', {
        status: 'new',
        multiaddress: 0,
        user_id: user.id,
        platform,
        message,
        for_free: 0,
        auto_font_size: 0,
        font: font.id,
        discount_code: couponCode,
        transaction_id: null,
        date_send: sendDate,
        is_bulk: 0,
        test_mode: test_mode,
        webhook_url,
        card_id: card.id,
        ...(denomination_id ? {denomination_id} : {}),
        ...(wishes ? {wishes} : {}),
      }, t),
      next_id('basket')
    ])
    newOrder = JSON.parse(JSON.stringify(newOrder, null, 4))


    if (!newOrder) {
      throw new ErrorHandler(INVALID_DATA, 'error placing order', ApiLog)
    }
    if (insert) {
      newOrder.inserts = [insert];
      promises.push(simpleCreateEntity('order_inserts', {
        order_id: newOrder.id,
        insert_id: insert.id,
        name: insert.name,
        price: insert.price,
      }, t))
    }


    newOrder.address_to_id = address_id
    ApiLog.entity = 'order';
    ApiLog.entity_id = newOrder.id;

    const [{AUTO_INCREMENT: basket_id}] = next_basket
    newOrder.basket_id = basket_id
    newOrder.wishes = wishes
    newOrder.card = card
    denomination ? newOrder.denomination = denomination : newOrder.denomination = null;
    newOrder.address_to_id = address_to.id;
    newOrder.address_from_id = address_from.id;
    newOrder = await saveOrder(newOrder, couponCode, user, address_to, message, 1, t)

    newOrder.price_structure = orderTotalHelper.createPriceStructure(newOrder);

    if (couponCode) {
      const coupon = await db.coupons.findOne({where: {code: couponCode}, raw: true})
      newOrder.used_coupon_credit = coupon?.used_credit + Math.max(coupon.credit, order.price)
    }
    const paymentTypes = {
      credit1: user.credit,
      credit2: await getTotalByUserID(user.id),
      coupon: newOrder?.used_coupon_credit ? newOrder?.used_coupon_credit : 0,
    }

    newOrder = orderTotalHelper.distributeByPayType([newOrder], paymentTypes);

    let totalTax = 0;
    let lines;

    if (!tax_exempt) {
      lines = await generateLines(newOrder)
      const response = await calculate(user, lines)
      if (typeof response === "object" && response.totalTax) {
        totalTax += response.totalTax

        newOrder = orderTotalHelper.addTaxToPriceStructures(newOrder, response.lines)
        newOrder = orderTotalHelper.distributeByPayType(newOrder, paymentTypes, true)
      }
    }

    let [order] = newOrder
    order = JSON.parse(JSON.stringify(order, null, 4))
    order.price = orderTotalHelper.getTotal(order);
    order.delivery_cost = order.price_structure.postage.total;
    order.order_price = newOrder.price
    order.tax = totalTax;
    order.fontInfo = font;
    const amount = lodash.round(orderTotalHelper.getSumPriceByKey(order.price_structure, 'money'), 2)
    const is_ok = true;
    let payment = null;
    let transaction_id = null;
    let pm;

    if (amount && !invoiced) {
      if (!credit_card_id) {
        pm = await db.credit_card.findOne({
          where: {user_id: user.id}
        })

        if (!pm) {
          throw new ErrorHandler(INVALID_DATA, 'no credit cards', ApiLog)
        }
      } else {
        pm = await db.credit_card.findOne({
          where: {user_id: user.id, id: credit_card_id}
        })

        if (pm) {
          throw new ErrorHandler(INVALID_DATA, 'no such credit card', ApiLog)
        }
      }

      const taxMoney = lodash.round(orderTotalHelper.getSumPriceByKey(order.price_structure, 'money', GET_PRICE_STRUCTURE.ONLY_TAX), 2)

      const basketSub = {
        amount: amount,
        user_id: user.id,
        tax: lodash.round(taxMoney, 2) || 0
      }

      payment = await pay(basketSub, pm, user, 'basket', t)

      if (!payment || payment.status === 'ERROR') {
        throw new ErrorHandler(INVALID_DATA, 'error processing payment', ApiLog)
      }
      transaction_id = payment.transaction_id;
    }

    if ((is_ok && transaction_id) || !amount || !invoiced) {

    } else {
      throw new ErrorHandler(INVALID_DATA, 'error processing payment', ApiLog)
    }

    if ((is_ok && transaction_id) || !invoiced || !amount) {
      const update = {}
      update.transaction_id = transaction_id;
      update.status = 'paid';
      if (test_mode) {
        update.status = 'test';
      } else {
        if (new Date(sendDate).getTime() > new Date().getTime()) {
          update.status = 'suspended'
        }
      }

      // bonus credit (cards only)
      update.used_credit2 = lodash.round(orderTotalHelper.getSumPriceByKey(order.price_structure, 'credit2'), 2);

      update.used_expiring_credits2 = 0;
      if (!test_mode) {
        const usedExpiringCredits2 = lodash.round(await userCreditHelper.writeOff(user.id, update.used_credit2, t), 2);
        if (usedExpiringCredits2) {
          update.used_expiring_credits2 = usedExpiringCredits2;
        }
      }

      // coupon credit
      update.used_coupon_credit = lodash.round(orderTotalHelper.getSumPriceByKey(order.price_structure, 'coupon'), 2);

      // credit
      update.used_credit1 = lodash.round(orderTotalHelper.getSumPriceByKey(order.price_structure, 'credit1'), 2);

      update.used_credit = lodash.round(update.used_credit1 + update.used_credit2 + update.used_coupon_credit, 2)

      update.date_payed = date_payed;
      update.payed = amount;
      update.invoiced = invoiced;
      update.tax_exempt = tax_exempt;

      order = {...order, ...update}
      if ((!card.category_id || !isCustom(card.category)) && !test_mode) {
        promises.push(addToQuantity(card, -1, t))
      }

      promises.push(simpleUpdateEntity('order', {id: order.id}, {...update}, t))

      if (!test_mode && insert) {
        promises.push(addToQuantityInsert(insert, -1, t))
      }

      if (!test_mode) {
        promises.push(simpleUpdateEntity('user', {id: user.id}, {credit: user.credit - update.used_credit1}, t))

        if (!tax_exempt) {
          const res = await calculate(user, lines, true);

          if (res && res?.code) {
            promises.push(simpleUpdateEntity('order', {id: order.id}, {tax_transaction_code: res.code}, t))
          }
        }
      }

      //payment method info
      let paymentInfo = {}
      if (amount === 0) {
        paymentInfo.type = PAYMENT_METHODS.none;
      } else if (invoiced) {
        paymentInfo.type = PAYMENT_METHODS.Invoiced;
      } else {
        paymentInfo.type = PAYMENT_METHODS.CreditCard;
        paymentInfo.details = pm ? `${CREDIT_CARD_TYPE[pm.type]} ` : '';
      }

      const basket = await basketStore(user, date_payed, [order], paymentInfo, t)

      promises.push(simpleUpdateEntity('payments', {id: payment?.id}, {entity: 'basket', entity_id: basket.id}, t))

      // XXX this action is not used for bulk orders


    } else {
      throw new ErrorHandler(INVALID_DATA, 'error processing payment', ApiLog)
    }

    promises.push(simpleUpdateEntity('order', {id: order.id}, {
      price: order.price,
      order_price: order.order_price,
      tax: order.tax,
      basket_id: order.basket_id,
    }, t))

    let mail_sent = false;
    if (user?.login) {
      mail_sent = true;
      promises.push(sendMail(emailTemplates.BASKET_NOTIFICATION, user.login, {
        subject: test_mode ? 'TEST' : 'Your order',
        orders: [pretty(JSON.parse(JSON.stringify(order, null, 4)))],
        more_link: `${WEB_APP_URL}${WEB_ROUTES.pastOrder}`,
        grand_total: lodash.round(amount, 2),
      }))
    }

    await Promise.all(promises)
    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      mail_sent,
      order_id: order.id
    })
  } catch (e) {
    if (e.object) {
      let message = e.object.message.concat(`ERROR:${JSON.stringify({httpCode: e.httpCode, message: e.message})}`)
      await simpleCreateEntity('api_log', {...e.object, message: message, level: 'ERROR'})
    }
    next(e)
  }
})

const format = (order, parent) => {
  let orderResult = {}
  const time = new Date(order.date_created);
  let addressTo
  let addressFrom
  if (order?.basket && order.basket?.addressFrom && order.basket?.addressTo) {
    addressTo = order.basket.addressTo;
    addressFrom = order.basket.addressFrom;
  } else {
    addressTo = order.address_to;
    addressFrom = order.address_from;
  }
  if (!order.parent_id) {
    orderResult = {
      id: order.id,
      basket_id: order?.basket ? order.basket.id : null,
      for_free: !!order.for_free,
      date_created: time.getTime(),
      message: order.message,
      message_orig: order?.basket && order?.basket?.message ? order.basket.message : order.message,
      font: order.font,
      font_size: order?.font_size ? order.font_size : null,
      auto_font_size: !!order.auto_font_size,
      fontInfo: order.fontInfo,
      address_from: null,
      address_to: null,
      price: lodash.round(order.price, 2),
      used_credit: lodash.round(order.used_credit, 2),
      payed: lodash.round(order.payed, 2),
      status: order.status,
      date_day: time.getDate(),
      date_month: time.getMonth(),
      date_year: time.getFullYear(),
      date_send: order.date_send,
      card_category_name: order.card.category.name || null,
      card_name: order.card.name,
      card_cover: getUrl(order.card.cover),
      multiaddress: order.multiaddress,
      is_bulk: order.is_bulk,
      delivery_cost: 0,
      notes: order.note,
      test_mode: order.test_mode,
      tax: order.tax ? order.tax : null,
      refund_status: order.refund_status,
      wishes: order.wishes,
      shipping_include: order?.shipping_include,
      ...(order?.shipping_include ? {shipping_details: order.shipping_details} : {}),
      signature: order?.signature ? decorateSignatureObject(order.signatures) : null,
      signature2: order?.signature2 ? decorateSignatureObject(order.signatures2) : null,
      signature_id: order.signature_id,
      signature2_id: order.signature2_id,
      signature_preview: order.signature_id ? getUrl(order.signatures.preview, 'signatures') : null,
      signature2_preview: order.signature2_id ? getUrl(order.signatures2.preview, 'signatures') : null,
    }

    if (addressTo) {
      orderResult.address_to = addressTo;
    }
    if (addressFrom) {
      orderResult.address_from = addressFrom;
    }

    if (order.card) {
      orderResult.card = {
        id: order.card.id,
        name: order.card.name,
        cover: getUrl(order.card.cover),
        price: order.card.price * order?.basket?.quantity,
        price_orig: order.payed,
        category_id: order.card.category_id,
        quantity: order?.basket?.quantity,
        delivery_cost: order?.basket?.delivery_cost,

      }
    }
    orderResult.card_dimensions = {
      closed_width: order.card.closed_width,
      closed_height: order.card.closed_height,
      margin_top: order.card.preview_margin_top,
      margin_right: order.card.preview_margin_right,
      margin_bottom: order.card.preview_margin_bottom,
      margin_left: order.card.preview_margin_left,
      font_size: order.card.font_size,
      half_inside: getUrl(order.card.half_inside),
    }
    orderResult.delivery_cost = order?.basket?.delivery_cost;
    orderResult.quantity = order?.basket?.quantity;

    if (order.denomination_id) {
      orderResult.denomination = {
        id: order.denomination.id,
        nominal: order.denomination.nominal,
        price: order.denomination.price,
      }
      orderResult.giftCard = {
        id: order.denomination.gcard.id,
        name: order.denomination.gcard.name,
        image: getUrl(order.denomination.gcard.image),
      }
    }

    const [insert] = order.inserts;

    if (insert) {
      orderResult.inserts = {
        id: insert.id,
        price: insert.price,
        name: insert.name,
        insert_id: insert.insert_id,
      }
    }

  } else {
    orderResult = {
      id: order.id,
      message: order.message,
      address_to: null,
      status: order.status,
      delivery_cost: 0,
      price: lodash.round(order.price, 2),
      used_credit: lodash.round(order.used_credit, 2),
      tax: order.tax ? lodash.round(order.tax, 2) : null,
      wishes: order.wishes,
      signature: order?.signatures ? decorateSignatureObject(order.signatures) : null,
      signature2: order?.signatures2 ? decorateSignatureObject(order.signatures2) : null,
      signature_id: order.signature_id,
      signature2_id: order.signature2_id,
      signature_preview: order.signature_id ? getUrl(order?.signatures?.preview, 'signatures') : null,
      signature2_preview: order.signature2_id ? getUrl(order?.signatures2?.preview, 'signatures') : null,

    }

    if (parent.denomination_id && parent.is_bulk) {
      orderResult.price = lodash.round(order.price - parent.denomination.price, 2)
    }
    if (addressTo) {
      orderResult.address_to = addressTo;
    }
    if (addressFrom) {
      orderResult.address_from = addressFrom;
    }

    const [insert] = order.inserts;

    if (insert) {
      orderResult.inserts = {
        id: insert.id,
        price: insert.price,
        name: insert.name,
        insert_id: insert.insert_id,
      }
    }

    orderResult.delivery_cost = lodash.round(addressTo?.delivery_cost, 2)
  }
  return orderResult
}


const orderController = {
  singleStepController,
  orderDetails,
  listGrouped,
  count
}

export {
  orderController,
  getPastOrders,
  findByAttribytes,
  getUserPastBaskets,
  pastBaskets,
  // formatOrder,
  getUserOrders,
  placeBasket,
  calcTaxes,
  getUserPastOrders,
  place,
  getListChild,
  formatOrderNew,
  format,
  isValidCoupon,
  pretty,
  orderPay,
  createBasketOrder,
  decorateSignatureObject,
  countOrdersPrice,
  calculateTotalTax
}
