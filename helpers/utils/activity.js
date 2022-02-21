import db from '../../db/models'
import {destructQueries} from './model.utils.js'
import {ErrorHandler} from '../../middlewares/error.js'
import constants from '../constants/constants.js'

const {INVALID_DATA} = constants

/**
 * Log client/employee (admin) activity.
 * @param {object} req - node.js request object.
 * @param {string} table - name of db table to insert (user/employee)
 * @param {objeсt} - table name to log, controller/action names & id of manipulated objects.
 */
const log = (req, table, {controller, action, data}, t) => {
  if (!req.user) return
  const {user: {id: userId}} = req


  if (table === 'client') {
    const {headers, useragent: {platform}, connection: {remoteAddress}} = req
    const ip = (headers['x-forwarded-for'] || '').split(',')[0] || remoteAddress || null

    return db
      .client_activity
      .create({
        // if {id} is null the user is a guest
        user_id: userId,
        device: platform,
        ip,
      }, {transaction: t})
  }
  if (table === 'employee') {
    const {user_id, card_id} = data

    return db
      .employee_activity
      .create({
        employee_id: userId,
        object_id: data.id || null,
        parent_id: user_id || card_id || null,
        controller,
        action,
      })
  }

  throw new ErrorHandler(INVALID_DATA, `A table ${table} doesn't support activity logging`)
}

const getActivityByModel = async (model, id, query) => {
  const prop = model === 'client_activity' ? 'user_id' : 'employee_id'
  const page = query && +query.offset ? +query.offset : 1

  const {count, rows} = await db[model].findAndCountAll({
    where: {
      [prop]: id,
    },
    ...destructQueries(query),
  })

  return {
    rows,
    total: count,
    page,
  }
}

export {
  getActivityByModel,
  log,
}
