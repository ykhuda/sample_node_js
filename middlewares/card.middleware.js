import {getDataByUid, getDiscountPercents} from "../api/v1/user/controllers/Users.js";
import {ErrorHandler} from "./error.js";
import constants from "../helpers/constants/constants.js";

const {INVALID_DATA} = constants;

const byCategory = async (req, res, next) => {
  try {
    const {headers: {authorization}, query: {where}} = req;
    const {locals: {platform}} = res;

    const isApp = platform === 'iOS/App' || platform === 'Android/App'

    const user = await getDataByUid(authorization);

    const {discount} = await getDiscountPercents(user);

    let category = [];
    if (where?.category_id) {
      category = where.category_id.split(',').map(i => (parseInt(i)))
    }

    if (category && (!Array.isArray(category) && typeof category !== 'number')) {
      throw new ErrorHandler(INVALID_DATA, 'category id error')
    }

    req.user = user || null;
    req.discount = discount;
    req.category = category;
    req.isApp = isApp;
    next();
  } catch (e) {
    next(e);
  }
}


export const cardMiddleware = {
  byCategory
}
