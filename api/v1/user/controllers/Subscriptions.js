import pkg from 'sequelize';
import _lodash from 'lodash';

import db from '../../../../db/models';
import {
  calculate,
  generateLinesForSubscriptions,
  generateLinesForUserSubscription,
} from '../../../../helpers/utils/avatax.helper.js';
import {getUrl} from '../../../../helpers/utils/media/getUrl.js';
import {ErrorHandler} from "../../../../middlewares/error.js";
import constants from "../../../../helpers/constants/constants.js";
import {
  findEntity,
  simpleCreateEntity,
  simpleUpdateEntity,
  transaction
} from "../../../../helpers/utils/model.utils.js";
import createAppleCard from "../../../../helpers/utils/payment/profile/create-apple-payment-profile.js";
import createApplePay from "../../../../helpers/utils/payment/profile/create-apple-payment-profile.js";
import Pay from "../../../../helpers/utils/payment/pay/pay-process.js";
import {sendMail} from "../../../../helpers/utils/mail/mail.js";
import {
  stopAll,
  stopAllNew,
  getActiveByUser,
  findSubscription,
  getLastActiveSubscription,
  getActiveFutureSubscription, findAll, getSubscriptions, getCurrentSubscription, getLastNewSubscription
} from '../services/subscription.service.js';
import {creditCardService,} from "../services";

const {Op} = pkg;
const {
  INVALID_DATA,
  CREDIT_CARD_TYPE,
  emailTemplates,
  SUBSCRIPTIONS_STATUS,
  OK,
  WEB_APP_URL,
  WEB_ROUTES,
  PAYMENT_METHODS
} = constants;

const calcValuesForUpdate = (subscription, currentSubscription) => {
  const {expires_at, period, fee, taxable_amount, credit2} = subscription
  const dayTime = 86400
  const expiesAtTime = new Date(expires_at).getTime()
  const todayTime = new Date().getTime()
  const daysLeft = Math.floor((expiesAtTime - todayTime) / dayTime)

  let factor = 1
  if (daysLeft < period) {
    factor = daysLeft / period
  }
  let newFee = _lodash.round((fee - currentSubscription.fee) * factor, 2)
  let taxableAmount = _lodash.round((taxable_amount - currentSubscription.taxable_amount) * factor, 2)
  let newCredit2 = _lodash.round((credit2 - currentSubscription.credit2) * factor, 2)


  if (newFee < 0) newFee = 0
  if (taxableAmount < 0) taxableAmount = 0
  if (newCredit2 < 0) newCredit2 = 0

  return {
    fee: newFee,
    taxable_amount: taxableAmount,
    credit2: newCredit2,
    expiresAt: currentSubscription.expires_at,
  }
}


const getPaymentAmount = async (current, user, entity) => {
  if (entity === 'basket') {
    return {
      total: current.amount,
      tax: current.tax,
      tax_exempt: 0,
    }
  }
  const fee = current.fee
  let tax = 0
  let taxExempt = current.tax_exempt

  if (user) {
    if (user.tax_exempt === 0) {
      const lines = await generateLinesForUserSubscription(current)

      const res = await calculate(user, lines)

      if (typeof res === 'object' && res.totalTax) {
        tax = res.totalTax
      }
    } else {
      taxExempt = true
    }
  }
  return {
    total: +fee + tax,
    tax,
    tax_exempt: taxExempt,
  }
}

const getTaxList = async (user, subscriptions = null, current = null) => {

  if (!subscriptions) {
    subscriptions = await findAll({status: SUBSCRIPTIONS_STATUS.ACTIVE})
  }

  const taxes = []

  if (user && !user.tax_exempt) {
    if (!current) {
      current = await getActiveByUser(user.id)
    }
    if (current) {
      for (let subscription of subscriptions) {
        if (current.subscription_id !== subscription.id && +current.fee <= +subscription.fee) {
          const value = calcValuesForUpdate(subscription, current)
          subscription.taxable_amount = _lodash.round(value.taxable_amount, 2)
        }
      }
    }
    const lines = await generateLinesForSubscriptions(subscriptions)

    const res = await calculate(user, lines)
    if (typeof res === 'object' && !_lodash.isEmpty(res.lines)) {
      for (const line of res.lines) {
        if ((line.tax || line.tax === 0) && line.ref1 && line.ref2 && line.ref2 === 'subscription') {
          taxes.push({
            id: line.ref1,
            tax: _lodash.round(line.tax, 2),
          })
        }
      }
    }
  }
  return taxes
}


const forApi = (subscription) => {
  const arr = ['id', 'name', 'description', 'cost_description', 'fee', 'taxable_amount', 'period', 'credit2', 'discount', 'is_best_value', 'plan_icon', 'color']
  const objectKeys = Object.keys(subscription)
  const keys = []
  const result = {}
  for (const subKey of objectKeys) {
    const attribute = arr.find((key) => key === subKey)
    if (attribute && attribute) {
      keys.push(attribute)
    }
  }
  keys.map((value, number) => {
    result[value] = number
    return true
  })

  if (result.plan_icon && subscription.plan_icon) {
    const filename = subscription.plan_icon.replace(' ', '%20')
    result.plan_icon = getUrl(filename, 'media')
  }

  if (result.id && typeof subscription.id === 'number') {
    result.id = subscription.id
  }
  if (result.fee && typeof subscription.fee === 'number') {
    result.fee = subscription.fee
  }

  if (result.taxable_amount && typeof subscription.taxable_amount === 'number') {
    result.taxable_amount = subscription.taxable_amount
  }

  if (result.period && typeof subscription.period === 'number') {
    result.period = subscription.period
  }

  if (result.credit2 && typeof subscription.credit2 === 'number') {
    result.credit2 = subscription.credit2
  }

  if (result.discount && typeof subscription.discount === 'number') {
    result.discount = subscription.discount
  }
  if (result.is_best_value) {
    result.is_best_value = subscription.is_best_value ? 1 : 0
  }

  return result
}


const addPaymentInfo = (us, pm) => {
  if (pm.user_id !== us.user_id) {
    throw new ErrorHandler(INVALID_DATA, 'error payment method')
  }
  if (pm.id) {
    return pm.id
  }
}


const subscriptionNew = async (user, {subscription_id, data_value, credit_card_id}, t) => {

  if (!subscription_id) throw new ErrorHandler(INVALID_DATA, 'subscription id not set')

  const [subscription, oldUserSubscriptions] = await Promise.all([
    findSubscription(subscription_id),
    getActiveByUser(user.id)
  ])

  let paymentMethods = ''
  if (!data_value) {
    if (!credit_card_id || typeof +credit_card_id !== "number") {
      throw  new ErrorHandler(INVALID_DATA, 'credit_card id error')
    }

    paymentMethods = await creditCardService.findCreditCard(credit_card_id, user.id)

  } else {
    /*done*/
    paymentMethods = await createApplePay(user, data_value, t)
    if (!paymentMethods) throw new ErrorHandler(INVALID_DATA, 'Apple Pay error')
    /*done*/
  }


  let correct = false
  let futureActiveSub
  if (oldUserSubscriptions) {
    if (oldUserSubscriptions.subscription_id === subscription.id || +oldUserSubscriptions.fee > +subscription.fee) {
      const date = new Date()
      date.setDate(date.getDate() - 1)
      const yesterday = new Date(date.toISOString())
      const newSub = await simpleCreateEntity('user_subscriptions', {
        user_id: user.id,
        status: SUBSCRIPTIONS_STATUS.NEW,
        extendability: 1,
        name: subscription.name,
        fee: subscription.fee,
        taxable_amount: subscription.taxable_amount,
        tax_exempt: subscription.tax_exempt,
        period: subscription.period,
        credit2: subscription.credit2,
        discount: subscription.discount,
        color: subscription.color,
        subscription_id: subscription.id,
        description: subscription.description,
        cost_description: subscription.cost_description,
        updated_at: new Date(),
        starts_at: yesterday,
        expires_at: yesterday,
      })
      const credit_card_id = addPaymentInfo(newSub, paymentMethods)

      await stopAll(user.id, t)
      const [lastActive] = await getLastActiveSubscription(user.id)

      await Promise.all([simpleUpdateEntity('user_subscriptions', {id: newSub.id}, {
        expires_at: lastActive.expires_at,
        starts_at: lastActive.expires_at,
        credit_card_id,
      }, t),
        simpleUpdateEntity('user_subscriptions', {id: oldUserSubscriptions.id}, {
          extendability: 0,
          updated_at: new Date()
        }, t),])
      newSub.expires_at = lastActive.expires_at
      newSub.starts_at = lastActive.expires_at
      return newSub
    } else {
      futureActiveSub = await getActiveFutureSubscription(user.id)
      if (!futureActiveSub) {
        correct = calcValuesForUpdate(oldUserSubscriptions, forApi(subscription))
      } else {
        let money = calcUnderutilizedFee(oldUserSubscriptions)
        let cr2 = 0

        for (const sub of futureActiveSub) {
          money += sub.fee
          cr2 += sub.credit2
        }

        let fee = subscription.fee - money

        if (fee < 0) {
          fee = 0
        }

        let credit2 = subscription.credit2 - cr2

        if (credit2 < 0) {
          credit2 = 0
        }

        correct = {
          fee,
          credit2,
          taxable_amount: _lodash.round((subscription.taxable_amount * fee / subscription.fee), 2)
        }
      }
    }
  }

  const date = new Date()
  let userSubscription = await simpleCreateEntity('user_subscriptions', {
    user_id: user.id,
    status: SUBSCRIPTIONS_STATUS.NEW,
    extendability: 1,
    name: subscription.name,
    fee: subscription.fee,
    taxable_amount: subscription.taxable_amount,
    tax_exempt: subscription.tax_exempt,
    period: subscription.period,
    credit2: subscription.credit2,
    discount: subscription.discount,
    color: subscription.color,
    subscription_id: subscription.id,
    description: subscription.description,
    cost_description: subscription.cost_description,
    expires_at: date,
    updated_at: new Date(),
    starts_at: new Date(),
  }, t)
  userSubscription = JSON.parse(JSON.stringify(userSubscription, null, 4))
  userSubscription.correctedFee = correct.fee
  userSubscription.correctedTaxableAmount = correct.taxable_amount
  userSubscription.correctedCredit2 = correct.credit2
  if (correct.expiresAt) {
    userSubscription.correctedExpiresAt = correct.expiresAt
  }
  const cc_id = addPaymentInfo(userSubscription, paymentMethods)

  await simpleUpdateEntity('user_subscriptions', {id: userSubscription.id}, {
    credit_card_id: cc_id,
  }, t)

  const payment = await pay(userSubscription, paymentMethods, user, 'user_subscriptions', t)

  if (payment && payment.status === 'ERROR') {
    await simpleUpdateEntity('user_subscriptions', {id: userSubscription.id}, {status: SUBSCRIPTIONS_STATUS.CANCELED}, t)
  }

  await submitTaxes(user, userSubscription)

  await activateSubscription(userSubscription, t)
  await stopAllNew(user.id, t)

  if (oldUserSubscriptions) {
    await simpleUpdateEntity('user_subscriptions', {id: oldUserSubscriptions.id}, {status: SUBSCRIPTIONS_STATUS.CANCELED}, t)
    if (futureActiveSub) {
      for (const sub of futureActiveSub) {
        await simpleUpdateEntity('user_subscriptions', {id: sub.id}, {status: SUBSCRIPTIONS_STATUS.CANCELED}, t)
      }
    }
    await sendMail(emailTemplates.BASE_NOTIFICATION, user.login, {
      subject: 'Successful Subscription Updating',
      top_title: `${subscription.name}<br> Subscription`,
      title: `Thank you,<br>${user.fname} ${user.lname}`,
      message: [
        `You have updated your Project_name ${oldUserSubscriptions.name} subscription to Project_name ${subscription.name} Subscription.`,
        `On ${new Date(userSubscription.expires_at).getDate()}/${new Date(userSubscription.expires_at).getMonth() + 1}/${new Date(userSubscription.expires_at).getFullYear()} you will be charged $${subscription.fee} plus taxes based on your location ($${payment.tax}) for Project_name ${subscription.name.toUpperCase()} Monthly. You can update or cancel your subscription by visiting your Account Settings`,
        `By purchasing a subscription, you authorized Project_name to charge you $${subscription.fee}/month plus taxes until cancellation. We'll notify you in advance of any price changes that may occur. For more legal information, please see our Terms of Service.`,
        'Enjoy your updated benefits, and again, thanks for the being with us!'
      ],
      link: {
        url: `${WEB_APP_URL}${WEB_ROUTES.cards}`,
        text: 'START WRYTING'
      }
    })
  } else {
    await sendMail(emailTemplates.BASE_NOTIFICATION, user.login, {
      subject: 'Successful Subscription Purchase',
      top_title: `${subscription.name}<br> Subscription`,
      title: `Welcome to the club,<br>${user.fname} ${user.lname}`,
      message: [
        `Great success! Thanks for your subscription. You're awesome and you're our favorite Project_name user (just don't tell the other ones).`,
        `You were charged $${subscription.fee} plus taxes based on your location ($${payment.tax}) for Project_name ${subscription.name.toUpperCase()} Monthly. You can update or cancel your subscription by visiting your Account Settings`,
        `By purchasing a subscription, you authorized Project_name to charge you $${subscription.fee}/month plus taxes until cancellation. We'll notify you in advance of any price changes that may occur. For more legal information, please see our Terms of Service.`,
        'Enjoy your benefits, and again, thanks for the being our user! You’re the best!'
      ],
      link: {
        url: `${WEB_APP_URL}${WEB_ROUTES.cards}`,
        text: 'START WRYTING'
      }
    })
  }

  return {
    payment_method_type: payment.payment_method_type,
    credit_card_id,
    ...userSubscription,
  }
}


const calcUnderutilizedFee = (subscriptions) => {
  const dayTime = 86400 * 1000
  const expiesAtTime = new Date(subscriptions.expires_at).getTime()
  const todayTime = new Date().getTime()
  const daysLeft = Math.floor((expiesAtTime - todayTime) / dayTime)
  let factor = 1

  if (daysLeft < subscriptions.period) {
    factor = daysLeft / subscriptions.period
  }

  let fee = _lodash.round((subscriptions.fee * factor), 2)

  if (fee < 0) {
    fee = 0
  }
  return fee
}


const pay = async (object, pm, user, entity, t) => {
  if (object.user_id !== user.id) {
    throw new ErrorHandler(INVALID_DATA, 'error payment method')
  }

  const payment = await createPayment(user, object, entity, t)

  return payWithMethod(payment, pm, user, t)
}


const createPayment = async (user, object, entity) => {
  const amount = await getPaymentAmount(object, user, entity)
  return simpleCreateEntity('payments', {
    user_id: user.id,
    status: SUBSCRIPTIONS_STATUS.NEW,
    entity_id: object.id,
    entity,
    amount: amount.total,
    tax: amount.tax,
    tax_exempt: amount.tax_exempt,
    ...(object.test_mode ? {is_test: object.test_mode} : {is_test: user.test_mode})
  })
}

const payWithMethod = async (payment, pm, user, t) => {

  if (pm.type === CREDIT_CARD_TYPE["64"]) {
    payment.payment_method_type = PAYMENT_METHODS.ApplePay
  } else {
    payment.payment_method_type = PAYMENT_METHODS.CreditCard
  }
  payment.credit_card_id = pm.id


  let result = await Pay(payment.amount, user, pm.anet_profile_id, payment.is_test)


  if (result.transId) {
    await simpleUpdateEntity('payments', {id: payment.id}, {
      transaction_id: result.transId,
      status: 'PAID',
      credit_card_id: pm.id,
    })
  } else {
    await simpleUpdateEntity('payments', {id: payment.id}, {
      ...(result.message ? {
        error: result.message,
        credit_card_id: pm.id,
        status: 'ERROR'
      } : {error: "Can't get transaction id with card payment.", status: 'ERROR'})
    })
  }
  return findEntity('payments', payment.id, null, null, null, null)
}

const submitTaxes = async (user, uSub) => {
  if (user && !user.tax_exempt) {
    const res = await calculate(user, await generateLinesForUserSubscription(uSub), true)
    if (!res) {
      throw new ErrorHandler(INVALID_DATA, 'Physical address not valid.Please, update your physical address!')
    }
  }
}


const activateSubscription = async (us, t) => {
  if (us.status !== SUBSCRIPTIONS_STATUS.NEW) {
    return false
  }
  return renew(us, t)
}


const renew = async (us, t) => {
  if (us.status !== SUBSCRIPTIONS_STATUS.ACTIVE && us.status !== SUBSCRIPTIONS_STATUS.NEW) {
    return false
  }

  let start = new Date(us.starts_at)
  if (!start) {
    start = new Date()
  }

  let expires_at = new Date(us.correctedExpiresAt)

  if (!us.correctedExpiresAt || !expires_at) {
    expires_at = new Date(us.expires_at)
    if (!expires_at) {
      expires_at = start
    }
    const date = new Date(expires_at)
    date.setDate(date.getDate() + us.period)
    expires_at = new Date(date.toISOString())
  }

  await Promise.all([
    simpleUpdateEntity('user_subscriptions', {id: us.id}, {
      expires_at,
      starts_at: start,
      next_hourly_attempt: 72,
      status: SUBSCRIPTIONS_STATUS.ACTIVE
    }, t),
    simpleCreateEntity('user_credits2', {
      user_id: us.user_id,
      expires_at,
      amount: us.correctedCredit2 ? us.correctedCredit2 : us.credit2,
      updated_at: new Date()
    }, t)
  ])

  return true
}


const getAll = async (user) => {
  const response = {}
  let warning = null

  const [subscriptions, currentSubscription] = await Promise.all([
    getSubscriptions(),
    getCurrentSubscription(user.id)
  ])

  const taxes = await getTaxList(user, subscriptions, currentSubscription)

  const sumTaxes = taxes.reduce((acc, value) => {
    acc = +value.tax
    return acc
  }, 0)

  if (!sumTaxes) {
    warning = 'Physical address not valid.Please, update your physical address!'
  }
  if (user.id && currentSubscription) {
    let lastSubscription = await getLastNewSubscription(user.id)

    const {tax} = taxes?.find(tax => +tax.id === currentSubscription.subscription_id) || {tax: 0}


    response.current = currentSubscription
    response.current.tax = tax

    let newSub = null
    if (lastSubscription) {
      newSub = lastSubscription
      const {tax: taxNew} = taxes?.find(tax => +tax.id === newSub.subscription_id) || {tax: 0}
      newSub.tax = taxNew
    }
    response.newSubscription = newSub

    subscriptions.forEach((sub, index) => {
      sub.tax = taxes[index]?.tax || 0
      if (currentSubscription.subscription_id === sub.id || currentSubscription.fee > sub.fee) {
        sub.update = {
          type: 'downgrade',
        }
      } else {
        const valuesForUpdate = calcValuesForUpdate(sub, currentSubscription)
        sub.update = {
          type: 'upgrade',
          fee: valuesForUpdate.fee,
          credit2: valuesForUpdate.credit2,
        }
      }

      if (currentSubscription.subscription_id === sub.id) {
        sub.is_current = 1
        let isOriginal = true
        if (currentSubscription.description && currentSubscription.description !== sub.description) {
          sub.old_description = currentSubscription.description
          isOriginal = false
        }
        if (currentSubscription.cost_description && currentSubscription.cost_description !== sub.cost_description) {
          sub.old_cost_description = currentSubscription.cost_description
          isOriginal = false
        }
        if (currentSubscription.fee !== sub.fee || currentSubscription.credit2 !== sub.credit2 || currentSubscription.discount !== sub.discount) isOriginal = false
        if (isOriginal) {
          sub.is_original = 1
        }
      }
    })
  }

  const {current, newSubscription} = response

  return {
    subscriptions,
    current,
    new: newSubscription,
    ...(warning ? {warning} : {})
  }
}

//subscription Controllers
const list = async (req, res, next) => {
  try {
    const {user} = req

    res.status(200).json({
      httpCode: 200,
      status: 'ok',
      ...await getAll(user)
    })
  } catch (e) {
    next(e)
  }
}

const taxList = async (req, res, next) => {
  try {
    const {user} = req

    const taxes = await getTaxList(user)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      taxes,
    })
  } catch (e) {
    next(e)
  }
}


const cancel = async (req, res, next) => {
  try {
    const {body: {id}, user} = req

    const promises = []

    if (!id) {
      throw new ErrorHandler(INVALID_DATA, 'Invalid user subscription ID')
    }

    const userSubscription = await findEntity('user_subscriptions', null, {id: id, user_id: user.id})

    if (!userSubscription || userSubscription.status === SUBSCRIPTIONS_STATUS.CANCELED || userSubscription.status === SUBSCRIPTIONS_STATUS.EXPIRED) {
      throw new ErrorHandler(INVALID_DATA, 'Unable to cancel this subscription')
    }

    promises.push(stopAll(user.id))

    promises.push(sendMail(emailTemplates.BASE_NOTIFICATION, user.login, {
      subject: 'Successful Subscription Cancellation',
      top_title: 'Subscription<br>Canceled',
      title: `Sad to see you go,<br>${user.fname} ${user.lname}`,
      message: [
        `Every month we provide the subscription benefits like free monthly cards and up to ${userSubscription.discount}% off to every order`,
        'Just know that we’re happy to see you back. If you change your mind or unsubscribed accidentally, click the button below to renew'
      ],
      link: {
        url: `${WEB_APP_URL}${WEB_ROUTES.subscriptions}`,
        text: 'SUBSCRIBE',
      },
    }))

    await Promise.all(promises)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
}

const renewalTax = async (req, res, next) => {
  try {
    const {user} = req
    let tax = 0
    const current = await getActiveByUser(user.id)


    if (user && current) {
      const info = await getPaymentAmount(current, user)
      tax = info.tax
    }
    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      tax: _lodash.round(tax, 2),
    })
  } catch (e) {
    next(e)
  }
}

const updatePaymentMethod = (req, res, next) => transaction(async (t) => {
  try {
    const {body, user} = req;
    let {id, data_value, credit_card_id} = body
    if (!id) throw new ErrorHandler(INVALID_DATA, 'Invalid user subscription ID')

    let pm = null

    if (!data_value) {
      if (!credit_card_id || typeof +credit_card_id !== "number") {
        throw new ErrorHandler(INVALID_DATA, 'credit_card id error')
      }
      pm = await db.credit_card.findOne({where: {id: credit_card_id, user_id: user.id}, raw: true})

      if (!pm) throw new ErrorHandler(INVALID_DATA, 'no such credit card')
    } else {
      pm = await createAppleCard(user, data_value, t)
      if (!pm) throw new ErrorHandler(INVALID_DATA, 'Apple Pay error')
    }

    const us = await getActiveByUser(user.id)
    if (!us || us.id !== +id) {
      throw new ErrorHandler(INVALID_DATA, 'Unable to update payment method for this subscription')
    }

    credit_card_id = addPaymentInfo(us, pm)

    await simpleUpdateEntity('user_subscriptions', {
      user_id: user.id,
      status: 'ACTIVE',
      expires_at: {[Op.gt]: new Date()},
      starts_at: {[Op.lte]: new Date()},
    }, {credit_card_id}, t)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
})

const createNew = (req, res, next) => transaction(async t => {
  try {
    const {user, body} = req;

    const subscription = await subscriptionNew(user, body, t)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      subscription
    })
  } catch (e) {
    t.rollback()
    next(e)
  }
})

const subscriptionController = {
  updatePaymentMethod,
  renewalTax,
  createNew,
  taxList,
  cancel,
  list
}

export {
  subscriptionController,
  pay,
  renew,
  getAll,
  getTaxList,
  submitTaxes,
  addPaymentInfo,
  subscriptionNew,
  getPaymentAmount,
  calcValuesForUpdate,
  updatePaymentMethod,
}
