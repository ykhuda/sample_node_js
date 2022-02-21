import sequelize from "sequelize";

import db from '../../../../db/models'
import {ErrorHandler} from "../../../../middlewares/error.js";
import constants from "../../../../helpers/constants/constants.js";

const {INVALID_DATA, SUBSCRIPTIONS_STATUS} = constants
const {Op} = sequelize

const findSubscription = async (subscription_id, status = SUBSCRIPTIONS_STATUS.ACTIVE) => {
  const sub = await db.subscriptions.findOne({
    where: {
      id: subscription_id,
      status,
    },
    raw: true,
    nest: true
  })
  if (!sub) {
    throw new ErrorHandler(INVALID_DATA, 'no such subscription')
  }
  return sub
}

const findUserSubscription = async (id, user_id, status = SUBSCRIPTIONS_STATUS.ACTIVE, fullCopy = false) => {
  const us = await db.user_subscriptions.findByPk(id)

  if (!us) {
    throw new ErrorHandler(INVALID_DATA, 'no such user subscription')
  }
  return fullCopy ? JSON.parse(JSON.stringify(us, null, 4)) : us
}

const getActiveByUser = async (user_id, status = SUBSCRIPTIONS_STATUS.ACTIVE) => db.user_subscriptions.findOne({
  where: {
    user_id,
    status,
    expires_at: {[Op.gt]: sequelize.fn('now')},
    starts_at: {[Op.lte]: sequelize.fn('now')},
  },
  raw: true,
})

const stopAll = async (userID, t) => await Promise.all([stopAllNew(userID, t), db.user_subscriptions.update({extendability: 0}, {
  where: {
    user_id: userID,
    status: SUBSCRIPTIONS_STATUS.ACTIVE,
    expires_at: {[Op.gt]: sequelize.fn('now')}
  },
  transaction: t
})])

const stopAllNew = async (userID, t) => db.user_subscriptions.update({status: SUBSCRIPTIONS_STATUS.CANCELED}, {
  where: {
    user_id: userID,
    status: SUBSCRIPTIONS_STATUS.NEW,
    expires_at: {[Op.gt]: sequelize.fn('now')}
  },
  transaction: t
},)

const getLastActiveSubscription = async (userId, status = SUBSCRIPTIONS_STATUS.ACTIVE) => db.user_subscriptions.findAll({
  where: {
    user_id: userId,
    status,
  },
  attributes: ['id', 'expires_at', 'starts_at'],
  raw: true,
  nest: true,
  order: [['expires_at', 'DESC']]
})

const getLastNewSubscription = async (userId) => {
  const lastSubscription = await db.user_subscriptions.findAll({
    where: {
      user_id: userId,
      [Op.or]: [
        {status: 'NEW'},
        {
          [Op.and]: [
            {status: 'ACTIVE'},
            {
              starts_at: {
                [Op.gte]: sequelize.fn('now'),
              },
            },
          ],
        },
      ],
    },
    attributes: ['id', 'status', 'subscription_id', 'name', 'fee', 'period', 'credit2', 'discount', 'color', 'extendability', 'expires_at', 'starts_at'],
    order: [['id', 'DESC']],
    raw: true,
  })

  if (lastSubscription.length) return lastSubscription[0]

  return null
}

const getActiveFutureSubscription = (userId, status = SUBSCRIPTIONS_STATUS.ACTIVE) => db.user_subscriptions.findAll({
  where: {
    user_id: userId,
    status,
    starts_at: {[Op.gt]: sequelize.fn('now')}
  },
  order: ['id'],
  raw: true,
  nest: true,
})

const getSubscriptions = (status = SUBSCRIPTIONS_STATUS.ACTIVE) => db.subscriptions.findAll({
  where: {
    status,
  },
  attributes: ['id', 'name', 'description', 'cost_description', 'fee', 'taxable_amount', 'period', 'credit2', 'discount', 'is_best_value', 'plan_icon', 'color'],
  raw: true,
})

const getCurrentSubscription = (userId) => db.user_subscriptions.findOne({
  where: {
    user_id: userId,
    status: 'ACTIVE',
    expires_at: {
      [Op.gt]: sequelize.fn('now'),
    },
    starts_at: {
      [Op.lte]: sequelize.fn('now'),
    },
  },
  attributes: ['id', 'status', 'subscription_id', 'credit_card_id', 'taxable_amount', 'name', 'fee', 'period', 'credit2', 'discount', 'color', 'extendability', 'expires_at', 'starts_at'],
  raw: true,
})

const findAll = (where) => db.subscriptions.findAll({
  where: {
    ...where
  },
  raw: true,
  nest: true
})

const getForCheck = () => db.user_subscriptions.findAll({
  where: {
    extendability: 1,
    status: {[Op.in]: [SUBSCRIPTIONS_STATUS.NEW, SUBSCRIPTIONS_STATUS.ACTIVE]},
    expires_at: {
      [Op.and]: {
        [Op.gt]: sequelize.fn('date_add', sequelize.fn('now'), sequelize.literal('interval 22 hour')),
        [Op.lt]: sequelize.fn('date_add', sequelize.fn('now'), sequelize.literal(`interval next_hourly_attempt hour`)),
      }
    }
  },
  include: [
    {model: db.user},
    {model: db.credit_card},
  ],
  raw: true,
  nest: true,
})

const getForPay = () => db.user_subscriptions.findAll({
  where: {
    extendability: 1,
    status: {[Op.in]: [SUBSCRIPTIONS_STATUS.NEW, SUBSCRIPTIONS_STATUS.ACTIVE]},
    expires_at: {
      [Op.and]: {
        [Op.gt]: sequelize.fn('now'),
        [Op.lt]: sequelize.fn('date_add', sequelize.fn('now'), sequelize.literal('interval 4 hour')),
        [Op.lt]: sequelize.fn('date_add', sequelize.fn('now'), sequelize.literal(`interval next_hourly_attempt hour`)),
      }
    }
  },
  include: [
    {model: db.user},
    {model: db.credit_card},
  ],
  raw: true,
  nest: true,
})

const setExpiredStatus = (t) => db.user_subscriptions.update(
  {status: SUBSCRIPTIONS_STATUS.EXPIRED},
  {
    where: {
      status: {[Op.in]: [SUBSCRIPTIONS_STATUS.NEW, SUBSCRIPTIONS_STATUS.ACTIVE]},
      expires_at: {[Op.lt]: sequelize.fn('now')}
    },
    transaction: t
  })

export {
  findAll,
  stopAll,
  getForPay,
  stopAllNew,
  getForCheck,
  getActiveByUser,
  setExpiredStatus,
  findSubscription,
  getSubscriptions,
  findUserSubscription,
  getLastNewSubscription,
  getCurrentSubscription,
  getLastActiveSubscription,
  getActiveFutureSubscription
}
