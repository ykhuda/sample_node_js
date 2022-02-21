import constants from '../../../../helpers/constants/constants.js'
import {deleteEntity, transaction} from "../../../../helpers/utils/model.utils.js";
import db from "../../../../db/models";

const {versions, OK} = constants

const updateRequired = (client, version) => {
  const MINOR = 0

  let updateType = MINOR

  if (!updateAvailable(client, version)) {
    return MINOR
  }
  if (!versions[client]) {
    const obj = versions[client]

    for (const objKey in obj) {
      if (version >= objKey) {
        if (version === objKey) {
          break
        }
        if (obj[objKey] === 2) {
          updateType = 2
          break
        }
        if (obj[objKey] === 1) {
          updateType = 1
          break
        }
      }
    }

  }
  return updateType
}

const updateAvailable = (client, version) => {
  if (versions[client]) {
    const lastVersion = Math.max(+Object.keys(versions[client]))
    return version > lastVersion
  }
  return false
}

const index = (req, res, next) => {
  try {
    const {user} = req;
    const client = 'Project_name-Android'
    const appVersion = '1'

    const version = updateRequired(client, appVersion)
    let update
    if (version === 0) {
      update = {
        required: false, hard: false,
      }
    }
    if (version === 1) {
      update = {
        required: true, hard: false,
      }
    }
    if (version === 2) {
      update = {
        required: true, hard: true,
      }
    }
    res.status(OK).json({
      httpCode: OK, status: 'ok', update, tags: [{
        placeholder: '{{firstname}}', label: 'First Name',
      }, {
        placeholder: '{{lastname}}', label: 'Last Name',
      }, {
        placeholder: '{{businessname}}', label: 'Business Name',
      },],
    })
  } catch (e) {
    next(e)
  }
}

const orderConfig = (req, res, next) => transaction(async t => {
  try {
    const {user, body: {configs = []}} = req;

    const insertList = [];
    for (const config of configs) {
      const {
        card_id,
        font_id,
        message,
        font_size,
        retail_tag,
        wishes = null,
        signature_id,
        signature2_id,
        event,
        status,
      } = config;

      insertList.push([
        user.id,
        card_id,
        message,
        font_id,
        font_size,
        retail_tag,
        signature_id ? signature_id : null,
        signature2_id ? signature2_id : null,
        wishes,
        event,
        status,
      ])
    }

    await deleteEntity('order_config', {user_id: user.id}, t)

    await db.sequelize.query(`INSERT INTO \`order_config\` (user_id,card_id,message,font_id,font_size,retail_tag,signature_id,signature2_id,wishes,event,status) VALUES :list `, {
      type: db.Sequelize.QueryTypes.INSERT,
      transaction: t,
      replacements: {
        list: insertList,
      },
    })

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      config: insertList
    });
  } catch (e) {
    next(e)
  }
})

const orderConfigList = async (req, res, next) => {
  try {
    const {user} = req;

    const list = await db.order_config.findAll({where: {user_id: user.id}, raw: true})

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      list,
    })
  } catch (e) {
    next(e)
  }
}

export const configController = {
  index,
  orderConfig,
  orderConfigList
}
