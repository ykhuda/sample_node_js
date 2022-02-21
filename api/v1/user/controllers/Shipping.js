import constants from "../../../../helpers/constants/constants.js";
import db from "../../../../db/models";

const {OK} = constants;
const rates = async (req, res, next) => {
  try {

    const list = await db.shipping_rates.findAll({
      where: {status: 1},
      order: [['sort_order', 'ASC']],
      raw: true,
      nest: true
    });

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      list,
    })
  } catch (e) {
    next(e)
  }
}

const methods = async (req, res, next) => {
  try {
    const methods = await db.shipping_methods.findAll({
      where: {status: 1},
      order: [['sort_order', 'ASC']],
      raw: true,
      nest: true
    })

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      methods,
    })
  } catch (e) {
    next(e)
  }
}
export const shippingController = {
  methods,
  rates,
}
