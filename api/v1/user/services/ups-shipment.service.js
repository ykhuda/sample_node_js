import sequelize from "sequelize";

import db from "../../../../db/models";
import {ErrorHandler} from "../../../../middlewares/error.js";
import constants from "../../../../helpers/constants/constants.js";
import {simpleUpdateEntity} from "../../../../helpers/utils/model.utils.js";

const {SERVER_ERROR} = constants;
const {Op} = sequelize;

const getNextForDropImage = async (worker_id) => {
  await db.ups_shipments.update(
    {
      worker_id,
      started_at: sequelize.fn('now'),
    },
    {
      where: {
        label_image_url: {[Op.not]: null},
        [Op.or]: [
          {status: {[Op.in]: ['canceled', 'voided']}},
          {
            status: 'generated',
            generated_at: {[Op.lt]: sequelize.fn('date_add', sequelize.fn('now'), sequelize.literal('interval -30 day'))},
          }
        ],
        [Op.or]: [
          {started_at: {[Op.is]: null}},
          {started_at: {[Op.lt]: sequelize.fn('date_add', sequelize.fn('now'), sequelize.literal('interval -1 minute'))}},
        ]
      },
      order: [['id', 'ASC']],
      limit: 1
    })

  return db.ups_shipments.findOne({where: {worker_id}, raw: true})
}

const getNextForHandling = async (status, worker_id) => {
  await db.ups_shipments.update(
    {
      worker_id,
      started_at: sequelize.fn('now'),
    },
    {
      where: {
        status,
        [Op.or]: [
          {started_at: {[Op.is]: null}},
          {started_at: {[Op.lt]: sequelize.fn('date_add', sequelize.fn('now'), sequelize.literal('interval -1 minute'))}},
        ],
        ...(status === 'canceled' ? {generated_at: {[Op.lt]: sequelize.fn('date_add', sequelize.fn('now'), sequelize.literal('interval -1 day'))}} : {})
      },
      order: [['id', 'ASC']],
      limit: 1
    })

  return db.ups_shipments.findOne({where: {worker_id, status}, raw: true})
}

export const upsShipmentService = {
  getNextForDropImage,
  getNextForHandling
}
