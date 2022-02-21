import sequelize from "sequelize";

import db from "../../../../db/models";
import {ErrorHandler} from "../../../../middlewares/error.js";
import constants from "../../../../helpers/constants/constants.js";

const {INVALID_DATA} = constants
const {Op} = sequelize

const getFont = async (font) => {
  const fontModel = await db.fonts.findOne({
    where: {
      [Op.or]: [
        {font_name: font},
        {id: font},
        {font_id: font},
      ]
    }, raw: true
  })

  if (!fontModel) {
    throw new ErrorHandler(INVALID_DATA, 'font not found')
  }
  return fontModel
}

export const fontService = {
  getFont
}
