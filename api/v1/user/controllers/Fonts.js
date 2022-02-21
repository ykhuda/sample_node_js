import sequelize from 'sequelize'
import lodash from 'lodash'

import db from '../../../../db/models'

const {Op} = sequelize

const getForCustomizer = async (req, res, next) => {
  try {

    res.status(200).json({
      httpCode: 200,
      status: 'ok',
      fonts: await db.custom_card_fonts.findAll()
    })
  } catch (e) {
    next(e)
  }

}

const list = async (req, res, next) => {
  try {
    const {user, query: {custom = false, html}} = req

    const fonts = await db.fonts_user_groups.findAll({
      where: {
        ...(user.group_id ? {
          user_group_id: {[Op.not]: user.group_id}
        } : {})
      },
      attributes: ['font_id'],
      raw: true
    })

    const fontId = fonts.map(({font_id}) => font_id)

    const fontsData = await db.fonts.findAll({
      where: {
        visible: 1,
        ...(custom ? {on_custom: 1} : {}),
        [Op.or]: [
          {font_id: {[Op.not]: fontId}},
        ]
      },
      include: [
        {
          model: db.fonts_user_groups,
        }
      ],
      order: [['label', 'ASC']]
    })

    const response = fontsData.map(({id, label, image, font_file, line_spacing, font_name, font_id}) => {
      return {
        id,
        label,
        image,
        font_name,
        path: font_file,
        font_id,
        ...(user && user.last_used_font && {last_used: user.last_used_font}),
        line_spacing: lodash.round(line_spacing, 2),
      }
    })

    res.status(200).json({
      httpCode: 200,
      status: 'ok',
      fonts: response,
    })
  } catch (e) {
    next(e)
  }
}
export const fontsController = {
  getForCustomizer,
  list
};
