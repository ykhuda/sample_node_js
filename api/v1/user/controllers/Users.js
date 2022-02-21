import db from '../../../../db/models'
import jwt from 'jsonwebtoken'
import constants from "../../../../helpers/constants/constants.js";
import {validatePassword} from "../../../../helpers/utils/crypto.js";
import {getTotalByUserID} from "./CreditCards.js";

const {
  JWT_KEY,
  STATUS_NOACTIVE,
  SUBSCRIPTIONS_STATUS,
  STATUS_BANNED,
  STATUS_VERIZON
} = constants

// models
const {Sequelize: {Op, fn, col}} = db

/**
 * Get data by uid from Authorization header
 * @param {string} uid - 32 byte token
 * @returns {boolean}
 */
const getDataByUid = async (uid) => {
  if (!uid) return false

  const authData = await db.auth_uid.findOne(
    {
      where: {uid},
      raw: true,
      include: 'user',
      nest: true,
    },
  )
  return authData?.user ?? null
}

/**
 * Get total discount from subscription plan
 * @param {object} user - an object of authorizaed user
 * @returns {number} - quantity
 * @returns {object} - initial object with default props
 */
const getSubscriptionDiscount = async ({id}, count, initObj) => {
  const sub = await db.user_subscriptions.findOne({
    where: {
      user_id: id,
      status: SUBSCRIPTIONS_STATUS.ACTIVE,
      expires_at: {
        [Op.gt]: new Date(),
      },
      starts_at: {
        [Op.lte]: new Date(),
      },
    },
  })

  if (sub) {
    const {discount} = sub

    return {
      ...initObj,
      value: +discount,
    }
  }

  return initObj
}

/**
 * Get total discount from user groups
 * @param {object} user - an object of authorizaed user
 * @returns {number} - quantity
 * @returns {object} - initial object with default props
 */
const getUserGroupDiscount = async (user, count, initObj) => {
  // testing
  if (user && await getTotalByUserID(user.id) <= 0) {
    const {group_id} = user;

    const discounts = await db.discount_rule.findAll({
      where: {
        user_group_id: {
          [Op.or]: [group_id, null],
        },
      },
      order: [['min_number', 'ASC']],
      raw: true,
    })


    const {withGroups, withoutGroups} = discounts.reduce((acc, discount) => {
      const {user_group_id} = discount

      if (user_group_id) {
        acc.withGroups.push(discount)
        return acc
      }

      acc.withoutGroups.push(discount)
      return acc
    }, {withGroups: [], withoutGroups: []})

    const resultArray = !(group_id && withGroups.length > 0) ? withoutGroups : withGroups
    const result = []

    resultArray.forEach(({min_number, discount}, i, {length}) => {
      let max = 0
      if (i + 1 < length) {
        max = resultArray[i + 1].min_number - 1
      } else {
        max = 'infinity'
      }
      // if ((count === null || count >= min_number) && (max === 0 || count <= max)) {
      result.push({
        min: min_number,
        value: discount,
        max,
      })
      // }
    })

    return result
  }

  return [initObj]
}

/**
 * Compare discounts and calculate total amount of discount
 * @param {object} user - an object of authorizaed user
 * @returns {number} - quantity
 * @returns {object} - initial object with default props
 */
const getDiscountPercents = async (user, quantity = 1) => {
  if (!user) return {discount: 0, intervals: 0}
  const initDiscountObj = {
    min: 0,
    max: 0,
    value: 0,
  }
  // Get discounts
  const [subscribe, user_groups] = await Promise.all([
    getSubscriptionDiscount(user, quantity, initDiscountObj),
    getUserGroupDiscount(user, quantity, initDiscountObj),
  ])
  const discountGroup = user_groups ? user_groups : []
  const intervals = [subscribe, ...discountGroup]

  let {filterIntervals, discount} = intervals.reduce((acc, interval) => {
    interval.min > 1 && acc.filterIntervals.push(interval);

    if ((!interval.min && !interval.max) ||
      (interval.min <= quantity && (quantity <= interval.max || interval.max === 'infinity') && acc.discount < interval.value)) {
      acc.discount = interval.value
    }

    return acc
  }, {filterIntervals: [], discount: 0})

  return {
    discount,
    intervals: filterIntervals,
  }
}

const authenticate = async (identity) => {
  let {username, password, uid, token} = identity;

  let user = null;
  let auth = null;
  let errorCode;
  let id = null;
  if (username) {
    user = await db.user.findOne({where: {login: username}, raw: true})
  } else if (uid) {
    auth = await getDataByUid(uid)
  } else if (token) {
    const key = decodeToken(token);
    if (key) {
      auth = await getDataByUid(key.uid)
    }
  }

  if (auth) {
    //todo refresh session
    user = auth.user
  }

  if (!user) {
    errorCode = 'auth error';
  } else if (!password) {
    id = user.id;
    errorCode = 0;
  } else {
    if (user.status === STATUS_VERIZON) {
      errorCode = 'verizon user'
    } else if (!await validatePassword(password, user.password)) {
      errorCode = 'Password is incorrect.'
    } else if (user.status === STATUS_BANNED) {
      errorCode = 'banned'
    } else if (user.status === STATUS_NOACTIVE) {
      errorCode = 'not activated'
    } else {
      id = user.id;
      errorCode = 0;
    }
  }

  if (errorCode) {
    return {
      status: false,
      errorMessage: errorCode,
    }
  }

  return {
    status: true,
    id,
    user,
  }

}

const decodeToken = (token) => {
  try {
    const json = jwt.verify(`Bearer ${token}`, JWT_KEY, {algorithms: ['HS256']});
    if (json) {
      return {
        id: json.id,
        uid: json.uid,
      }
    } else {
      return null
    }
  } catch (e) {
    return null
  }
}
export {
  decodeToken,
  getDataByUid,
  getDiscountPercents,
  getSubscriptionDiscount,
  getUserGroupDiscount,
  authenticate
}
