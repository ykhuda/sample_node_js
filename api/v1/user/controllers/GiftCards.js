import db from '../../../../db/models'
import {getUrl} from '../../../../helpers/utils/media/getUrl.js'
import constants from "../../../../helpers/constants/constants.js";

const {OK} = constants
const {env: {AWS_FOLDER_CARDIMAGE}} = process

const list = async (req, res, next) => {
  try {
    let giftCards = await db.gcard.findAll({
      include: [
        {
          model: db.denomination,
          attributes: {exclude: ['gcard_id']},
          where: {
            active: 1,
          },
        },
      ],
    })
    giftCards = JSON.parse(JSON.stringify(giftCards, null, 4))

    const giftCardsList = giftCards.map((gcard) => {
      return {
        ...gcard,
        image: getUrl(gcard.image, AWS_FOLDER_CARDIMAGE),
        denominations: gcard.denominations.map(d => ({
          id: +d.id,
          nominal: +d.nominal,
          price: +d.price,
          ...d,
        }))
      }
    })


    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      gcards: giftCardsList,
    })
  } catch (e) {
    next(e)
  }
}

export const giftCardController = {
  list,
}
