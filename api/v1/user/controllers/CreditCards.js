import pkg from 'sequelize'
import db from '../../../../db/models'
import {
  deleteEntity,
  findEntity,
  isRecordExist,
  simpleCreateEntity,
  simpleUpdateEntity,
  transaction
} from "../../../../helpers/utils/model.utils.js";
import {ErrorHandler} from "../../../../middlewares/error.js";
import constants from "../../../../helpers/constants/constants.js";
import createPaymentProfile from "../../../../helpers/utils/payment/profile/create-payment-profile.js";
import deletePayment from "../../../../helpers/utils/payment/profile/delete-payment-profile.js";

const {INVALID_DATA, OK, CREDIT_CARD_TYPE} = constants
const {Op, fn, col} = pkg

const getCreditCardsList = (userId) => {
  const creditCards = db.credit_card.findAll({
    where: {
      user_id: userId,
      is_visible: 1,
    },
    attributes: ['id', 'anet_profile_id', 'type', 'is_default', 'card_number', 'expiration_date'],
    order: [['id', 'DESC']],
    limit: 100,
    raw: true,
    nest: true
  })

  return creditCards
}

const getTotalByUserID = async (userId, type = 3) => {
  let expires_at = null
  if (type === 3) {
    expires_at = {
      expires_at: {
        [Op.or]: [
          null,
          {
            [Op.gt]: new Date(),
          },
        ],
      },
    }
  }
  if (type === 2) {
    expires_at = {
      expires_at: {
        [Op.gt]: new Date(),
      },
    }
  }
  if (type === 1) {
    expires_at = {
      expires_at: null
    }
  }
  const totalByUserID = await db.user_credits2.findAll({
    where: {
      user_id: userId,
      ...expires_at
    },
    attributes: [[fn('sum', col('amount')), 'total']],
    raw: true,
  })

  return totalByUserID && totalByUserID[0] && totalByUserID[0].total ? totalByUserID[0].total : 0
}


// const addNewCreditCard = (user, {
//   token = null,
//   type = null,
//   descriptor = 'COMMON.ACCEPT.INAPP.PAYMENT',
//   address = '123 Main street',
//   zip,
//   name,
//   country_id = 0,
//   country: country_name = null,
// }) => transaction(async (t) => {
//   if (typeof +type !== "number") {
//     throw new ErrorHandler(INVALID_DATA, 'type error')
//   }
//   if (!zip) throw new ErrorHandler(INVALID_DATA, 'zip error')
//
//   const first_name = name.split(' ')[0]
//   const last_name = name.split(' ').pop()
//
//   const country = await db.country.findOne({
//     where: {
//       [Op.or]: {
//         ...(country_id ? {id: country_id} : {id: 1}),
//         ...(country_name ? {name: country_name} : {})
//       }
//     }, raw: true
//   })
//
//   if (!country) throw new ErrorHandler(INVALID_DATA, 'country error')
//
//   if (user.credit_cards_req > 5) throw new ErrorHandler(INVALID_DATA, 'error adding payment method')
//
//   const [defaultCard, {card_number, expiration_date, payId}] = await Promise.all([
//     isRecordExist('credit_card', {
//       user_id: user.id,
//       is_visible: 1,
//       is_default: 1,
//     }),
//     createPaymentProfile(first_name, last_name, address, zip, country, descriptor, token, user),
//   ])
//
//   const [cc] = await Promise.all([
//     simpleCreateEntity('credit_card', {
//       user_id: user.id,
//       anet_profile_id: payId,
//       card_number,
//       type: type ? type : 1,
//       is_default: defaultCard ? 0 : 1,
//       expiration_date,
//     }, t), simpleUpdateEntity('user', {id: user.id}, {credit_cards_req: user.credit_cards_req + 1}, t)])
//
//   return cc
//
// })

const addNew = (req, res, next) => transaction(async t => {
  try {
    const {
      body: {
        token = null,
        type = null,
        descriptor = 'COMMON.ACCEPT.INAPP.PAYMENT',
        address = '123 Main street',
        zip,
        name,
        country_id = 0,
        country: country_name = null,
      },
      user
    } = req;

    if (typeof +type !== "number") {
      throw new ErrorHandler(INVALID_DATA, 'type error')
    }
    if (!zip) throw new ErrorHandler(INVALID_DATA, 'zip error')

    const first_name = name.split(' ')[0]
    const last_name = name.split(' ').pop()

    const country = await db.country.findOne({
      where: {
        [Op.or]: {
          ...(country_id ? {id: country_id} : {id: 1}),
          ...(country_name ? {name: country_name} : {})
        }
      }, raw: true
    })

    if (!country) throw new ErrorHandler(INVALID_DATA, 'country error')

    if (user.credit_cards_req > 5) throw new ErrorHandler(INVALID_DATA, 'error adding payment method')

    const [defaultCard, {card_number, expiration_date, payId}] = await Promise.all([
      isRecordExist('credit_card', {
        user_id: user.id,
        is_visible: 1,
        is_default: 1,
      }),
      createPaymentProfile(first_name, last_name, address, zip, country, descriptor, token, user),
    ])

    const [credit_card] = await Promise.all([
      simpleCreateEntity('credit_card', {
        user_id: user.id,
        anet_profile_id: payId,
        card_number,
        type: type ? type : 1,
        is_default: defaultCard ? 0 : 1,
        expiration_date,
      }, t), simpleUpdateEntity('user', {id: user.id}, {credit_cards_req: user.credit_cards_req + 1}, t)])

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      credit_card,
    })
  } catch (e) {
    next(e)
  }
})

const setDefaultCreditCard = async (user, credit_card_id) => {
  if (!credit_card_id) throw new ErrorHandler(INVALID_DATA, 'credit card id error')

  const creditCard = await db.credit_card.findOne({where: {user_id: user.id, id: credit_card_id}, attributes: ['id']})

  if (!creditCard) throw new ErrorHandler(INVALID_DATA, 'no such credit card')

  await Promise.all([
    simpleUpdateEntity('credit_card', {user_id: user.id, id: {[Op.not]: credit_card_id}}, {is_default: 0}),
    simpleUpdateEntity('credit_card', {user_id: user.id, id: credit_card_id}, {is_default: 1})
  ])
}

const deleteCreditCard = (req, res, next) => transaction(async (t) => {
  try {
    const {user, body: {credit_card_id}} = req

    if (!credit_card_id || !Number.isInteger(credit_card_id)) {
      throw new ErrorHandler(INVALID_DATA, 'credit card id error')
    }
    const creditCard = await findEntity('credit_card', null, {user_id: user.id, id: credit_card_id}, null, null, null)

    if (!creditCard) {
      throw new ErrorHandler(INVALID_DATA, 'no such credit card')
    }
    await Promise.all([
      deleteEntity('credit_card', {
        user_id: user.id,
        id: credit_card_id,
      }, t),
      simpleUpdateEntity('user', {id: user.id}, {credit_cards_req: user.credit_cards_req - 1}, t),
      deletePayment(user.anet_customer_id, creditCard.anet_profile_id)
    ])

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
})

const setDefault = async (req, res, next) => {
  try {
    const {body: {credit_card_id}, user} = req

    await setDefaultCreditCard(user, credit_card_id)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
}

const listOnly = async (req, res, next) => {
  try {
    const {user} = req

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      credit_cards: await getCreditCardsList(user.id),
    })
  } catch (e) {
    next(e)
  }
}

const list = async (req, res, next) => {
  try {
    const {user} = req
    const credit_cards = await getCreditCardsList(user.id)
    const discount_credit_type2 = await getTotalByUserID(user.id)

    const {credit, invoiced, billing_address, billing_zip, billing_country_id} = user

    let country = null
    if (billing_country_id) {
      const {name} = await db.country.findByPk(billing_country_id, {attributes: ['name'], plain: true})
      country = name
    }

    const billing_info = {
      address: billing_address,
      zip: billing_zip,
      country_id: billing_country_id,
      country,
    }

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      credit_cards: credit_cards.map((card) => ({...card, type: CREDIT_CARD_TYPE[card.type]})),
      discount_credit: credit,
      invoiced,
      discount_credit_type2,
      billing_info,
    })
  } catch (e) {
    next(e)
  }
}


const creditCardController = {
  list,
  addNew,
  listOnly,
  setDefault,
  deleteCreditCard,
}
export {
  creditCardController,
  getCreditCardsList,
  getTotalByUserID,
}
