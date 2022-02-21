import db from "../../../../db/models";

import {ErrorHandler} from '../../../../middlewares/error.js'
import constants from '../../../../helpers/constants/constants.js'

import {isCustom, isCustomized} from '../../admin/controllers/Cards.js'
import {findEntity, simpleUpdateEntity} from '../../../../helpers/utils/model.utils.js'
import {getUrl} from "../../../../helpers/utils/media/getUrl.js";
import {getCard} from "../services/cards.service.js";

const {INVALID_DATA, NOT_FOUND, OK,} = constants

const customizedCard = async (req, res, next) => {
  try {
    const {query: {id}} = req

    if (!id || id === 0) throw new ErrorHandler(INVALID_DATA, 'Card id is not set.')

    const card = await findCustomCard(id)

    if (!card) throw new ErrorHandler(NOT_FOUND, 'Card is not found.')

    const {
      category,
      cover,
      orientation,
      half_inside,
      totalImages,
      cover_lowres,
      custom_card_meta = null,
      custom_card_infos = null,
      ...rest
    } = card

    const [meta] = custom_card_meta ? custom_card_meta : []
    const [info] = custom_card_infos ? custom_card_infos : []

    if (!isCustomized(category) && !isCustom(category)) {
      throw new ErrorHandler(INVALID_DATA, 'Card is not in customized category.')
    }

    const backImage = totalImages.find(({type}) => type === 'back')
    const insideImage = isCustomized(category) && orientation === 'F' && backImage && backImage.image

    res.status(200).json({
      httpCode: 200,
      status: 'ok',
      card: {
        ...rest,
        half_inside: getUrl(half_inside),
        cover: getUrl(cover),
        cover_lowres: getUrl(cover_lowres),
        image_inside: (insideImage ? getUrl(backImage.image) : isCustom(category) ? getUrl(info?.original_back) : null) || getUrl(half_inside) || null,
        ...(info ? {
          customCardInfo: {
            ...info,
            canvas_data: info.canvas_data ? JSON.parse(info.canvas_data) : null,
            header_font_color: info.header_font_color || '#000000',
            footer_font_color: info.footer_font_color || '#000000',
          }
        } : {}),
        ...(meta ? {
          meta: {
            ...meta,
            products: meta.products && JSON.parse(meta.products),
          },
        } : {}),
      }
    })
  } catch (e) {
    next(e)
  }
}

const getCustomCard = async (id) => {
  if (!id || id === 0) {
    throw new ErrorHandler(NOT_FOUND, 'Card id is not set.')
  }

  const card = await findEntity('card', null, {id}, [
    {model: 'category', attributes: ['id', 'taxonomy']},
  ])

  if (!card) {
    throw new ErrorHandler(NOT_FOUND, 'Card is not found.')
  }

  if (!isCustom(card.category)) {
    throw new ErrorHandler(NOT_FOUND, 'Card is not in custom category.')
  }

  return card
}


const findCustomCard = async (id) => {
  const response = await db.card.findOne({
    where: {
      id: id,
    },
    include: [
      {
        model: db.category,
        attributes: ['id', 'taxonomy'],
      },
      {
        model: db.card_image,
        as: 'totalImages',
        attributes: ['image', 'type'],
      },
      {
        model: db.custom_card_info,
      },
      {
        model: db.custom_card_meta,
      },
    ],
  })
  return JSON.parse(JSON.stringify(response, null, 4))
}

const customCard = async (req, res, next) => {
  try {
    const {id} = req.query

    res.status(200).json({
      httpCode: 200,
      status: 'ok',
      card: await getCustomCard(id),
    })
  } catch (e) {
    next(e);
  }
}

const softDelete = async (req, res, next) => {
  try {
    const {body: {id}, user} = req;

    if (!id) throw new ErrorHandler(INVALID_DATA, 'id not set');

    const card = await getCard(id, user.id, {taxonomy: 'CUSTOM'})

    if (!card) throw new ErrorHandler(NOT_FOUND, 'Card id is not found.')

    await simpleUpdateEntity('card', {id}, {status: 1})

    res.status(OK).json({
      httpCode: 200,
      status: 'ok',
      card: card
    })
  } catch (e) {
    next(e)
  }
}

const designController = {
  customizedCard,
  customCard,
  softDelete
}

export {
  designController,
  getCustomCard,
}
