import db from '../../../../db/models'
import constants from '../../../../helpers/constants/constants.js'

const {verizonCategoryId} = constants

const getTemplateCategories = () => db.sequelize.query(
  'SELECT t.id, t.name FROM template_category t JOIN template where template.category_id=t.id and t.id <> :verizonCategoryId group by t.id',
  {
    type: db.Sequelize.QueryTypes.SELECT,
    replacements: {
      verizonCategoryId,
    },
  },
)

export const templateService = {
  getTemplateCategories,
}
