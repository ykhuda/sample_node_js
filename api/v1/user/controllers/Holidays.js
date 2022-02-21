import db from '../../../../db/models'
import pkg from 'sequelize'

const {Op} = pkg


const getHolidays = async () => db.holidays.findAll({
  where: {
    date: {
      [Op.gte]: new Date(),
    },
  },
  raw: true,
})

export {
  getHolidays,
}
