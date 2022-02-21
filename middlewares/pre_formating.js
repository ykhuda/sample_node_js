import constants from "../helpers/constants/constants.js";
import sequelize from "sequelize";

const {LIMIT} = constants;
const {Op} = sequelize;

const query = (byEntity) => (req, res, next) => {
  try {
    let {query: {page = 1, limit, offset = null, search = null, ...restQuery}} = req;

    //set limit
    switch (byEntity) {
      case 'card':
        limit = limit ? limit : LIMIT.card;
        break;
      case 'past_order':
        limit = limit ? limit : LIMIT.order;
        //search to pastOrder
        search = search ? {[Op.like]: `%${search}%`} : null
        break;
      default:
        limit = limit ? limit : LIMIT.default;
        break;
    }

    //count offset
    let offset_pagination = (+page - 1) * limit;

    //count skip entity when cancel order
    if (byEntity === 'past_order' && offset) offset_pagination -= offset

    req.query = {page: +page, limit: +limit, offset: offset_pagination, search, ...restQuery};

    next()
  } catch (e) {
    next(e)
  }
}

export const preFormating = {
  query
}

